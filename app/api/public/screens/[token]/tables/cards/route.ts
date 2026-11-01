import { NextRequest, NextResponse } from 'next/server'
import { linkByToken } from '@/app/lib/screens/service'
import { allCardsResponse, type AllCardsRequest } from '@/app/lib/screens/tables-service'

/* POST {template?, standby_template?, date?, stage?, session_id?} — every speaker card of the chosen sessions as one zip, for the technician's private link. */
export const maxDuration = 300
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token, 'tables')
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const b = await req.json().catch(() => ({})) as AllCardsRequest
  return allCardsResponse(link.event_id, b)
}
