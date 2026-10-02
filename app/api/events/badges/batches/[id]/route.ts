import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { CreativeTemplateConfig } from '@/app/lib/announcements/composite'
import { deleteObject } from '@/app/lib/kb/storage'
import { deletePublicAssetByUrl } from '@/app/lib/events/storage'
import { knownStaffId, loadBatch, loadItems, requireBadgePermission, sweepDeadJobs } from '@/app/lib/badges/service'

/* GET    .../batches/[id]  -> batch + items + latest jobs (the review page's one data call)
   PATCH  .../batches/[id]  { name? } | { action: 'approve' | 'reopen' | 'refresh_speakers' | 'update_template' }
   DELETE .../batches/[id]  { confirm: 'DELETE' }  (typed confirmation, per Madhu's standing rule) */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.view')
  if ('error' in auth) return auth.error
  await sweepDeadJobs(id)
  const [items, { data: jobs }, { data: dispatches }] = await Promise.all([
    loadItems(id),
    supabaseAdmin.from('badge_jobs').select('*').eq('batch_id', id).order('created_at', { ascending: false }).limit(6),
    supabaseAdmin.from('badge_print_dispatches').select('id, status, pdf_version, badges, requested_at, sent_at, printed_confirmed_at').eq('batch_id', id).order('requested_at', { ascending: false }).limit(5),
  ])
  const { template_snapshot, ...rest } = batch
  return NextResponse.json({
    batch: { ...rest, print: template_snapshot.print, template_name: template_snapshot.name, canvas_width: template_snapshot.canvas_width, canvas_height: template_snapshot.canvas_height },
    items, jobs: jobs ?? [], dispatches: dispatches ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const body = await req.json().catch(() => null) as { name?: string; action?: string } | null
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  const now = new Date().toISOString()

  if (body.action === 'approve' || body.action === 'reopen') {
    const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.approve')
    if ('error' in auth) return auth.error
    if (body.action === 'reopen') {
      const { data: live } = await supabaseAdmin.from('badge_print_dispatches').select('id').eq('batch_id', id).in('status', ['requested', 'sent', 'downloaded']).limit(1)
      if (live?.length) return NextResponse.json({ error: 'This batch has been handed to Operations or the printer. Ask Ops to revoke the hand-off before reopening it.' }, { status: 409 })
      if (batch.status !== 'approved') return NextResponse.json({ error: 'The batch is not approved.' }, { status: 409 })
      await supabaseAdmin.from('badge_batches').update({ status: 'review', approved_by: null, approved_at: null, updated_at: now }).eq('id', id)
      return NextResponse.json({ ok: true })
    }
    const items = (await loadItems(id)).filter(i => !i.removed)
    if (items.length === 0) return NextResponse.json({ error: 'The batch has no badges.' }, { status: 409 })
    const stale = items.filter(i => i.preview_stale || !i.preview_url)
    if (stale.length) return NextResponse.json({ error: `${stale.length} badge${stale.length === 1 ? ' has' : 's have'} not been rendered since the last change. Render them first.` }, { status: 409 })
    const pending = items.filter(i => !i.approved)
    if (pending.length) return NextResponse.json({ error: `${pending.length} badge${pending.length === 1 ? ' is' : 's are'} not approved yet.` }, { status: 409 })
    await supabaseAdmin.from('badge_batches').update({ status: 'approved', approved_by: await knownStaffId(auth.session.sid), approved_at: now, updated_at: now }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error
  if (batch.status === 'approved') return NextResponse.json({ error: 'The batch is approved. Reopen it to make changes.' }, { status: 409 })

  if (body.action === 'refresh_speakers') {
    const items = await loadItems(id)
    const ids = items.map(i => i.speaker_id).filter((x): x is string => !!x)
    const { data: speakers } = ids.length
      ? await supabaseAdmin.from('event_speakers').select('id, public_name, name, role, company, country, photo_processed_url, photo_head_box').in('id', ids)
      : { data: [] }
    let changed = 0
    for (const it of items) {
      const s = (speakers ?? []).find(x => x.id === it.speaker_id)
      if (!s) continue
      const next = {
        name: ((s.public_name as string | null) || (s.name as string | null) || '').trim() || null,
        title: s.role as string | null, company: s.company as string | null, country: s.country as string | null,
        photo_url: s.photo_processed_url as string | null, photo_head_box: s.photo_head_box,
      }
      if (JSON.stringify(next) === JSON.stringify({ name: it.name, title: it.title, company: it.company, country: it.country, photo_url: it.photo_url, photo_head_box: it.photo_head_box })) continue
      await supabaseAdmin.from('badge_batch_items').update({ ...next, preview_stale: true, approved: false }).eq('id', it.id)
      changed++
    }
    await supabaseAdmin.from('badge_batches').update({ updated_at: now }).eq('id', id)
    return NextResponse.json({ ok: true, changed })
  }

  if (body.action === 'update_template') {
    const { data: ev } = await supabaseAdmin.from('events').select('creative_template_config').eq('id', batch.event_id).single()
    const fresh = ((ev?.creative_template_config as CreativeTemplateConfig | null)?.speaker?.variants ?? []).find(v => v.id === batch.variant_id)
    if (!fresh || !fresh.print) return NextResponse.json({ error: 'The template this batch was made from no longer exists.' }, { status: 404 })
    await supabaseAdmin.from('badge_batches').update({ template_snapshot: fresh, updated_at: now }).eq('id', id)
    await supabaseAdmin.from('badge_batch_items').update({ preview_stale: true, approved: false }).eq('batch_id', id)
    return NextResponse.json({ ok: true })
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    await supabaseAdmin.from('badge_batches').update({ name: body.name.trim(), updated_at: now }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Nothing to do.' }, { status: 400 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error
  const { data: live } = await supabaseAdmin.from('badge_print_dispatches').select('id').eq('batch_id', id).in('status', ['requested', 'sent', 'downloaded']).limit(1)
  if (live?.length) return NextResponse.json({ error: 'This batch is with Operations or the printer. Ask Ops to revoke the hand-off first.' }, { status: 409 })
  const body = await req.json().catch(() => null) as { confirm?: string } | null
  if (body?.confirm !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 })
  const previews = (await loadItems(id)).map(i => i.preview_url).filter((u): u is string => !!u)
  await Promise.all([...(batch.pdf_versions ?? []).map(v => deleteObject(v.key)), ...previews.map(u => deletePublicAssetByUrl(u))])
  const { error } = await supabaseAdmin.from('badge_batches').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
