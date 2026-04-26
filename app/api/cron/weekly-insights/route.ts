import { NextRequest, NextResponse } from 'next/server'
import { generateInsightsReport } from '@/app/lib/generateInsights'

// Called by cron-job.org every Sunday at 14:30 UTC (8:00 PM IST)
// Schedule on cron-job.org: 30 14 * * 0
// Header required: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await generateInsightsReport('cron')
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    generated_at: result.report.generated_at,
    total_submissions: result.report.total_submissions,
  })
}
