import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { runHealthChecks } from '@/app/lib/site-ops/health-checks'

/*
  GET /api/cron/site-health-checks
  Auth: Authorization: Bearer <CRON_SECRET>
  Schedule on cron-job.org: daily, e.g. 0 6 * * * — register by hand, same
  as every other cron-job.org-triggered route in this repo.

  Runs the Phase 3 health checks (see app/lib/site-ops/health-checks.ts)
  against every non-archived event_sites row and appends results to
  site_health_checks. Appends rather than upserts — each row is a point-
  in-time record, same audit-log style as this codebase's other health/
  status tables. See docs/EventPilot-SiteOps-Build-Spec-v1.1.md section 5.6.
*/
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: sites, error } = await supabaseAdmin
    .from('event_sites')
    .select('id, live_url')
    .neq('commissioning_state', 'archived')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sites || sites.length === 0) return NextResponse.json({ ok: true, sitesChecked: 0 })

  let sitesChecked = 0
  const failures: { siteId: string; error: string }[] = []

  for (const site of sites) {
    try {
      const results = await runHealthChecks(site)
      await supabaseAdmin.from('site_health_checks').insert(
        results.map(r => ({ site_id: site.id, check_key: r.checkKey, status: r.status, detail: r.detail }))
      )
      sitesChecked++
    } catch (e) {
      failures.push({ siteId: site.id, error: e instanceof Error ? e.message : 'unknown error' })
    }
  }

  return NextResponse.json({ ok: true, sitesChecked, failed: failures.length, failures })
}
