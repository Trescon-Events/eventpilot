/**
 * POST /api/corporate-marketing/statistics/[id]/approve
 *
 * Moves a statistic from draft OR pending_review → approved.
 * Super-admin only per founder decision (2026-08-11).
 *
 * Approved statistics become the ones other EventPilot modules should
 * consume (Corporate Deck, Knowledge Hub, future Website CMS etc).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res
  if (!auth.session.adm) {
    return NextResponse.json({ error: 'Only super-admins can approve statistics.' }, { status: 403 })
  }

  const { id } = await ctx.params

  const { data: existing } = await supabaseAdmin
    .from('cm_statistics').select('approval_status, current_value').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (existing.approval_status === 'approved') {
    return NextResponse.json({ ok: true, already: true })
  }
  if (existing.approval_status === 'archived') {
    return NextResponse.json({ error: 'Archived statistics cannot be approved. Un-archive first.' }, { status: 409 })
  }
  if (!existing.current_value || !String(existing.current_value).trim()) {
    return NextResponse.json({ error: 'Cannot approve a statistic with no value.' }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from('cm_statistics')
    .update({ approval_status: 'approved', updated_by: auth.session.sid })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('cm_statistic_history').insert({
    statistic_id:  id,
    old_value:     existing.current_value,
    new_value:     existing.current_value,
    changed_by:    auth.session.sid,
    reason:        'Approved',
    status_before: existing.approval_status,
    status_after:  'approved',
  })

  return NextResponse.json({ ok: true })
}
