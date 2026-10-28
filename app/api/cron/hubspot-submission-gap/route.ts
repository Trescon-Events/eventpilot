/**
 * GET /api/cron/hubspot-submission-gap
 *
 * Every 15 minutes: compares what HubSpot recorded for each connected form with what EventPilot received, and alerts when a submission has been missing for 30+ minutes
 * or a HubSpot workflow has lost its re-enrollment trigger. Read-only toward HubSpot; it never brings anything in by itself (that is a button on the Sync health card).
 * Auth: CRON_SECRET Bearer token, same as every other cron endpoint.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runGapCheck } from '@/app/lib/hubspot/submission-gap'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await runGapCheck()) })
}
