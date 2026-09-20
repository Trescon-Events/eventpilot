/**
 * GET /api/cron/hubspot-crm-property-sync
 *
 * Mirrors HubSpot property DEFINITIONS (label, field type, dropdown
 * options — e.g. Industry Sector's option list) into crm_properties, for
 * every property row that has a hubspot_property_name set. Complements
 * hubspot-crm-pull-sync (which mirrors contact/company record VALUES, not
 * schema). Definitions change far less often than records, so this runs
 * on its own, slower cadence — see the GitHub Actions workflow.
 *
 * Auth: CRON_SECRET Bearer token (same pattern as every other cron endpoint).
 */
import { NextRequest, NextResponse } from 'next/server'
import { syncCrmPropertyDefinitions } from '@/app/lib/hubspot/crm-property-sync'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const result = await syncCrmPropertyDefinitions()
  return NextResponse.json({ ok: true, ...result })
}
