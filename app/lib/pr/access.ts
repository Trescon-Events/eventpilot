import { NextRequest, NextResponse } from 'next/server'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'
import { supabaseAdmin } from '@/app/lib/supabase'

/** True when this person is one of the event's assigned PR contacts. An assigned contact works in PR & Media without holding pr.view / pr.manage. */
export async function isPrContact(sid: string | null | undefined, eventId: string): Promise<boolean> {
  if (!sid || sid === 'super-admin') return false
  const { data } = await supabaseAdmin.from('event_pr_contacts').select('staff_id').eq('event_id', eventId).eq('staff_id', sid).maybeSingle()
  return !!data
}

/** Session + permission (or PR-contact assignment) + the per-event "pr-media" switch. Returns the session, or the error response to send. */
export async function requirePrAccess(req: NextRequest, eventId: string, level: 'view' | 'manage'): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, level === 'manage' ? 'pr.manage' : 'pr.view')) || (await isPrContact(session.sid, eventId))
  if (!ok) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  if (!session.adm && !(await isEventFeatureEnabled(eventId, 'pr-media'))) return { error: NextResponse.json({ error: 'PR & Media isn’t switched on for this event.' }, { status: 403 }) }
  return { session }
}
