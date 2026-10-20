import { NextRequest, NextResponse } from 'next/server'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'

/* Session + event permission + the per-event "speaker-mementos" switch. Reads need the Stakeholder Hub view permission, writes the edit
   permission (same gates as the rest of the speaker roster). A switched-off event gets a clear 403, never a half-working module. */
export async function requireMementoAccess(
  req: NextRequest, eventId: string, level: 'view' | 'edit', opts: { allowDisabled?: boolean } = {},
): Promise<{ session: TcsSession; enabled: boolean } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  const key = level === 'edit' ? 'sae.stakeholders.edit' : 'sae.stakeholders.view'
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, key))) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  const enabled = await isEventFeatureEnabled(eventId, 'speaker-mementos')
  if (!enabled && !opts.allowDisabled) return { error: NextResponse.json({ error: 'Speaker Mementos isn’t switched on for this event.' }, { status: 403 }) }
  return { session, enabled }
}
