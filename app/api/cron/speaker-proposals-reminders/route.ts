/**
 * GET /api/cron/speaker-proposals-reminders
 *
 * Runs once a day (GitHub Actions). For each Speaker Proposals drop that still has researched speakers waiting on their producer,
 * sends one reminder (bell + email) — at most three per drop, and none once everything is handled or the drop has been sent.
 *
 * Auth: CRON_SECRET Bearer token (same pattern as every other cron endpoint).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendDueReminders } from '@/app/lib/proposals/notify'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await sendDueReminders()) })
}
