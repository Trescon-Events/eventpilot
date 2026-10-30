import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { badgeVariants, knownStaffId, loadBatch, requireBadgePermission } from '@/app/lib/badges/service'
import { assertBatchEditable, pendingRound } from '@/app/lib/badges/client-approval'
import { eligibleTargets, movedItemRow, type BatchLite } from '@/app/lib/badges/move'
import type { BadgeItemRow } from '@/app/lib/badges/types'

/* "Move to another batch" — for a badge that needs a different template (a batch has one template and one client approval).
   GET  .../batches/[id]/items/[itemId]/move          -> { targets: batches it may move into, templates: for a new batch }
   POST .../batches/[id]/items/[itemId]/move  { target_batch_id } | { new_batch: { name, variant_id } }
        The badge is copied into the other batch (same person, same details as printed today; NOT approved, not drawn — the new batch's template draws it and it is approved there, and
        sent to the client there if the event needs that) and leaves this one (removed, marked "moved to"). This batch's other badges, its approval and its print file are untouched. */

async function guard(req: NextRequest, id: string, itemId: string) {
  const batch = await loadBatch(id)
  if (!batch) return { error: NextResponse.json({ error: 'Batch not found.' }, { status: 404 }) }
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.manage')
  if ('error' in auth) return { error: auth.error }
  if (batch.quantity) return { error: NextResponse.json({ error: 'A Common Badges design has no individual badges to move.' }, { status: 409 }) }
  const editable = await assertBatchEditable(id)
  if (!editable.ok) return { error: NextResponse.json({ error: editable.error }, { status: 409 }) }
  const { data: live } = await supabaseAdmin.from('badge_print_dispatches').select('id').eq('batch_id', id).in('status', ['requested', 'sent', 'downloaded']).limit(1)
  if (live?.length) return { error: NextResponse.json({ error: 'This batch has been handed to Operations or the printer. Ask Ops to revoke the hand-off first.' }, { status: 409 }) }
  const { data: item } = await supabaseAdmin.from('badge_batch_items').select('*').eq('id', itemId).eq('batch_id', id).maybeSingle()
  if (!item) return { error: NextResponse.json({ error: 'Badge not found.' }, { status: 404 }) }
  if ((item as BadgeItemRow).removed) return { error: NextResponse.json({ error: 'This badge is already out of this batch.' }, { status: 409 }) }
  if (!(item as BadgeItemRow).speaker_id && !(item as BadgeItemRow).vip_id) return { error: NextResponse.json({ error: 'This badge is not linked to a person, so it cannot be moved.' }, { status: 409 }) }
  return { batch, item: item as BadgeItemRow, sid: auth.session.sid }
}

async function targetsFor(eventId: string, sourceId: string, item: BadgeItemRow) {
  const { data: rows } = await supabaseAdmin.from('badge_batches').select('id, name, status, quantity, template_snapshot').eq('event_id', eventId).neq('id', sourceId).order('created_at', { ascending: false })
  const batches: BatchLite[] = (rows ?? []).map(r => ({ id: r.id as string, name: r.name as string, status: r.status as string, quantity: (r.quantity as number | null) ?? null, template_name: ((r.template_snapshot as { name?: string } | null)?.name) ?? '' }))
  const withClient = new Set<string>()
  for (const b of batches) if (b.status === 'review' && await pendingRound(b.id)) withClient.add(b.id)
  const col = item.speaker_id ? 'speaker_id' : 'vip_id', val = (item.speaker_id ?? item.vip_id) as string
  const { data: has } = batches.length ? await supabaseAdmin.from('badge_batch_items').select('batch_id').in('batch_id', batches.map(b => b.id)).eq(col, val).eq('removed', false) : { data: [] as { batch_id: string }[] }
  return eligibleTargets(sourceId, batches, withClient, new Set((has ?? []).map(h => h.batch_id as string)))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const g = await guard(req, id, itemId); if ('error' in g) return g.error
  const [targets, variants] = await Promise.all([targetsFor(g.batch.event_id, id, g.item), badgeVariants(g.batch.event_id)])
  return NextResponse.json({ targets, templates: variants.map(v => ({ id: v.id, name: v.name, current: v.id === g.batch.variant_id })) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const g = await guard(req, id, itemId); if ('error' in g) return g.error
  const body = await req.json().catch(() => null) as { target_batch_id?: string; new_batch?: { name?: string; variant_id?: string } } | null
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  let targetId: string, targetName: string, created = false
  if (body.target_batch_id) {
    const target = (await targetsFor(g.batch.event_id, id, g.item)).find(t => t.id === body.target_batch_id)
    if (!target) return NextResponse.json({ error: 'That batch can not take this badge (it is approved, with the client, a Common Badges batch, or already has this person).' }, { status: 409 })
    targetId = target.id; targetName = target.name
  } else if (body.new_batch?.name?.trim() && body.new_batch.variant_id) {
    const variant = (await badgeVariants(g.batch.event_id)).find(v => v.id === body.new_batch!.variant_id)
    if (!variant) return NextResponse.json({ error: 'That badge template was not found (or has no print size).' }, { status: 404 })
    const { data: made, error } = await supabaseAdmin.from('badge_batches')
      .insert({ event_id: g.batch.event_id, variant_id: variant.id, name: body.new_batch.name.trim(), template_snapshot: variant, created_by: await knownStaffId(g.sid) }).select('id, name').single()
    if (error || !made) return NextResponse.json({ error: error?.message ?? 'Could not create the batch.' }, { status: 500 })
    targetId = made.id as string; targetName = made.name as string; created = true
  } else return NextResponse.json({ error: 'Choose a batch, or give a name and a template for a new one.' }, { status: 400 })

  const { count } = await supabaseAdmin.from('badge_batch_items').select('id', { count: 'exact', head: true }).eq('batch_id', targetId)
  const { data: copy, error: copyErr } = await supabaseAdmin.from('badge_batch_items').insert(movedItemRow(g.item, targetId, count ?? 0)).select('id').single()
  const undo = async () => { if (created) await supabaseAdmin.from('badge_batches').delete().eq('id', targetId); else if (copy) await supabaseAdmin.from('badge_batch_items').delete().eq('id', copy.id) }
  if (copyErr || !copy) { await undo(); return NextResponse.json({ error: copyErr?.message ?? 'Could not add the badge to the other batch.' }, { status: 500 }) }
  // Out of this batch: the same as leaving it out (approval and the others untouched), plus where it went.
  const { error: outErr } = await supabaseAdmin.from('badge_batch_items').update({ removed: true, client_rejected: false, moved_to_batch_id: targetId }).eq('id', itemId)
  if (outErr) { await undo(); return NextResponse.json({ error: outErr.message.includes('moved_to_batch_id') ? 'Run supabase/badge_move_batch_migration.sql first.' : outErr.message }, { status: 500 }) }
  const now = new Date().toISOString()
  await Promise.all([supabaseAdmin.from('badge_batches').update({ updated_at: now }).eq('id', id), supabaseAdmin.from('badge_batches').update({ updated_at: now }).eq('id', targetId)])
  return NextResponse.json({ ok: true, target: { id: targetId, name: targetName, created } })
}
