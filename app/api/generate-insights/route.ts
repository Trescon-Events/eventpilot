import { NextRequest, NextResponse } from 'next/server'
import { generateInsightsReport } from '@/app/lib/generateInsights'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'insights')
  if (gate.response) return gate.response

  const result = await generateInsightsReport('manual')
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ report: result.report })
}
