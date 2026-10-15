import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* Who may look at an event's SAE setup / run sample generations: platform admins, or anyone who can generate announcements or manage
   the event's forms. Approving is stricter (platform admin only) and is checked in approve/route.ts. */
export async function requireSetupView(req: NextRequest, eventId: string): Promise<NextResponse | null> {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (session.adm) return null
  if (await hasEventPermission(session.sid, eventId, 'sae.announcements.generate') || await hasEventPermission(session.sid, eventId, 'sae.forms.manage')) return null
  return NextResponse.json({ error: 'You do not have access to this event’s setup.' }, { status: 403 })
}
