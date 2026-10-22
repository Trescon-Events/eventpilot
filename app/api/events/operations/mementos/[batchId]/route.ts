import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'
import { hasSectionAccessForEvent } from '@/app/lib/ops/section-access'
import { sendVendorMementoAvailable } from '@/app/lib/ops/vendor-auth/mail'
import { getSupportContactsForEvent } from '@/app/lib/badges/dispatch'
import { ACTIVE_MEMENTO_DISPATCH, loadMementoDispatch, mementoVendorsForEvent, type MementoDispatchRow } from '@/app/lib/mementos/dispatch'
import { buildMementoZip, PhotoFetchError } from '@/app/lib/mementos/zip'
import { knownStaffId } from '@/app/lib/badges/service'

/* Ops > Mementos, one batch.
   GET  /api/events/operations/mementos/[batchId]               batch + speakers + hand-offs + vendors + activity
   GET  .../[batchId]?download=1                                the batch's Cleaned Photos as a ZIP, streamed (staff re-review; audited)
   POST .../[batchId] { action: 'send', dispatch_id, vendor_id } | { action: 'revoke' | 'resend' | 'reopen', dispatch_id }
   Gate: admin, ops.mementos.view, or assigned to the Mementos section (assignment also allows the actions). */

async function gate(req: NextRequest, batchId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return { error: NextResponse.json({ error: 'Batch not found.' }, { status: 404 }) }
  const { data: batch } = await supabaseAdmin.from('memento_batches').select('id, name, event_id, status, note').eq('id', batchId).maybeSingle()
  if (!batch) return { error: NextResponse.json({ error: 'Batch not found.' }, { status: 404 }) }
  const session = getSession(req)
  if (!(await hasSectionAccessForEvent(session, batch.event_id as string, 'mementos'))) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  return { batch: batch as { id: string; name: string; event_id: string; status: string; note: string | null }, session }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const g = await gate(req, batchId)
  if ('error' in g) return g.error
  const { batch } = g

  const { data: items } = await supabaseAdmin.from('memento_batch_items').select('speaker_id, speaker_name, photo_url').eq('batch_id', batchId).order('speaker_name')

  if (req.nextUrl.searchParams.get('download')) {
    await logOpsAccess({ eventId: batch.event_id, actorType: 'staff', actorId: await knownStaffId(g.session?.sid), action: 'memento_files_viewed_by_ops', targetType: 'memento_batch', targetId: batchId, ip: clientIp(req) })
    try {
      const stream = await buildMementoZip((items ?? []).filter(i => i.photo_url).map(i => ({ name: i.speaker_name as string, url: i.photo_url as string })))
      const safe = batch.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'mementos'
      return new NextResponse(stream, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${safe}-photos.zip"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
    } catch (e) {
      return NextResponse.json({ error: e instanceof PhotoFetchError ? e.message : 'Could not build the photo pack.' }, { status: 424 })
    }
  }

  const dispatchIds = ((await supabaseAdmin.from('memento_dispatches').select('id').eq('batch_id', batchId)).data ?? []).map(d => d.id as string)
  const [{ data: ev }, { data: dispatches }, vendors, { data: audit }] = await Promise.all([
    supabaseAdmin.from('events').select('name').eq('id', batch.event_id).single(),
    supabaseAdmin.from('memento_dispatches').select('*, ops_vendors(name)').eq('batch_id', batchId).order('requested_at', { ascending: false }),
    mementoVendorsForEvent(batch.event_id),
    dispatchIds.length
      ? supabaseAdmin.from('ops_access_audit').select('action, actor_type, created_at, meta, target_id').eq('target_type', 'memento_dispatch').in('target_id', dispatchIds).order('created_at', { ascending: false }).limit(40)
      : Promise.resolve({ data: [] as { action: string; actor_type: string; created_at: string; meta: Record<string, unknown> | null; target_id: string }[] }),
  ])
  return NextResponse.json({
    batch: { id: batch.id, name: batch.name, note: batch.note, status: batch.status, event_id: batch.event_id, event_name: ev?.name ?? '' },
    items: (items ?? []).map(i => ({ speaker_id: i.speaker_id, name: i.speaker_name, photo_url: i.photo_url })),
    dispatches: (dispatches ?? []).map(d => ({ ...d, vendor_name: ((Array.isArray(d.ops_vendors) ? d.ops_vendors[0] : d.ops_vendors) as { name?: string } | null)?.name ?? null, ops_vendors: undefined })),
    vendors, audit: audit ?? [],
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const g = await gate(req, batchId)
  if ('error' in g) return g.error
  const { batch } = g
  const body = await req.json().catch(() => null) as { action?: string; dispatch_id?: string; vendor_id?: string } | null
  const d: MementoDispatchRow | null = body?.dispatch_id ? await loadMementoDispatch(body.dispatch_id) : null
  if (!body?.action || !d || d.batch_id !== batchId) return NextResponse.json({ error: 'Hand-off not found.' }, { status: 404 })
  const staffId = await knownStaffId(g.session?.sid)
  const audit = (action: string, meta?: Record<string, unknown>) => logOpsAccess({ eventId: batch.event_id, actorType: 'staff', actorId: staffId, action, targetType: 'memento_dispatch', targetId: d.id, meta, ip: clientIp(req) })
  const now = new Date().toISOString()

  async function mailVendor(vendorId: string) {
    const { data: users } = await supabaseAdmin.from('ops_vendor_users').select('name, email').eq('vendor_id', vendorId).neq('status', 'disabled')
    const contacts = await getSupportContactsForEvent(batch.event_id)
    const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', batch.event_id).single()
    await Promise.all((users ?? []).map(u => sendVendorMementoAvailable({ to: u.email, name: u.name, eventName: ev?.name ?? 'the event', batchName: batch.name, speakers: d!.speakers, contacts }).catch(e => console.error('[mementos] vendor mail failed:', e))))
  }

  if (body.action === 'send') {
    if (d.status !== 'requested') return NextResponse.json({ error: 'This batch has already been sent.' }, { status: 409 })
    const vendors = await mementoVendorsForEvent(batch.event_id)
    const vendor = vendors.find(v => v.id === body.vendor_id)
    if (!vendor) return NextResponse.json({ error: 'Choose a memento vendor assigned to this event (Operations > Vendors, category Memento).' }, { status: 400 })
    if (vendor.logins === 0) return NextResponse.json({ error: `${vendor.name} has no portal login yet. Create one under Vendors first.` }, { status: 409 })
    const { data: moved } = await supabaseAdmin.from('memento_dispatches').update({ status: 'sent', vendor_id: vendor.id, sent_by: staffId, sent_at: now }).eq('id', d.id).eq('status', 'requested').select('id')
    if (!moved?.length) return NextResponse.json({ error: 'This batch was just sent by someone else.' }, { status: 409 })
    await audit('memento_dispatch_sent', { vendor_id: vendor.id })
    await mailVendor(vendor.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'revoke') {
    if (!ACTIVE_MEMENTO_DISPATCH.includes(d.status)) return NextResponse.json({ error: 'This hand-off is already finished.' }, { status: 409 })
    await supabaseAdmin.from('memento_dispatches').update({ status: 'revoked', revoked_by: staffId, revoked_at: now }).eq('id', d.id).in('status', ACTIVE_MEMENTO_DISPATCH)
    // The batch goes back to a draft so the producer can adjust it and push it again.
    await supabaseAdmin.from('memento_batches').update({ status: 'draft', pushed_at: null }).eq('id', batchId)
    await audit('memento_dispatch_revoked', { was: d.status })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'resend') {
    if (d.status !== 'sent' && d.status !== 'downloaded') return NextResponse.json({ error: 'Only a sent hand-off can be re-announced.' }, { status: 409 })
    await mailVendor(d.vendor_id!)
    await audit('memento_dispatch_resent')
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'reopen') {
    if (d.status !== 'issue') return NextResponse.json({ error: 'Only a hand-off with a reported problem can be reopened.' }, { status: 409 })
    const { data: moved } = await supabaseAdmin.from('memento_dispatches').update({ status: 'sent', vendor_response_at: null, vendor_response_by: null }).eq('id', d.id).eq('status', 'issue').select('id')
    if (!moved?.length) return NextResponse.json({ error: 'This hand-off changed in the meantime.' }, { status: 409 })
    await audit('memento_dispatch_reopened')
    await mailVendor(d.vendor_id!)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
