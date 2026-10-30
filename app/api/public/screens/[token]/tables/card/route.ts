import { NextRequest, NextResponse } from 'next/server'
import { linkByToken } from '@/app/lib/screens/service'
import { cardResponse, tableVariants } from '@/app/lib/screens/tables-service'

/* GET ?template&name&moderator=1&scale=0.25 (or &standby=1) — one table card as a PNG, for the AV console's link. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token, 'tables')
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return cardResponse(await tableVariants(link.event_id), req.nextUrl.searchParams)
}
