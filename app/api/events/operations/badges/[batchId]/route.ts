import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { presignGet } from '@/app/lib/kb/storage'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'
import { hasSectionAccessForEvent } from '@/app/lib/ops/section-access'
import { sendVendorBadgeBatchAvailable } from '@/app/lib/ops/vendor-auth/mail'
import { ACTIVE_DISPATCH, getSupportContactsForEvent, loadDispatch, printVendorsForEvent, type DispatchRow } from '@/app/lib/badges/dispatch'
import { knownStaffId, loadBatch, loadItems } from '@/app/lib/badges/service'

/* Ops > Badge Printing, one batch.
   GET  /api/events/operations/badges/[batchId]            batch + previews + hand-offs + vendors + activity
   GET  .../[batchId]?download=<dispatchId>                presigned link to that hand-off's frozen print file (staff re-review)
   POST .../[batchId] { action: 'send', dispatch_id, vendor_id } | { action: 'revoke' | 'resend', dispatch_id }
   Gate: admin, ops.badges.view, or assigned to the Badge Printing section (assignment also allows the actions). */

async function gate(req: NextRequest, batchId: string) {
  const batch = await loadBatch(batchId)
  if (!batch) return { error: NextResponse.json({ error: 'Batch not found.' }, { status: 404 }) }
  const session = getSession(req)
  if (!(await hasSectionAccessForEvent(session, batch.event_id, 'badges'))) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  return { batch, session }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const g = await gate(req, batchId)
  if ('error' in g) return g.error
  const { batch } = g

  const dl = req.nextUrl.searchParams.get('download')
  if (dl) {
    const d = await loadDispatch(dl)
    if (!d || d.batch_id !== batchId) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    await logOpsAccess({ eventId: batch.event_id, actorType: 'staff', actorId: await knownStaffId(g.session?.sid), action: 'badge_file_viewed_by_ops', targetType: 'badge_dispatch', targetId: d.id, ip: clientIp(req) })
    return NextResponse.json({ url: await presignGet(d.pdf_key), filename: `${batch.name.replace(/[^a-z0-9]+/gi, '-')}-print-v${d.pdf_version}.pdf` })
  }

  const [{ data: ev }, items, { data: dispatches }, vendors, { data: audit }] = await Promise.all([
    supabaseAdmin.from('events').select('name').eq('id', batch.event_id).single(),
    loadItems(batchId),
    supabaseAdmin.from('badge_print_dispatches').select('*, ops_vendors(name)').eq('batch_id', batchId).order('requested_at', { ascending: false }),
    printVendorsForEvent(batch.event_id),
    supabaseAdmin.from('ops_access_audit').select('action, actor_type, created_at, meta, target_id').eq('target_type', 'badge_dispatch').in('target_id', ((await supabaseAdmin.from('badge_print_dispatches').select('id').eq('batch_id', batchId)).data ?? []).map(d => d.id as string)).order('created_at', { ascending: false }).limit(40),
  ])
  return NextResponse.json({
    batch: { id: batch.id, name: batch.name, status: batch.status, event_id: batch.event_id, event_name: ev?.name ?? '', template_name: batch.template_snapshot.name, canvas_width: batch.template_snapshot.canvas_width, canvas_height: batch.template_snapshot.canvas_height, print: batch.template_snapshot.print },
    items: items.filter(i => !i.removed).map(i => ({ id: i.id, name: i.overrides.name ?? i.name, preview_url: i.preview_url })),
    dispatches: (dispatches ?? []).map(d => ({ ...d, vendor_name: ((Array.isArray(d.ops_vendors) ? d.ops_vendors[0] : d.ops_vendors) as { name?: string } | null)?.name ?? null, ops_vendors: undefined, pdf_key: undefined })),
    vendors, audit: audit ?? [],
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const g = await gate(req, batchId)
  if ('error' in g) return g.error
  const { batch } = g
  const body = await req.json().catch(() => null) as { action?: string; dispatch_id?: string; vendor_id?: string } | null
  const d: DispatchRow | null = body?.dispatch_id ? await loadDispatch(body.dispatch_id) : null
  if (!body?.action || !d || d.batch_id !== batchId) return NextResponse.json({ error: 'Hand-off not found.' }, { status: 404 })
  const staffId = await knownStaffId(g.session?.sid)
  const audit = (action: string, meta?: Record<string, unknown>) => logOpsAccess({ eventId: batch.event_id, actorType: 'staff', actorId: staffId, action, targetType: 'badge_dispatch', targetId: d.id, meta, ip: clientIp(req) })
  const now = new Date().toISOString()

  if (body.action === 'send') {
    if (d.status !== 'requested') return NextResponse.json({ error: 'This print file has already been sent.' }, { status: 409 })
    const vendors = await printVendorsForEvent(batch.event_id)
    const vendor = vendors.find(v => v.id === body.vendor_id)
    if (!vendor) return NextResponse.json({ error: 'Choose a print vendor assigned to this event (Operations > Vendors, category Print).' }, { status: 400 })
    if (vendor.logins === 0) return NextResponse.json({ error: `${vendor.name} has no portal login yet. Create one under Vendors first.` }, { status: 409 })
    const { data: moved } = await supabaseAdmin.from('badge_print_dispatches').update({ status: 'sent', vendor_id: vendor.id, sent_by: staffId, sent_at: now }).eq('id', d.id).eq('status', 'requested').select('id')
    if (!moved?.length) return NextResponse.json({ error: 'This print file was just sent by someone else.' }, { status: 409 })
    await audit('badge_dispatch_sent', { vendor_id: vendor.id })
    const { data: users } = await supabaseAdmin.from('ops_vendor_users').select('name, email').eq('vendor_id', vendor.id).neq('status', 'disabled')
    const contacts = await getSupportContactsForEvent(batch.event_id)
    const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', batch.event_id).single()
    await Promise.all((users ?? []).map(u => sendVendorBadgeBatchAvailable({ to: u.email, name: u.name, eventName: ev?.name ?? 'the event', batchName: batch.name, badges: d.badges, contacts }).catch(e => console.error('[badges] vendor mail failed:', e))))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'revoke') {
    if (!ACTIVE_DISPATCH.includes(d.status)) return NextResponse.json({ error: 'This hand-off is already finished.' }, { status: 409 })
    await supabaseAdmin.from('badge_print_dispatches').update({ status: 'revoked', revoked_by: staffId, revoked_at: now }).eq('id', d.id).in('status', ACTIVE_DISPATCH)
    await audit('badge_dispatch_revoked', { was: d.status })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'resend') {
    if (d.status !== 'sent' && d.status !== 'downloaded') return NextResponse.json({ error: 'Only a sent hand-off can be re-announced.' }, { status: 409 })
    const { data: users } = await supabaseAdmin.from('ops_vendor_users').select('name, email').eq('vendor_id', d.vendor_id!).neq('status', 'disabled')
    const contacts = await getSupportContactsForEvent(batch.event_id)
    const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', batch.event_id).single()
    await Promise.all((users ?? []).map(u => sendVendorBadgeBatchAvailable({ to: u.email, name: u.name, eventName: ev?.name ?? 'the event', batchName: batch.name, badges: d.badges, contacts })))
    await audit('badge_dispatch_resent')
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
