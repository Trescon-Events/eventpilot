/*
  Weekly leaderboard scoring library.

  Pure functions — no side effects, no HTTP. Consumed by:
    - app/api/cron/generate-leaderboard  → produces the Monday-morning snapshot + digest
    - app/leaderboard/page.tsx           → renders live views from stored snapshots

  Scoring formula per completion, summed to a weekly score per staff member:
    100  — base per course completed
    +30  — test_score >= 90
    +20  — first-attempt pass (attempt_count === 1)
    tier bonus — advanced +50 · adoption +25 · foundation 0

  Ties are broken by fewer attempts, then by earlier last completion.
*/

import { supabaseAdmin } from '@/app/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────

export type StaffLite = {
  id:            string
  name:          string
  email:         string
  department:    string | null
  office_id:     string | null
  joined_at:     string | null
  access_roles:  string[] | null
}

export type CompletionRow = {
  staff_id:      string
  course_id:     string
  completed_at:  string
  attempt_count: number
  test_score:    number | null
  tier_level:    'foundation' | 'adoption' | 'advanced' | null
}

export type StaffScore = {
  staff_id:          string
  score:             number
  completions_count: number
  attempts_count:    number
  best_test_score:   number | null
  last_completed_at: string | null
  is_new_completer:  boolean
}

export type RankedRow = StaffScore & { rank: number }

// ── Week boundaries in IST ────────────────────────────────────────────────

const IST_OFFSET_MINUTES = 5 * 60 + 30 // +05:30

/*
  Given any date, return the ISO Monday-through-Sunday week (in IST) as
  two Date objects representing the *UTC* moments that bound it.
  For the CRON that fires at 07:00 IST Monday, we want the week that just
  ended — pass `Date.now()` and use `previousWeek: true`.
*/
export function getISTWeekBounds(now: Date, previousWeek = false): { weekStartIST: string; startUtc: Date; endUtc: Date } {
  // Convert "now" into an IST wall-clock Date so we can find its weekday
  const istMs = now.getTime() + IST_OFFSET_MINUTES * 60_000
  const istDate = new Date(istMs)

  // Day of week where Monday=0, Sunday=6
  const dayIdx = (istDate.getUTCDay() + 6) % 7

  // Move back to Monday
  const mondayIST = new Date(istDate)
  mondayIST.setUTCDate(istDate.getUTCDate() - dayIdx)
  mondayIST.setUTCHours(0, 0, 0, 0)

  if (previousWeek) {
    mondayIST.setUTCDate(mondayIST.getUTCDate() - 7)
  }

  const sundayEndIST = new Date(mondayIST)
  sundayEndIST.setUTCDate(mondayIST.getUTCDate() + 7)
  sundayEndIST.setUTCMilliseconds(-1)

  // Convert IST wall clocks back to real UTC moments (subtract the offset we added)
  const startUtc = new Date(mondayIST.getTime() - IST_OFFSET_MINUTES * 60_000)
  const endUtc   = new Date(sundayEndIST.getTime() - IST_OFFSET_MINUTES * 60_000)

  const weekStartIST = mondayIST.toISOString().slice(0, 10) // YYYY-MM-DD

  return { weekStartIST, startUtc, endUtc }
}

// ── Eligibility ───────────────────────────────────────────────────────────

/*
  Eligible = active staff who are NOT admin/super_admin, are NOT attendance-
  exempted, and joined at least 14 days before the end of the week. The
  14-day joiner grace prevents brand-new employees from being flagged
  "silent" on their first Monday.
*/
export async function getEligibleStaff(weekEndUtc: Date): Promise<StaffLite[]> {
  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, department, office_id, joined_at, access_roles, is_active, attendance_exempted')
    .eq('is_active', true)
    .eq('attendance_exempted', false)

  if (error || !data) return []

  const graceCutoff = new Date(weekEndUtc.getTime() - 14 * 86_400_000)

  return data
    .filter(s => {
      const roles = s.access_roles ?? []
      if (roles.includes('admin') || roles.includes('super_admin')) return false
      if (s.joined_at && new Date(s.joined_at) > graceCutoff) return false
      return true
    })
    .map(s => ({
      id:           s.id,
      name:         s.name,
      email:        s.email,
      department:   s.department,
      office_id:    s.office_id,
      joined_at:    s.joined_at,
      access_roles: s.access_roles,
    }))
}

// ── Score computation ─────────────────────────────────────────────────────

function tierBonus(tier: CompletionRow['tier_level']): number {
  if (tier === 'advanced') return 50
  if (tier === 'adoption') return 25
  return 0
}

function scoreOne(row: CompletionRow): number {
  let s = 100
  if ((row.test_score ?? 0) >= 90) s += 30
  if (row.attempt_count === 1) s += 20
  s += tierBonus(row.tier_level)
  return s
}

export async function computeWeeklyScores(
  startUtc: Date,
  endUtc: Date,
  eligibleStaffIds: string[],
): Promise<StaffScore[]> {
  if (eligibleStaffIds.length === 0) return []

  const { data: completions, error } = await supabaseAdmin
    .from('course_completions')
    .select('staff_id, course_id, completed_at, attempt_count, test_score, courses(tier_level)')
    .gte('completed_at', startUtc.toISOString())
    .lte('completed_at', endUtc.toISOString())
    .in('staff_id', eligibleStaffIds)

  if (error || !completions) return []

  // Group by staff_id
  const byStaff = new Map<string, CompletionRow[]>()
  for (const c of completions as unknown as Array<CompletionRow & { courses: { tier_level: CompletionRow['tier_level'] } | null }>) {
    const row: CompletionRow = {
      staff_id:      c.staff_id,
      course_id:     c.course_id,
      completed_at:  c.completed_at,
      attempt_count: c.attempt_count,
      test_score:    c.test_score,
      tier_level:    c.courses?.tier_level ?? 'foundation',
    }
    const arr = byStaff.get(row.staff_id) ?? []
    arr.push(row)
    byStaff.set(row.staff_id, arr)
  }

  // Also fetch weekly attempts (for tiebreak + engagement signal)
  const { data: attemptRows } = await supabaseAdmin
    .from('course_attempts')
    .select('staff_id, attempted_at')
    .gte('attempted_at', startUtc.toISOString())
    .lte('attempted_at', endUtc.toISOString())
    .in('staff_id', eligibleStaffIds)

  const attemptCountByStaff = new Map<string, number>()
  for (const a of attemptRows ?? []) {
    attemptCountByStaff.set(a.staff_id, (attemptCountByStaff.get(a.staff_id) ?? 0) + 1)
  }

  // Flag first-ever completers — one query rather than one per staff
  const firstEverIds = await findFirstEverCompleters(Array.from(byStaff.keys()), startUtc)

  const scores: StaffScore[] = []
  for (const [staffId, rows] of byStaff.entries()) {
    let score = 0
    let best  = 0
    let last  = rows[0].completed_at
    for (const r of rows) {
      score += scoreOne(r)
      if ((r.test_score ?? 0) > best) best = r.test_score ?? 0
      if (r.completed_at > last) last = r.completed_at
    }
    scores.push({
      staff_id:          staffId,
      score,
      completions_count: rows.length,
      attempts_count:    attemptCountByStaff.get(staffId) ?? rows.length,
      best_test_score:   best || null,
      last_completed_at: last,
      is_new_completer:  firstEverIds.has(staffId),
    })
  }

  // Also include eligible staff with attempts but no completions this week —
  // rank 0 score, so they still appear in the "attempts_count" analysis and
  // don't get counted as silent.
  for (const [staffId, count] of attemptCountByStaff.entries()) {
    if (byStaff.has(staffId)) continue
    scores.push({
      staff_id:          staffId,
      score:             0,
      completions_count: 0,
      attempts_count:    count,
      best_test_score:   null,
      last_completed_at: null,
      is_new_completer:  false,
    })
  }

  return scores
}

async function findFirstEverCompleters(staffIds: string[], startUtc: Date): Promise<Set<string>> {
  if (staffIds.length === 0) return new Set()
  const { data } = await supabaseAdmin
    .from('course_completions')
    .select('staff_id')
    .in('staff_id', staffIds)
    .lt('completed_at', startUtc.toISOString())
  const withPriorHistory = new Set((data ?? []).map(r => r.staff_id))
  return new Set(staffIds.filter(id => !withPriorHistory.has(id)))
}

// ── Ranking (dense; ties share the same rank) ─────────────────────────────

export function assignRanks(scores: StaffScore[]): RankedRow[] {
  const sorted = [...scores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.attempts_count !== b.attempts_count) return a.attempts_count - b.attempts_count
    if (a.last_completed_at && b.last_completed_at) return a.last_completed_at.localeCompare(b.last_completed_at)
    return 0
  })

  const ranked: RankedRow[] = []
  let prevScore = -Infinity
  let prevAttempts = -1
  let currentRank = 0
  let seen = 0

  for (const row of sorted) {
    seen++
    if (row.score !== prevScore || row.attempts_count !== prevAttempts) {
      currentRank = seen
      prevScore = row.score
      prevAttempts = row.attempts_count
    }
    ranked.push({ ...row, rank: currentRank })
  }

  return ranked
}

// ── Streak: consecutive prior weeks with at least one completion ─────────

export async function computeStreaks(
  staffIds: string[],
  weekStartIST: string,
): Promise<Map<string, number>> {
  const streaks = new Map<string, number>()
  if (staffIds.length === 0) return streaks

  const { data } = await supabaseAdmin
    .from('weekly_leaderboard_snapshots')
    .select('staff_id, week_start, completions_count')
    .in('staff_id', staffIds)
    .lt('week_start', weekStartIST)
    .order('week_start', { ascending: false })
    .limit(staffIds.length * 12) // up to 12 weeks of history per staff

  const historyByStaff = new Map<string, { week_start: string; completions_count: number }[]>()
  for (const row of data ?? []) {
    const arr = historyByStaff.get(row.staff_id) ?? []
    arr.push({ week_start: row.week_start, completions_count: row.completions_count })
    historyByStaff.set(row.staff_id, arr)
  }

  for (const staffId of staffIds) {
    const hist = historyByStaff.get(staffId) ?? []
    let streak = 1 // include the current week (caller only calls this for people with a completion this week)
    let prevWeekExpected = subtractWeek(weekStartIST)
    for (const entry of hist) {
      if (entry.week_start !== prevWeekExpected) break
      if (entry.completions_count === 0) break
      streak++
      prevWeekExpected = subtractWeek(prevWeekExpected)
    }
    streaks.set(staffId, streak)
  }

  return streaks
}

function subtractWeek(weekStartIST: string): string {
  const d = new Date(weekStartIST + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

// ── Silent-staff detection (admin digest only) ───────────────────────────

export type SilentStaff = StaffLite & { last_login_at: string | null; days_silent: number }

/*
  A staff member is "silent" for the reporting week if:
    - eligible (see getEligibleStaff)
    - has NO course attempts inside the week window
    - last_login_at is older than DAYS days before week end (or NULL)
*/
export async function findSilentStaff(
  eligible: StaffLite[],
  startUtc: Date,
  endUtc: Date,
  silentDaysThreshold = 14,
): Promise<SilentStaff[]> {
  if (eligible.length === 0) return []

  const staffIds = eligible.map(s => s.id)

  const { data: attempts } = await supabaseAdmin
    .from('course_attempts')
    .select('staff_id')
    .in('staff_id', staffIds)
    .gte('attempted_at', startUtc.toISOString())
    .lte('attempted_at', endUtc.toISOString())

  const activeIds = new Set((attempts ?? []).map(a => a.staff_id))

  const { data: full } = await supabaseAdmin
    .from('staff_members')
    .select('id, last_login_at')
    .in('id', staffIds)

  const loginByStaff = new Map((full ?? []).map(r => [r.id, r.last_login_at as string | null]))
  const cutoff = new Date(endUtc.getTime() - silentDaysThreshold * 86_400_000)

  const silent: SilentStaff[] = []
  for (const s of eligible) {
    if (activeIds.has(s.id)) continue
    const lastLogin = loginByStaff.get(s.id) ?? null
    if (lastLogin && new Date(lastLogin) > cutoff) continue
    const daysSilent = lastLogin
      ? Math.floor((endUtc.getTime() - new Date(lastLogin).getTime()) / 86_400_000)
      : 9999
    silent.push({ ...s, last_login_at: lastLogin, days_silent: daysSilent })
  }
  silent.sort((a, b) => b.days_silent - a.days_silent)
  return silent
}
