/**
 * GET /api/cron/emails
 *
 * Runs every 10 minutes (GitHub Actions). Releases scheduled emails whose time has come and whose required fields are filled, reminds owners about missing fields, tells them
 * once before a send and once what happened, and continues any send left half-done. See app/lib/emails/scheduled.ts.
 *
 * Auth: CRON_SECRET Bearer token (same pattern as every other cron endpoint).
 */
import { NextRequest, NextResponse } from 'next/server'
import { runDueCampaigns } from '@/app/lib/emails/scheduled'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await runDueCampaigns()) })
}
