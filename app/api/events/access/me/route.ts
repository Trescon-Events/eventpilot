import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/app/lib/registry/access'
import { getEventPermissions } from '@/app/lib/access/event-access'

/* GET /api/events/access/me?event_id=uuid — the current session's own
   per-event permission set (app/lib/access/event-access.ts). Not
   admin-gated — every authenticated staffer needs this to know what they
   can do on a given event; it never reveals anyone else's grants. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = await getServerSession()
  if (!session) return NextResponse.json({ permissions: [] })

  const isPlatformAdmin = !!session.adm
  const permissions = isPlatformAdmin ? ['*'] : Array.from(await getEventPermissions(session.sid, eventId))
  return NextResponse.json({ permissions })
}
