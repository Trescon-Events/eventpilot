import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'
import { staffForSection } from '@/app/lib/ops/section-access'
import { ACTIVE_DISPATCH, batchContext, notifyBadgeOps } from '@/app/lib/badges/dispatch'
import { knownStaffId, loadBatch, requireBadgePermission } from '@/app/lib/badges/service'

/* POST .../batches/[id]/dispatch { version, note? }  — the producer's "Notify Ops".
   Needs sae.badges.approve (the release permission). Freezes the chosen print file on a new dispatch row and tells
   whoever is assigned to Badge Printing (email + bell). Refuses when nobody is assigned, so a request can't vanish. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.approve')
  if ('error' in auth) return auth.error
  if (batch.status !== 'approved') return NextResponse.json({ error: 'Approve the batch for print first.' }, { status: 409 })

  const body = await req.json().catch(() => null) as { version?: number; note?: string } | null
  const versions = batch.pdf_versions ?? []
  const version = body?.version ?? versions.length
  const file = versions[version - 1]
  if (!file) return NextResponse.json({ error: 'Generate the print file first.' }, { status: 409 })

  const { data: active } = await supabaseAdmin.from('badge_print_dispatches').select('id, status').eq('batch_id', id).in('status', ACTIVE_DISPATCH).limit(1)
  if (active?.length) return NextResponse.json({ error: `This batch is already with ${active[0].status === 'requested' ? 'Ops' : 'the printer'}.` }, { status: 409 })

  const { staff, assigned } = await staffForSection(batch.event_id, 'badges')
  if (!staff.length) return NextResponse.json({ error: 'No one is assigned to Badge Printing for this event yet. Ask your Operations lead to assign someone under Operations > Access.' }, { status: 409 })

  const requestedBy = await knownStaffId(auth.session.sid)
  const { data: row, error } = await supabaseAdmin.from('badge_print_dispatches').insert({
    batch_id: id, pdf_version: version, pdf_key: file.key, badges: file.badges, requested_by: requestedBy, request_note: body?.note?.trim().slice(0, 500) || null,
  }).select('id').single()
  if (error || !row) return NextResponse.json({ error: error?.message ?? 'Could not notify Ops.' }, { status: 500 })

  await logOpsAccess({ eventId: batch.event_id, actorType: 'staff', actorId: requestedBy, action: 'badge_dispatch_requested', targetType: 'badge_batch', targetId: id, meta: { dispatch_id: row.id, version, badges: file.badges }, ip: clientIp(req) })
  const ctx = await batchContext(id)
  const told = ctx ? await notifyBadgeOps(ctx, 'requested', { note: body?.note?.trim() || null, badges: file.badges }) : 0
  return NextResponse.json({ ok: true, dispatch_id: row.id, notified: told, assigned })
}
