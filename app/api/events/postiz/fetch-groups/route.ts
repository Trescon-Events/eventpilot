import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { listPostizGroups, PostizError } from '@/app/lib/postiz'

/* GET /api/events/postiz/fetch-groups?event_id=X

   Every Postiz "customer" (group) on the whole account — not scoped to
   this event, since Postiz groups aren't an EventPilot concept, but gated
   per-event (sae.integrations.manage) since that's the permission model
   this page uses. `event_id` here is for the permission check only. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  try {
    const groups = await listPostizGroups()
    return NextResponse.json({ groups })
  } catch (e) {
    const status = e instanceof PostizError ? 502 : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not fetch groups from Postiz' }, { status })
  }
}
