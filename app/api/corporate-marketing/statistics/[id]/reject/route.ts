/**
 * POST /api/corporate-marketing/statistics/[id]/reject
 *
 * Sends a pending_review statistic back to draft with a rejection reason.
 * Super-admin only. The reason is written into cm_statistic_history so the
 * submitter can see why it bounced.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res
  if (!auth.session.adm) {
    return NextResponse.json({ error: 'Only super-admins can reject statistics.' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const reason = String(body?.reason ?? '').trim()
  if (!reason) return NextResponse.json({ error: 'A rejection reason is required so the submitter knows what to fix.' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('cm_statistics').select('approval_status, current_value').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (existing.approval_status !== 'pending_review') {
    return NextResponse.json({ error: `Cannot reject a statistic that is ${existing.approval_status}.` }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from('cm_statistics')
    .update({ approval_status: 'draft', updated_by: auth.session.sid })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('cm_statistic_history').insert({
    statistic_id:  id,
    old_value:     existing.current_value,
    new_value:     existing.current_value,
    changed_by:    auth.session.sid,
    reason:        `Rejected: ${reason}`,
    status_before: 'pending_review',
    status_after:  'draft',
  })

  return NextResponse.json({ ok: true })
}
