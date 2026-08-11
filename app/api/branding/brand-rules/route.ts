import { NextResponse } from 'next/server'
import { getBrandRulesSnapshot } from '@/app/lib/branding/brand-rules'

/* GET /api/branding/brand-rules — one-round-trip snapshot of resolved
   brand guidelines (currently: fonts by content_type), consumed by the
   Creative Templates editor to suggest a brand-correct font for a newly
   created text layer. See app/lib/branding/brand-rules.ts. */
export async function GET() {
  const snapshot = await getBrandRulesSnapshot()
  return NextResponse.json(snapshot)
}
