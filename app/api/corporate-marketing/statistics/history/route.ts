/**
 * GET /api/corporate-marketing/statistics/history
 *
 * Global recent-changes feed for the Recent Changes tab. Joins each history
 * row to its statistic + the changer's name so the UI can render without
 * a second round-trip.
 *
 * query:
 *   limit      default 100
 *   scope      filter statistics by scope
 *   changed_by uuid filter
 *   since      ISO timestamp filter (changed_at >= since)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const url = req.nextUrl
  const limit      = Math.min(500, Number(url.searchParams.get('limit')) || 100)
  const scope      = url.searchParams.get('scope')
  const changedBy  = url.searchParams.get('changed_by')
  const since      = url.searchParams.get('since')

  let q = supabaseAdmin
    .from('cm_statistic_history')
    .select(`
      id, old_value, new_value, changed_at, reason, status_before, status_after,
      changer:changed_by ( id, name ),
      statistic:statistic_id ( id, name, scope, scope_ref_label, current_value, approval_status )
    `)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (changedBy) q = q.eq('changed_by', changedBy)
  if (since)     q = q.gte('changed_at', since)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // scope filter runs client-side on the joined statistic (Supabase can't
  // filter on a joined relation via .eq without a view — this is 100 rows).
  let rows = data ?? []
  if (scope) {
    rows = rows.filter(r => (r as unknown as { statistic?: { scope?: string } }).statistic?.scope === scope)
  }

  return NextResponse.json({ history: rows })
}
