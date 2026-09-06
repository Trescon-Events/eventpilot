import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { listPostizIntegrations, PostizError } from '@/app/lib/postiz'

/* GET /api/events/postiz/fetch-channels?event_id=X&group_id=Y

   Every channel under one Postiz group — used right after a group is
   picked in the Integrations page's dropdown, before anything is saved
   (so the producer sees the real channel list to select from). Distinct
   from the existing /api/events/postiz-channels route, which reads the
   event's ALREADY-SAVED postiz_profile_key from the DB — this one takes
   group_id directly so it works on a not-yet-saved selection too. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!eventId || !groupId) return NextResponse.json({ error: 'event_id and group_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  try {
    const channels = await listPostizIntegrations(groupId)
    return NextResponse.json({ channels })
  } catch (e) {
    const status = e instanceof PostizError ? 502 : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not fetch channels from Postiz' }, { status })
  }
}
