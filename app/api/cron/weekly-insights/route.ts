import { NextRequest, NextResponse } from 'next/server'
import { generateInsightsReport } from '@/app/lib/generateInsights'
import { generateWeeklyCourses } from '@/app/lib/generateWeeklyCourses'

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
