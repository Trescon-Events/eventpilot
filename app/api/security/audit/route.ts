import { supabaseAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/*
  GET /api/security/audit
  Returns login activity for the admin Security tab.
  Super admin only — no auth middleware yet, rely on admin UI gating.
*/
export async function GET() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  const [recentRes, todayRes, lockedRes] = await Promise.all([
    // Last 100 login attempts
    supabaseAdmin
      .from('login_attempts')
      .select('id, email, ip, success, reason, attempted_at')
      .order('attempted_at', { ascending: false })
      .limit(100),

    // Today's summary
    supabaseAdmin
      .from('login_attempts')
      .select('success')
      .gte('attempted_at', todayStart.toISOString()),

    // Currently locked: emails with 5+ failures in last 15 min
    supabaseAdmin
      .from('login_attempts')
      .select('email')
      .eq('success', false)
      .gte('attempted_at', fifteenMinutesAgo),
  ])

  const today = todayRes.data ?? []
  const todayLogins   = today.filter(r => r.success).length
  const todayFailures = today.filter(r => !r.success).length

  // Count failures per email in the last 15 min
  const failMap: Record<string, number> = {}
  for (const r of lockedRes.data ?? []) {
    failMap[r.email] = (failMap[r.email] ?? 0) + 1
  }
  const lockedNow = Object.entries(failMap)
    .filter(([, count]) => count >= 5)
    .map(([email]) => email)

  return NextResponse.json({
    today_logins:   todayLogins,
    today_failures: todayFailures,
    locked_now:     lockedNow,
    recent:         recentRes.data ?? [],
  })
}
