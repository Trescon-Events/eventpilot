import { NextRequest, NextResponse } from 'next/server'
import { requireScreens } from '@/app/lib/screens/service'
import { allCardsResponse, isUuid, type AllCardsRequest } from '@/app/lib/screens/tables-service'

/* POST {event_id, template?, standby_template?, date?, stage?, session_id?} — every speaker card of the chosen sessions as one zip (see allCardsResponse). */
export const maxDuration = 300
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as AllCardsRequest & { event_id?: string }
  if (!isUuid(b.event_id)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, b.event_id, 'view'); if ('error' in a) return a.error
  return allCardsResponse(b.event_id, b)
}
