/**
 * CM-002.1 · Statistics Repository — single statistic detail / update / archive
 *
 * GET    /api/corporate-marketing/statistics/[id]
 *   Returns statistic + history[] (immutable) + dependencies[].
 *
 * PUT    /api/corporate-marketing/statistics/[id]
 *   body: { current_value?, unit?, description?, source?, owner_id?,
 *           category?, notes?, name?, reason? }
 *   If current_value changes, previous_value is set to the OLD value and a
 *   history row is written. Any other field change also writes history
 *   with reason='Metadata edit'. Approval status is not changed here —
 *   use /approve or /reject.
 *
 * DELETE /api/corporate-marketing/statistics/[id]
 *   Soft-archive (sets approval_status='archived'). Hard-delete is not
 *   exposed via the API — the history table would orphan.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params

  const [statRes, historyRes, depsRes] = await Promise.all([
    supabaseAdmin
      .from('cm_statistics')
      .select('*, owner:owner_id ( id, name ), updater:updated_by ( id, name )')
      .eq('id', id)
      .maybeSingle(),
    supabaseAdmin
      .from('cm_statistic_history')
      .select('*, changer:changed_by ( id, name )')
      .eq('statistic_id', id)
      .order('changed_at', { ascending: false }),
    supabaseAdmin
      .from('cm_statistic_dependencies')
      .select('*, linker:linked_by ( id, name ), reviewer:last_reviewed_by ( id, name )')
      .eq('statistic_id', id)
      .order('linked_at', { ascending: false }),
  ])

  if (statRes.error) return NextResponse.json({ error: statRes.error.message }, { status: 500 })
  if (!statRes.data)  return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({
    statistic:    statRes.data,
    history:      historyRes.data ?? [],
    dependencies: depsRes.data    ?? [],
  })
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const { data: existing, error: readErr } = await supabaseAdmin
    .from('cm_statistics').select('*').eq('id', id).maybeSingle()
  if (readErr)   return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_by: auth.session.sid }

  const nextValue = (typeof body.current_value === 'string') ? body.current_value : existing.current_value
  const valueChanged = nextValue !== existing.current_value
  if (valueChanged) {
    patch.previous_value = existing.current_value
    patch.current_value  = nextValue
    // A value change on an approved statistic drops it back to draft — the
    // approver has to re-approve the new number. Prevents silent divergence
    // between what's "approved" and what other modules read.
    if (existing.approval_status === 'approved') patch.approval_status = 'draft'
  }
  if ('unit'        in body) patch.unit        = body.unit
  if ('description' in body) patch.description = body.description
  if ('source'      in body) patch.source      = body.source
  if ('owner_id'    in body) patch.owner_id    = body.owner_id
  if ('category'    in body) patch.category    = body.category
  if ('notes'       in body) patch.notes       = body.notes
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('cm_statistics')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Only write history if the value or a persisted attribute actually changed.
  const attrChanged = ['unit','description','source','owner_id','category','notes','name']
    .some(k => k in body && (body as Record<string, unknown>)[k] !== (existing as Record<string, unknown>)[k])
  if (valueChanged || attrChanged) {
    await supabaseAdmin.from('cm_statistic_history').insert({
      statistic_id:  id,
      old_value:     existing.current_value,
      new_value:     updated.current_value,
      changed_by:    auth.session.sid,
      reason:        (typeof body.reason === 'string' && body.reason) || (valueChanged ? 'Value updated' : 'Metadata edit'),
      status_before: existing.approval_status,
      status_after:  updated.approval_status,
    })
  }

  return NextResponse.json({ statistic: updated })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params

  const { data: existing } = await supabaseAdmin
    .from('cm_statistics').select('approval_status').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('cm_statistics')
    .update({ approval_status: 'archived', updated_by: auth.session.sid })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('cm_statistic_history').insert({
    statistic_id:  id,
    old_value:     null,
    new_value:     null,
    changed_by:    auth.session.sid,
    reason:        'Archived',
    status_before: existing.approval_status,
    status_after:  'archived',
  })

  return NextResponse.json({ ok: true })
}
