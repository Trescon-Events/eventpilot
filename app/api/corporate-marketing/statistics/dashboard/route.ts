/**
 * GET /api/corporate-marketing/statistics/dashboard
 *
 * Aggregate for the Overview Dashboard cards:
 *   total_company, total_event_series, total_event
 *   recently_updated (last 7d)
 *   pending_approval
 *   outdated (approved but stale — approved > 90d ago)
 *   used_in_corporate_deck (dependency count for module='corporate_deck')
 *   last_updated (single ISO timestamp)
 *
 * Plus recent_activity — last 8 history rows joined to their statistic.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const now = Date.now()
  const sevenDaysAgo   = new Date(now - 7  * 86_400_000).toISOString()
  const ninetyDaysAgo  = new Date(now - 90 * 86_400_000).toISOString()

  const [
    totalCompany, totalSeries, totalEvent,
    recentlyUpdated, pendingApproval, outdated,
    deckDeps, lastUpdated, recentActivity,
  ] = await Promise.all([
    supabaseAdmin.from('cm_statistics').select('id', { count: 'exact', head: true }).eq('scope', 'company'),
    supabaseAdmin.from('cm_statistics').select('id', { count: 'exact', head: true }).eq('scope', 'event_series'),
    supabaseAdmin.from('cm_statistics').select('id', { count: 'exact', head: true }).eq('scope', 'event'),
    supabaseAdmin.from('cm_statistics').select('id', { count: 'exact', head: true }).gte('updated_at', sevenDaysAgo),
    supabaseAdmin.from('cm_statistics').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending_review'),
    supabaseAdmin.from('cm_statistics').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved').lt('updated_at', ninetyDaysAgo),
    supabaseAdmin.from('cm_statistic_dependencies').select('id', { count: 'exact', head: true }).eq('module', 'corporate_deck').neq('status', 'obsolete'),
    supabaseAdmin.from('cm_statistics').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('cm_statistic_history')
      .select(`
        id, changed_at, reason, old_value, new_value, status_after,
        changer:changed_by ( id, name ),
        statistic:statistic_id ( id, name, scope )
      `)
      .order('changed_at', { ascending: false })
      .limit(8),
  ])

  return NextResponse.json({
    counts: {
      total_company_stats:      totalCompany.count ?? 0,
      total_event_series_stats: totalSeries.count ?? 0,
      total_event_stats:        totalEvent.count ?? 0,
      recently_updated:         recentlyUpdated.count ?? 0,
      pending_approval:         pendingApproval.count ?? 0,
      outdated_statistics:      outdated.count ?? 0,
      used_in_corporate_deck:   deckDeps.count ?? 0,
    },
    last_updated:    lastUpdated.data?.updated_at ?? null,
    recent_activity: recentActivity.data ?? [],
  })
}
