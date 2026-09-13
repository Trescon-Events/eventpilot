import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { checkGa4Receiving, checkSearchConsoleVerified } from '@/app/lib/site-ops/health-checks'

/* POST /api/events/site-registry/verify?event_id=X — Commissioning
   Orchestrator Step 3 (spec section 4). Reuses the same GA4/Search
   Console check functions Phase 3's health checks use — "verified" here
   and "passing" in the daily health check are the same underlying test,
   deliberately, per the design principle that a connection's status must
   come from a live check, never from a field being non-empty.

   On a pass, flips that site_connections row's status to 'verified' and
   stamps last_verified_at; on warn/fail, records the detail as
   last_error without touching status (still connected_unverified —
   "verified" is earned, not assumed). */

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: site } = await supabaseAdmin.from('event_sites').select('id').eq('event_id', eventId).maybeSingle()
  if (!site) return NextResponse.json({ error: 'Register the site first.' }, { status: 400 })

  const [ga4Result, gscResult] = await Promise.all([
    checkGa4Receiving(site.id),
    checkSearchConsoleVerified(site.id),
  ])

  for (const [provider, result] of [['ga4', ga4Result], ['search_console', gscResult]] as const) {
    if (result.status === 'pass') {
      await supabaseAdmin
        .from('site_connections')
        .update({ status: 'verified', last_verified_at: new Date().toISOString(), last_error: null })
        .eq('site_id', site.id).eq('provider', provider)
    } else {
      await supabaseAdmin
        .from('site_connections')
        .update({ last_error: result.detail })
        .eq('site_id', site.id).eq('provider', provider)
    }
  }

  return NextResponse.json({ ga4: ga4Result, searchConsole: gscResult })
}
