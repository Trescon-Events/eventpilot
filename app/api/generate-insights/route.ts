import { NextResponse } from 'next/server'
import { generateInsightsReport } from '@/app/lib/generateInsights'

export async function POST() {
  const result = await generateInsightsReport('manual')
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ report: result.report })
}
