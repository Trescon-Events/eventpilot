import { NextRequest, NextResponse } from 'next/server'
import { requireScreens } from '@/app/lib/screens/service'
import { cardResponse, isUuid, tableVariants } from '@/app/lib/screens/tables-service'

/* GET ?event_id&template&name&moderator=1&scale=0.25 (or &standby=1) — one table card as a PNG (an <img> preview, or &download=1&file=… for a single file). */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!isUuid(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'view'); if ('error' in a) return a.error
  return cardResponse(await tableVariants(eventId), req.nextUrl.searchParams)
}
