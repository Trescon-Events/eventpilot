/**
 * POST /api/corporate-marketing/statistics/[id]/submit
 *
 * Moves a draft statistic → pending_review. Any Corporate Marketing user
 * can submit; super-admin then approves via /approve or bounces via /reject.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params

  const { data: existing } = await supabaseAdmin
    .from('cm_statistics').select('approval_status, current_value').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (existing.approval_status === 'pending_review') return NextResponse.json({ ok: true, already: true })
  if (existing.approval_status === 'approved')       return NextResponse.json({ error: 'Already approved. Edit the value to reset it to draft first.' }, { status: 409 })
  if (existing.approval_status === 'archived')       return NextResponse.json({ error: 'Archived. Un-archive first.' }, { status: 409 })
  if (!existing.current_value || !String(existing.current_value).trim()) {
    return NextResponse.json({ error: 'Fill in a value before submitting for review.' }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from('cm_statistics')
    .update({ approval_status: 'pending_review', updated_by: auth.session.sid })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('cm_statistic_history').insert({
    statistic_id:  id,
    old_value:     existing.current_value,
    new_value:     existing.current_value,
    changed_by:    auth.session.sid,
    reason:        'Submitted for review',
    status_before: existing.approval_status,
    status_after:  'pending_review',
  })

  return NextResponse.json({ ok: true })
}
