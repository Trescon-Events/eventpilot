import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { loadSpeakerList } from '@/app/lib/speaker-emails/server'

/* GET ?event_id= — every active speaker with who their producer is, whether they can be emailed, and when they were last emailed from this module. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied
  const session = getSession(req)
  const canSend = !!session?.adm || (await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.edit'))
  return NextResponse.json({ rows: await loadSpeakerList(eventId), can_send: canSend, me: session?.sid ?? null })
}
