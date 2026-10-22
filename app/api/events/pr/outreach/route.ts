import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'
import { loadMediaRows } from '@/app/lib/pr/media-interest'
import { mediaSetupProblem } from '@/app/lib/pr/send-access'

/* GET ?event_id= — the producers' view of media interviews: EVERY active speaker with their state (not asked / waiting / interested / not available), plus whether sending is
   set up yet. Viewing needs Stakeholder Hub view rights; sending (separate routes) needs edit rights. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.view'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  if (!session.adm && !(await isEventFeatureEnabled(eventId, 'pr-media'))) return NextResponse.json({ error: 'PR & Media isn’t switched on for this event.' }, { status: 403 })
  const canSend = !!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit'))
  return NextResponse.json({ rows: await loadMediaRows(eventId), can_send: canSend, can_delete: !!session.adm, setup_problem: await mediaSetupProblem(eventId) })
}
