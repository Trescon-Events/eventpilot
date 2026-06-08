import { smartdataAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/* GET /api/data/analytics — dashboard stats */

export async function GET() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    contactsRes,
    companiesRes,
    extractionsRes,
    recentExtractionsRes,
    todayExtractionsRes,
    topUsersRes,
    toolBreakdownRes,
    contactsThisMonthRes,
  ] = await Promise.all([
    // Total contacts
    smartdataAdmin.from('sd_contact_records').select('*', { count: 'exact', head: true }),

    // Total companies
    smartdataAdmin.from('sd_company_records').select('*', { count: 'exact', head: true }),

    // Total extractions
    smartdataAdmin.from('sd_extractions').select('*', { count: 'exact', head: true }),

    // Recent 10 extraction jobs
    smartdataAdmin
      .from('sd_extractions')
      .select('id, source_name, source_type, status, contacts_count, credits_used, user_email, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(10),

    // Today's extractions
    smartdataAdmin
      .from('sd_extractions')
      .select('contacts_count, credits_used')
      .gte('created_at', todayStart.toISOString()),

    // Top contributors (last 30 days)
    smartdataAdmin
      .from('sd_extractions')
      .select('user_email, contacts_count')
      .gte('created_at', thirtyDaysAgo)
      .eq('status', 'complete'),

    // Breakdown by tool (last 30 days)
    smartdataAdmin
      .from('sd_extractions')
      .select('source_type, contacts_count')
      .gte('created_at', thirtyDaysAgo),

    // Contacts added this month
    smartdataAdmin
      .from('sd_contact_records')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo),
  ])

  // Today stats
  const todayJobs     = todayExtractionsRes.data ?? []
  const todayContacts = todayJobs.reduce((s, r) => s + (r.contacts_count ?? 0), 0)
  const todayCredits  = todayJobs.reduce((s, r) => s + (r.credits_used ?? 0), 0)

  // Top users by contacts extracted
  const userMap: Record<string, number> = {}
  for (const r of topUsersRes.data ?? []) {
    if (r.user_email) userMap[r.user_email] = (userMap[r.user_email] ?? 0) + (r.contacts_count ?? 0)
  }
  const topUsers = Object.entries(userMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([email, count]) => ({ email, count }))

  // Tool breakdown
  const toolMap: Record<string, number> = {}
  for (const r of toolBreakdownRes.data ?? []) {
    toolMap[r.source_type] = (toolMap[r.source_type] ?? 0) + (r.contacts_count ?? 0)
  }
  const toolBreakdown = Object.entries(toolMap)
    .sort(([, a], [, b]) => b - a)
    .map(([tool, count]) => ({ tool, count }))

  return NextResponse.json({
    totals: {
      contacts:         contactsRes.count ?? 0,
      companies:        companiesRes.count ?? 0,
      extractions:      extractionsRes.count ?? 0,
      contacts_month:   contactsThisMonthRes.count ?? 0,
    },
    today: {
      contacts: todayContacts,
      credits:  todayCredits,
      jobs:     todayJobs.length,
    },
    top_users:      topUsers,
    tool_breakdown: toolBreakdown,
    recent_jobs:    recentExtractionsRes.data ?? [],
  })
}
