import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getGoogleServiceAccountToken } from '@/app/lib/security/google-service-account-auth'
import { registrableDomain } from '@/app/lib/site-ops/domain'

/* POST /api/events/site-registry/classify?event_id=X — Commissioning
   Orchestrator Step 2 (spec section 4). Evidence-based only: this never
   writes anything, it just reports what it found so the human can
   confirm or override. Scenario B/C automation isn't built yet (build
   order: "Scenario A only" first) — a domain that already has evidence of
   existing infrastructure is reported as such, but this route makes no
   attempt to auto-reuse/link an existing GA4 property or Search Console
   site; that stays a manual pick via the existing fetch-and-select
   endpoints (ga4-accounts, search-console-sites) regardless of scenario.

   v1.4: one shared service account replaces the multi-account OAuth model
   — Search Console evidence is a single check again, not a loop across
   connections, since every property that matters is (or will be) shared
   with this one account directly. GA4-side evidence gathering isn't built
   at all yet (Search Console + sibling EventPilot events are the only
   evidence today) — real gap, but it belongs to the Scenario B/C build
   itself, not this fix. */

type Scenario = 'new_domain_new_series' | 'not_new_domain'

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: site } = await supabaseAdmin
    .from('event_sites')
    .select('id, live_url')
    .eq('event_id', eventId)
    .maybeSingle()

  if (!site?.live_url) return NextResponse.json({ error: 'Register the site\'s Live URL first.' }, { status: 400 })

  const domain = registrableDomain(site.live_url)
  if (!domain) return NextResponse.json({ error: 'Could not determine a registrable domain from the Live URL.' }, { status: 400 })

  const { data: siblingRows } = await supabaseAdmin
    .from('event_sites')
    .select('event_id, live_url, events!inner(name, public_name)')
    .eq('registrable_domain', domain)
    .neq('event_id', eventId)

  type SiblingRow = { event_id: string; live_url: string | null; events: { name: string; public_name: string | null } | { name: string; public_name: string | null }[] }
  const siblingEvents = ((siblingRows ?? []) as SiblingRow[]).map(r => {
    const ev = Array.isArray(r.events) ? r.events[0] : r.events
    return { eventId: r.event_id, liveUrl: r.live_url, eventName: ev?.public_name || ev?.name || 'Unknown event' }
  })

  const matchingGscSites: string[] = []
  const accessToken = await getGoogleServiceAccountToken()
  if (accessToken) {
    const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const data = await res.json() as { siteEntry?: { siteUrl: string }[] }
      for (const s of data.siteEntry ?? []) {
        const d = registrableDomain(s.siteUrl.replace(/^sc-domain:/, 'https://'))
        if (d === domain) matchingGscSites.push(s.siteUrl)
      }
    }
  }

  const scenario: Scenario = siblingEvents.length === 0 && matchingGscSites.length === 0
    ? 'new_domain_new_series'
    : 'not_new_domain'

  return NextResponse.json({
    registrableDomain: domain,
    scenario,
    evidence: {
      siblingEvents,
      matchingGscSites,
      googleConnected: !!accessToken,
    },
  })
}
