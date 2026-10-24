import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { knownStaffId } from '@/app/lib/badges/service'
import { listMementoVariants, renderAndStoreMemento } from '@/app/lib/mementos/render'
import type { CreativeTemplateConfig } from '@/app/lib/announcements/composite'
import type { HeadBox } from '@/app/lib/media/face-alignment'
import { requireMementoAccess } from '@/app/lib/mementos/access'
import { getMementoStatuses, MEMENTO_STATE_LABEL } from '@/app/lib/mementos/status'
import { mementoBatchContext, notifyMementoOps } from '@/app/lib/mementos/dispatch'
import { staffForSection } from '@/app/lib/ops/section-access'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'
import { eventMementoVariantFor, presignMementoPrint, printState, startMementoPrint } from '@/app/lib/mementos/print'

/* Speaker mementos, modelled on the Badges module (2026-10-20): create a batch (name + speakers), then Push to Ops. Only the speakers'
   Cleaned Photos are involved. A batch is a draft until pushed; a pushed batch is locked. A speaker's status is derived from batch
   membership (app/lib/mementos/status.ts).
   GET    ?event_id=X                -> { enabled, batches: [...] }        (enabled:false and nothing else when the event hasn't switched it on)
   GET    ?event_id=X&candidates=1   -> { enabled, speakers: [{ id, name, title, company, eligible, state, ... }] }  (for the New batch picker)
   GET    ?event_id=X&id=B           -> { enabled, batch: { ..., items: [{ speaker_id, name, company, photo_url, changed }] } }
   POST   { event_id, name, note?, speaker_ids[] }                      -> creates a DRAFT batch from speakers that have a Cleaned Photo
   PATCH  { event_id, id, action: 'rename', name } | 'remove_speaker' { speaker_id } | 'push' { note? }     (draft batches only)
   DELETE { event_id, id }                                              -> deletes a DRAFT batch */

async function eventMementoVariants(eventId: string) {
  const { data } = await supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).single()
  return listMementoVariants(data?.creative_template_config as CreativeTemplateConfig | null)
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const auth = await requireMementoAccess(req, eventId, 'view', { allowDisabled: true })
  if ('error' in auth) return auth.error
  if (!auth.enabled) return NextResponse.json({ enabled: false })

  if (req.nextUrl.searchParams.get('candidates')) {
    const [{ data: speakers }, statuses] = await Promise.all([
      supabaseAdmin.from('event_speakers').select('id, name, public_name, role, company, photo_processed_url, photo_cleaning_cycle_done').eq('event_id', eventId).eq('active', true).order('name'),
      getMementoStatuses(eventId),
    ])
    const variants = await eventMementoVariants(eventId)
    return NextResponse.json({
      enabled: true,
      variants: variants.map(v => ({ id: v.id, name: v.name, width: v.canvas_width, height: v.canvas_height })),
      speakers: (speakers ?? []).map(s => {
        const st = statuses.get(s.id as string)
        const state = st?.state ?? 'not_shared'
        return { id: s.id, name: s.public_name || s.name, title: s.role, company: s.company, eligible: !!s.photo_cleaning_cycle_done && !!s.photo_processed_url, state, state_label: MEMENTO_STATE_LABEL[state], batch_name: st?.batch_name ?? null }
      }),
    })
  }

  const batchId = req.nextUrl.searchParams.get('id')
  if (batchId && req.nextUrl.searchParams.get('print_download')) {
    const { data: pb } = await supabaseAdmin.from('memento_batches').select('name, print_pdf_key').eq('id', batchId).eq('event_id', eventId).maybeSingle()
    if (!pb?.print_pdf_key) return NextResponse.json({ error: 'No print file has been generated yet.' }, { status: 404 })
    const safe = (pb.name as string).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'mementos'
    return NextResponse.json({ url: await presignMementoPrint(pb.print_pdf_key as string), filename: `${safe}-print.pdf` })
  }
  const eventVariants = await eventMementoVariants(eventId)
  const { data: batches } = await supabaseAdmin.from('memento_batches')
    .select('id, name, note, kind, status, variant_id, shared_at, pushed_at, created_at, print_status, print_started_at, print_done, print_total, print_error, print_pdf_key, print_generated_at, print_pdf_bytes, print_sources, staff:staff_members!memento_batches_created_by_fkey(name)')
    .eq('event_id', eventId).order('shared_at', { ascending: false })
  const wanted = (batches ?? []).filter(b => !batchId || b.id === batchId)
  if (batchId && wanted.length === 0) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const { data: items } = await supabaseAdmin.from('memento_batch_items').select('batch_id, speaker_id, speaker_name, photo_url, source_photo_url').in('batch_id', wanted.map(b => b.id as string).concat('00000000-0000-0000-0000-000000000000'))
  const speakerIds = [...new Set((items ?? []).map(i => i.speaker_id as string))]
  const { data: sp } = speakerIds.length ? await supabaseAdmin.from('event_speakers').select('id, company, role, photo_processed_url').in('id', speakerIds) : { data: [] as { id: string; company: string | null; role: string | null; photo_processed_url: string | null }[] }
  const speakerById = new Map((sp ?? []).map(s => [s.id as string, s]))
  const itemsOf = (id: string) => (items ?? []).filter(i => i.batch_id === id).map(i => {
    const cur = speakerById.get(i.speaker_id as string)
    return {
      speaker_id: i.speaker_id as string, name: i.speaker_name as string, company: cur?.company ?? null, title: cur?.role ?? null,
      photo_url: (i.photo_url as string | null) ?? (cur?.photo_processed_url as string | null) ?? null,
      changed: !!(i.source_photo_url ?? i.photo_url) && (i.source_photo_url ?? i.photo_url) !== (cur?.photo_processed_url ?? null),
    }
  })
  const dispatch = batchId ? (await supabaseAdmin.from('memento_dispatches').select('id, status, speakers, requested_at, sent_at, first_downloaded_at, vendor_response_at, vendor_note, revoked_at, ops_vendors(name)').eq('batch_id', batchId).order('requested_at', { ascending: false }).limit(5)).data ?? [] : []
  const printInfo = batchId ? await printState(wanted[0] as unknown as Parameters<typeof printState>[0]) : null
  const shape = (b: (typeof wanted)[number]) => {
    const its = itemsOf(b.id as string)
    return {
      id: b.id, name: b.name, note: b.note, kind: b.kind, variant_id: b.variant_id, status: b.status, shared_at: b.shared_at, pushed_at: b.pushed_at, created_at: b.created_at,
      created_by_name: (b as unknown as { staff: { name: string } | null }).staff?.name ?? null,
      print_template: !!eventVariants.find(v => v.id === b.variant_id)?.print, ...(batchId ? { print: printInfo } : {}),
      speakers: its.length, changed: b.status === 'pushed' && b.kind === 'shared' ? its.filter(i => i.changed).length : 0,
      ...(batchId ? { items: its, dispatches: dispatch.map(d => ({ ...d, vendor_name: ((Array.isArray(d.ops_vendors) ? d.ops_vendors[0] : d.ops_vendors) as { name?: string } | null)?.name ?? null, ops_vendors: undefined })) } : {}),
    }
  }
  return batchId ? NextResponse.json({ enabled: true, batch: shape(wanted[0]) }) : NextResponse.json({ enabled: true, batches: wanted.map(shape) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; name?: string; note?: string; speaker_ids?: string[]; variant_id?: string } | null
  if (!body?.event_id || !Array.isArray(body.speaker_ids) || body.speaker_ids.length === 0) return NextResponse.json({ error: 'event_id and speaker_ids are required.' }, { status: 400 })
  const auth = await requireMementoAccess(req, body.event_id, 'edit')
  if ('error' in auth) return auth.error
  const name = clean(body.name)
  if (!name) return NextResponse.json({ error: 'Give the batch a name.' }, { status: 400 })

  const { data: speakers } = await supabaseAdmin.from('event_speakers')
    .select('id, name, public_name, photo_processed_url, photo_cleaning_cycle_done, photo_head_box').eq('event_id', body.event_id).eq('active', true).in('id', body.speaker_ids)
  const usable = (speakers ?? []).filter(s => s.photo_cleaning_cycle_done && s.photo_processed_url)
  if (usable.length === 0) return NextResponse.json({ error: 'None of the selected speakers has a Cleaned Photo yet.' }, { status: 422 })

  // Artwork: render each speaker through the chosen Memento variant BEFORE anything is created, so a missing head position fails cleanly.
  const variants = await eventMementoVariants(body.event_id)
  const variant = body.variant_id ? variants.find(v => v.id === body.variant_id) : variants.length === 1 ? variants[0] : undefined
  if (body.variant_id && !variant) return NextResponse.json({ error: 'That Memento template no longer exists.' }, { status: 422 })
  if (variants.length > 1 && !variant) return NextResponse.json({ error: 'Choose which Memento template to use.' }, { status: 400 })
  const art = new Map<string, string>()
  if (variant) {
    const failed: string[] = []
    for (const s of usable) {
      const r = await renderAndStoreMemento(body.event_id, s.id as string, variant, s.photo_processed_url as string, s.photo_head_box as HeadBox | null)
      if (r.ok) art.set(s.id as string, r.url)
      else failed.push(`${s.public_name || s.name}: ${r.error}`)
    }
    if (failed.length > 0) return NextResponse.json({ error: `Could not render the memento artwork — ${failed.join(' | ')}` }, { status: 422 })
  }

  const { data: batch, error } = await supabaseAdmin.from('memento_batches')
    .insert({ event_id: body.event_id, name, note: clean(body.note), kind: 'shared', status: 'draft', variant_id: variant?.id ?? null, created_by: await knownStaffId(auth.session.sid) }).select('id').single()
  if (error || !batch) return NextResponse.json({ error: error?.message ?? 'Could not create the batch.' }, { status: 500 })
  const { error: itemsErr } = await supabaseAdmin.from('memento_batch_items').insert(usable.map(s => ({ batch_id: batch.id, speaker_id: s.id, speaker_name: s.public_name || s.name, photo_url: art.get(s.id as string) ?? s.photo_processed_url, source_photo_url: s.photo_processed_url })))
  if (itemsErr) {
    await supabaseAdmin.from('memento_batches').delete().eq('id', batch.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }
  return NextResponse.json({ id: batch.id, speakers: usable.length, skipped_no_photo: (speakers ?? []).length - usable.length })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; id?: string; action?: string; name?: string; speaker_id?: string; note?: string } | null
  if (!body?.event_id || !body.id || !body.action) return NextResponse.json({ error: 'event_id, id and action are required.' }, { status: 400 })
  const auth = await requireMementoAccess(req, body.event_id, 'edit')
  if ('error' in auth) return auth.error
  const { data: batch } = await supabaseAdmin.from('memento_batches').select('id, status, variant_id').eq('id', body.id).eq('event_id', body.event_id).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  if (batch.status !== 'draft') return NextResponse.json({ error: 'This batch has already been pushed to Ops and can no longer be changed.' }, { status: 409 })

  if (body.action === 'rename') {
    const name = clean(body.name)
    if (!name) return NextResponse.json({ error: 'Give the batch a name.' }, { status: 400 })
    await supabaseAdmin.from('memento_batches').update({ name }).eq('id', body.id)
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'remove_speaker') {
    if (!body.speaker_id) return NextResponse.json({ error: 'speaker_id required.' }, { status: 400 })
    await supabaseAdmin.from('memento_batch_items').delete().eq('batch_id', body.id).eq('speaker_id', body.speaker_id)
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'generate_print') {
    const r = await startMementoPrint(body.id)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 })
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'push') {
    // A print memento goes to Ops as its print file: it must exist and be current (no speaker or Cleaned Photo changed since).
    const printVariant = await eventMementoVariantFor(body.event_id, batch.variant_id as string | null)
    if (printVariant?.print) {
      const { data: pb } = await supabaseAdmin.from('memento_batches').select('id, print_status, print_started_at, print_done, print_total, print_error, print_pdf_key, print_generated_at, print_pdf_bytes, print_sources').eq('id', body.id).single()
      const st = await printState(pb as unknown as Parameters<typeof printState>[0])
      if (st.status === 'processing') return NextResponse.json({ error: 'The print file is still being built. Wait for it to finish, then push.' }, { status: 409 })
      if (st.status !== 'done') return NextResponse.json({ error: 'Generate the print file first — Ops and the vendor receive the print PDF.' }, { status: 409 })
      if (st.stale) return NextResponse.json({ error: 'A speaker or a Cleaned Photo changed since the print file was built. Generate it again, then push.' }, { status: 409 })
    }
    const { data: items } = await supabaseAdmin.from('memento_batch_items').select('id, speaker_id, speaker_name').eq('batch_id', body.id)
    if (!items || items.length === 0) return NextResponse.json({ error: 'The batch has no speakers.' }, { status: 422 })
    // Ops gets what is current: refresh each speaker's frozen photo to their Cleaned Photo as of now, and refuse if one lost it.
    const { data: sp } = await supabaseAdmin.from('event_speakers').select('id, photo_processed_url, photo_cleaning_cycle_done, photo_head_box').in('id', items.map(i => i.speaker_id as string))
    const photoOf = new Map((sp ?? []).map(s => [s.id as string, s.photo_cleaning_cycle_done ? (s.photo_processed_url as string | null) : null]))
    const missing = items.filter(i => !photoOf.get(i.speaker_id as string)).map(i => i.speaker_name as string)
    if (missing.length > 0) return NextResponse.json({ error: `No Cleaned Photo any more for: ${missing.join(', ')}. Remove them from the batch first.` }, { status: 422 })
    const variant = batch.variant_id ? (await eventMementoVariants(body.event_id)).find(v => v.id === batch.variant_id) : undefined
    if (batch.variant_id && !variant) return NextResponse.json({ error: 'The Memento template this batch used was deleted. Create a new batch.' }, { status: 422 })
    const headOf = new Map((sp ?? []).map(s => [s.id as string, s.photo_head_box as HeadBox | null]))
    const rendered = new Map<string, string>()
    if (variant) {
      const failed: string[] = []
      for (const i of items) {
        const r = await renderAndStoreMemento(body.event_id, i.speaker_id as string, variant, photoOf.get(i.speaker_id as string)!, headOf.get(i.speaker_id as string) ?? null)
        if (r.ok) rendered.set(i.speaker_id as string, r.url)
        else failed.push(`${i.speaker_name}: ${r.error}`)
      }
      if (failed.length > 0) return NextResponse.json({ error: `Could not render the memento artwork — ${failed.join(' | ')}` }, { status: 422 })
    }
    for (const i of items) await supabaseAdmin.from('memento_batch_items').update({ photo_url: rendered.get(i.speaker_id as string) ?? photoOf.get(i.speaker_id as string), source_photo_url: photoOf.get(i.speaker_id as string) }).eq('id', i.id)
    // Ops must have someone to receive it, or a push could vanish (same rule as badges).
    const { staff } = await staffForSection(body.event_id, 'mementos')
    if (!staff.length) return NextResponse.json({ error: 'No one is assigned to Mementos for this event yet. Ask your Operations lead to assign someone under Operations > Access.' }, { status: 409 })
    const now = new Date().toISOString()
    await supabaseAdmin.from('memento_batches').update({ status: 'pushed', pushed_at: now, shared_at: now, pushed_by: await knownStaffId(auth.session.sid), ...(clean(body.note) ? { note: clean(body.note) } : {}) }).eq('id', body.id)
    const requestedBy = await knownStaffId(auth.session.sid)
    const { data: row } = await supabaseAdmin.from('memento_dispatches').insert({ batch_id: body.id, speakers: items.length, requested_by: requestedBy, request_note: clean(body.note)?.slice(0, 500) ?? null }).select('id').single()
    await logOpsAccess({ eventId: body.event_id, actorType: 'staff', actorId: requestedBy, action: 'memento_dispatch_requested', targetType: 'memento_dispatch', targetId: row?.id as string | undefined, meta: { batch_id: body.id, speakers: items.length }, ip: clientIp(req) })
    const ctx = await mementoBatchContext(body.id)
    const told = ctx ? await notifyMementoOps(ctx, 'requested', { note: clean(body.note), speakers: items.length }) : 0
    return NextResponse.json({ ok: true, pushed: items.length, notified: told })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; id?: string } | null
  if (!body?.event_id || !body.id) return NextResponse.json({ error: 'event_id and id are required.' }, { status: 400 })
  const auth = await requireMementoAccess(req, body.event_id, 'edit')
  if ('error' in auth) return auth.error
  const { data: batch } = await supabaseAdmin.from('memento_batches').select('status').eq('id', body.id).eq('event_id', body.event_id).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  if (batch.status !== 'draft') return NextResponse.json({ error: 'A batch that was pushed to Ops can’t be deleted.' }, { status: 409 })
  await supabaseAdmin.from('memento_batches').delete().eq('id', body.id)
  return NextResponse.json({ ok: true })
}
