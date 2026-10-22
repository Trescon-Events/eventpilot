import { NextRequest, NextResponse } from 'next/server'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'
import { loadSettings, loadMediaDays, prContactsFor } from './media-interest'

/** Asking speakers is a Stakeholder Hub action: edit rights on the hub, the per-event "pr-media" switch, and PR set up (days confirmed, a PR person to introduce). */
export async function requireMediaSendAccess(req: NextRequest, eventId: string): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit'))) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  if (!(await isEventFeatureEnabled(eventId, 'pr-media'))) return { error: NextResponse.json({ error: 'PR & Media isn’t switched on for this event.' }, { status: 403 }) }
  return { session }
}

/** Why a request can't be sent yet, or null when PR is ready. */
export async function mediaSetupProblem(eventId: string): Promise<string | null> {
  const [settings, days, pr] = await Promise.all([loadSettings(eventId), loadMediaDays(eventId), prContactsFor(eventId)])
  if (!days.length || !settings.days_confirmed_at) return 'The PR team needs to confirm the media days and hours first (PR & Media › Settings).'
  if (!pr.contacts.length) return 'Nobody is set as the PR contact for this event yet (PR & Media › Settings).'
  return null
}
