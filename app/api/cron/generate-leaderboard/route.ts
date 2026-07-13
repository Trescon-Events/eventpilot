/*
  POST /api/cron/generate-leaderboard

  Weekly leaderboard generator. Fires from .github/workflows/weekly-leaderboard.yml
  every Monday 01:30 UTC (07:00 IST) for the ISO week that just ended.

  Query params:
    ?force=1        — regenerate even if a snapshot for this week already exists
    ?dryRun=1       — compute + return but don't insert or send emails
    ?weekStart=YYYY-MM-DD — override the week (backfill / bootstrap)
    ?emailOnly=1    — assume snapshot exists, only send the digest
    ?skipEmail=1    — insert snapshot but skip digest email (backfill mode)

  Auth: accepts either:
    · Bearer <CRON_SECRET> in Authorization header — normal cron path
    · x-setup-key: <CRON_SECRET> header — admin/CLI path
    · ?secret=<CRON_SECRET> query param — legacy fallback

  A hardcoded fallback constant is checked alongside process.env.CRON_SECRET so
  the endpoint stays callable even if Railway's env var is out of sync with
  GitHub Actions' secret. Same pattern already used by build_requests PATCH.
*/

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import {
  getISTWeekBounds,
  getEligibleStaff,
  computeWeeklyScores,
  assignRanks,
  computeStreaks,
  findSilentStaff,
} from '@/app/lib/leaderboard'
import { sendLeaderboardDigest } from '@/app/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes — 127 emails at ~10/sec

// Fallback secret so the endpoint stays callable even if Railway's env var is
// missing / out of sync with GitHub Actions' CRON_SECRET. Matches the pattern
// used by build_requests PATCH. Rotate both env + this constant together if
// you ever change the secret.
const CRON_SECRET_FALLBACK = 'trescon-weekly-insights-2026'

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const url = new URL(req.url)
  const secretFromQuery  = url.searchParams.get('secret') ?? ''
  const secretFromHeader = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const secretFromSetupHeader = req.headers.get('x-setup-key') ?? ''
  const provided = secretFromHeader || secretFromSetupHeader || secretFromQuery
  // Accept EITHER the env value OR the hardcoded fallback — so if Railway's env
  // is out of sync with GitHub's secret, the fallback still lets the endpoint
  // run. Rotate both together if the secret ever changes.
  const acceptable = new Set([process.env.CRON_SECRET, CRON_SECRET_FALLBACK].filter(Boolean) as string[])
  if (!provided || !acceptable.has(provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force        = url.searchParams.get('force') === '1'
  const dryRun       = url.searchParams.get('dryRun') === '1'
  const emailOnly    = url.searchParams.get('emailOnly') === '1'
  const skipEmail    = url.searchParams.get('skipEmail') === '1'
  const weekStartArg = url.searchParams.get('weekStart') // YYYY-MM-DD (Monday)

  // ── Determine the target week ────────────────────────────────────────────
  let weekStartIST: string
  let startUtc: Date
  let endUtc: Date

  if (weekStartArg) {
    weekStartIST = weekStartArg
    const anchor = new Date(weekStartArg + 'T12:00:00+05:30') // midday IST inside the target week
    const b = getISTWeekBounds(anchor, false)
    startUtc = b.startUtc
    endUtc   = b.endUtc
  } else {
    // The previous ISO week (fired Monday, we want the Mon–Sun that just ended)
    const b = getISTWeekBounds(new Date(), true)
    weekStartIST = b.weekStartIST
    startUtc = b.startUtc
    endUtc   = b.endUtc
  }

  // ── Idempotency check ────────────────────────────────────────────────────
  if (!emailOnly) {
    const { data: existing } = await supabaseAdmin
      .from('weekly_leaderboard_snapshots')
      .select('week_start')
      .eq('week_start', weekStartIST)
      .limit(1)

    if (existing && existing.length > 0 && !force && !dryRun) {
      return NextResponse.json({
        skipped: true,
        reason:  'snapshot already exists — pass ?force=1 to regenerate',
        week_start: weekStartIST,
      })
    }
  }

  // ── Compute ──────────────────────────────────────────────────────────────
  const eligible = await getEligibleStaff(endUtc)
  const eligibleIds = eligible.map(s => s.id)

  const scores = await computeWeeklyScores(startUtc, endUtc, eligibleIds)
  const ranked = assignRanks(scores)

  const withCompletionsIds = ranked
    .filter(r => r.completions_count > 0)
    .map(r => r.staff_id)
  const streaks = await computeStreaks(withCompletionsIds, weekStartIST)

  const snapshotRows = ranked.map(r => ({
    week_start:        weekStartIST,
    staff_id:          r.staff_id,
    rank:              r.rank,
    score:             r.score,
    completions_count: r.completions_count,
    attempts_count:    r.attempts_count,
    best_test_score:   r.best_test_score,
    is_new_completer:  r.is_new_completer,
    streak_weeks:      streaks.get(r.staff_id) ?? 0,
  }))

  const silent = await findSilentStaff(eligible, startUtc, endUtc)

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      week_start: weekStartIST,
      ranked_count: ranked.length,
      snapshot_preview: snapshotRows.slice(0, 20),
      silent_count: silent.length,
    })
  }

  // ── Persist snapshot ─────────────────────────────────────────────────────
  if (!emailOnly && snapshotRows.length > 0) {
    if (force) {
      await supabaseAdmin
        .from('weekly_leaderboard_snapshots')
        .delete()
        .eq('week_start', weekStartIST)
    }
    const { error: insErr } = await supabaseAdmin
      .from('weekly_leaderboard_snapshots')
      .insert(snapshotRows)
    if (insErr) {
      return NextResponse.json({ error: `snapshot insert failed: ${insErr.message}` }, { status: 500 })
    }
  }

  // ── Send digest ──────────────────────────────────────────────────────────
  // Skip email fully in skipEmail mode (used for silent backfills of missed
  // weeks — nobody wants a leaderboard email for a week that ended 3 weeks ago).
  const digestResult = skipEmail
    ? { skipped: true, reason: 'skipEmail=1' as const }
    : await sendLeaderboardDigest({
        weekStartIST,
        weekEndIST: endToWeekEnd(weekStartIST),
        eligible,
        ranked,
        silent,
        priorWeekStartIST: subtractWeek(weekStartIST),
      })

  return NextResponse.json({
    ok: true,
    week_start:   weekStartIST,
    ranked_count: ranked.length,
    silent_count: silent.length,
    ...digestResult,
  })
}

function endToWeekEnd(weekStartIST: string): string {
  const d = new Date(weekStartIST + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

function subtractWeek(weekStartIST: string): string {
  const d = new Date(weekStartIST + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}
