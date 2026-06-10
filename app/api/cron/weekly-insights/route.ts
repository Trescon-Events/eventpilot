import { NextRequest, NextResponse } from 'next/server'
import { generateInsightsReport } from '@/app/lib/generateInsights'
import { generateWeeklyCourses } from '@/app/lib/generateWeeklyCourses'
import { sendOrgPulseReport } from '@/app/lib/email'
import { supabaseAdmin } from '@/app/lib/supabase'

// Called by cron-job.org every Sunday at 14:30 UTC (8:00 PM IST)
// Schedule on cron-job.org: 30 14 * * 0
// Header required: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Step 1: Generate weekly insights report
  const result = await generateInsightsReport('cron')
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Step 2: Auto-generate courses based on skill gaps + latest AI news
  const coursesResult = await generateWeeklyCourses(result.report)

  // Step 3: Compute pulse stats and send weekly org email
  try {
    const now       = new Date()
    const weekAgo   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekEnding = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

    // Completions this week
    const { count: completionsThisWeek } = await supabaseAdmin
      .from('course_completions')
      .select('*', { count: 'exact', head: true })
      .eq('passed', true)
      .gte('completed_at', weekAgo.toISOString())

    // Total completions all time
    const { count: totalCompletions } = await supabaseAdmin
      .from('course_completions')
      .select('*', { count: 'exact', head: true })
      .eq('passed', true)

    // Active staff (at least one passing completion ever)
    const { count: activeStaff } = await supabaseAdmin
      .from('course_completions')
      .select('staff_id', { count: 'exact', head: true })
      .eq('passed', true)

    // Total staff
    const { count: totalStaff } = await supabaseAdmin
      .from('staff_members')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    // Top department by completions this week
    const { data: deptRows } = await supabaseAdmin
      .from('course_completions')
      .select('staff_members!inner(department)')
      .eq('passed', true)
      .gte('completed_at', weekAgo.toISOString())

    const deptCounts: Record<string, number> = {}
    for (const row of deptRows ?? []) {
      const dept = (row.staff_members as { department?: string | null })?.department
      if (dept) deptCounts[dept] = (deptCounts[dept] ?? 0) + 1
    }
    const topDeptEntry = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0]
    const topDept             = topDeptEntry?.[0] ?? null
    const topDeptCompletions  = topDeptEntry?.[1] ?? 0

    // Top skill gap from insights report
    const topSkillGap = result.report.skills_needed?.[0]?.skill ?? null

    // Super admin emails
    const { data: admins } = await supabaseAdmin
      .from('staff_members')
      .select('email')
      .eq('job_level', 'super_admin')
      .eq('is_active', true)

    const toEmails = (admins ?? []).map(a => a.email).filter(Boolean) as string[]

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventpilot.tresconglobal.com'

    if (toEmails.length > 0) {
      await sendOrgPulseReport({
        to:                   toEmails,
        weekEnding,
        totalCompletions:     totalCompletions     ?? 0,
        completionsThisWeek:  completionsThisWeek  ?? 0,
        activeStaff:          activeStaff          ?? 0,
        totalStaff:           totalStaff           ?? 0,
        topSkillGap,
        topDept,
        topDeptCompletions,
        newCoursesGenerated:  coursesResult.generated,
        adminUrl:             appUrl,
      })
    }
  } catch (emailErr) {
    // Non-fatal — cron still succeeds even if email fails
    console.error('Pulse email failed:', emailErr)
  }

  return NextResponse.json({
    ok: true,
    generated_at:      result.report.generated_at,
    total_submissions: result.report.total_submissions,
    courses_generated: coursesResult.generated,
    courses_skipped:   coursesResult.skipped,
    courses:           coursesResult.courses,
    course_errors:     coursesResult.errors.length > 0 ? coursesResult.errors : undefined,
  })
}
