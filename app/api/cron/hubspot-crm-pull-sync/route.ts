/**
 * GET /api/cron/hubspot-crm-pull-sync
 *
 * Phase 3 pull direction — HubSpot -> EventPilot, the backstop half of the
 * hybrid design (no webhook nudge yet; Service Keys can't register webhook
 * subscriptions via API, only manually per-property in HubSpot's own UI —
 * that manual step hasn't been done, so this scheduled poll is the only
 * pull path live right now). Not yet wired into any actual Railway/Vercel
 * Cron schedule — this route exists and works, but nothing calls it
 * periodically until that's set up (same "build the mechanism, flag the
 * human step" pattern as the HubSpot-properties decision — see
 * eventpilot_crm_hubspot_properties_manual memory).
 *
 * Auth: CRON_SECRET Bearer token (same pattern as every other cron endpoint).
 */
import { NextRequest, NextResponse } from 'next/server'
import { pullContactsFromHubSpot, pullCompaniesFromHubSpot } from '@/app/lib/hubspot/crm-pull-sync'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const [contacts, companies] = await Promise.all([
    pullContactsFromHubSpot(),
    pullCompaniesFromHubSpot(),
  ])

  return NextResponse.json({ ok: true, contacts, companies })
}
