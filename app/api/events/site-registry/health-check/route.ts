import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { runHealthChecks } from '@/app/lib/site-ops/health-checks'

/* POST /api/events/site-registry/health-check?event_id=X — on-demand
   health check run for one event's site (spec: "Scheduled daily,
   runnable on demand"). Same gate as the rest of the Site Registry. */

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: site, error: siteErr } = await supabaseAdmin
    .from('event_sites')
    .select('id, live_url')
    .eq('event_id', eventId)
    .maybeSingle()

  if (siteErr) return NextResponse.json({ error: siteErr.message }, { status: 500 })
  if (!site) return NextResponse.json({ error: 'No site registered for this event yet.' }, { status: 400 })

  const results = await runHealthChecks(site)

  const { error: insertErr } = await supabaseAdmin.from('site_health_checks').insert(
    results.map(r => ({ site_id: site.id, check_key: r.checkKey, status: r.status, detail: r.detail }))
  )
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ results })
}

/* GET /api/events/site-registry/health-check?event_id=X — latest result
   per check_key for this event's site. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: site } = await supabaseAdmin
    .from('event_sites')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle()

  if (!site) return NextResponse.json({ checks: [] })

  const { data: rows, error } = await supabaseAdmin
    .from('site_health_checks')
    .select('check_key, status, detail, checked_at')
    .eq('site_id', site.id)
    .order('checked_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const latestByKey = new Map<string, { check_key: string; status: string; detail: string; checked_at: string }>()
  for (const row of rows ?? []) {
    if (!latestByKey.has(row.check_key)) latestByKey.set(row.check_key, row)
  }

  return NextResponse.json({ checks: Array.from(latestByKey.values()) })
}
