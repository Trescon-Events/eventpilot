import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { normalizeTimezone, parseEventTime } from '@/app/lib/events/timezones'
import { getKonfhubToken, updateKonfhubSession, fetchKonfhubSessionUpdatedAt, KonfhubApiError } from '@/app/lib/konfhub-agenda'

/** Admin or sae.agenda.manage on THIS event; null = allowed, otherwise the 403 response. */
export async function requireAgendaAccess(req: NextRequest, eventId: string): Promise<NextResponse | null> {
  const session = getSession(req)
  if (session?.adm) return null
  if (await hasEventPermission(session?.sid, eventId, 'sae.agenda.manage')) return null
  return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
}

/** The event's IANA timezone (canonical), or null if not set. */
export async function getEventTimezone(eventId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle()
  return normalizeTimezone(data?.timezone)
}

/**
 * Normalises a session time from the client into a UTC ISO string. Values with an
 * explicit zone are taken as-is; a bare wall-clock value is read in the event's
 * timezone (400 if the event has none and the value carries no zone).
 */
export function resolveSessionTime(value: unknown, tz: string | null): { iso: string | null } | { error: string } {
  if (value === null || value === '') return { iso: null }
  if (typeof value !== 'string') return { error: 'Times must be strings.' }
  const d = parseEventTime(value, tz ?? 'UTC')
  if (!d) return { error: `Invalid time "${value}".` }
  if (!tz && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) return { error: 'Set the event timezone on Event Details first, or send times with an explicit UTC offset.' }
  return { iso: d.toISOString() }
}

/** Confirms every id is a session of this event; returns the rows (id, konfhub_session_id). */
export async function loadEventSessions(eventId: string, ids: string[]) {
  const { data } = await supabaseAdmin.from('event_agenda_sessions').select('id, konfhub_session_id, start_timestamp, end_timestamp').eq('event_id', eventId).in('id', ids)
  return data ?? []
}

/** Confirms a track belongs to the event. */
export async function trackBelongsToEvent(eventId: string, trackId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('event_agenda_tracks').select('id').eq('id', trackId).eq('event_id', eventId).maybeSingle()
  return !!data
}

type PushFields = Parameters<typeof updateKonfhubSession>[3]

/**
 * Best-effort forward of an edit to KonfHub for a session that is linked to one.
 * Returns null on success / nothing to do, or an error description (the local
 * save has already happened — the caller surfaces this as a 207).
 * Stamps konfhub_last_synced_updated_at with KonfHub's OWN updated_at.
 */
export async function pushSessionToKonfhub(eventId: string, sessionRowId: string, konfhubSessionId: string, fields: PushFields): Promise<{ message: string; status: number } | null> {
  const { data: website } = await supabaseAdmin
    .from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', eventId).maybeSingle()
  if (!website?.konfhub_event_id || !website.konfhub_client_id || !website.konfhub_client_secret) return null
  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    await updateKonfhubSession(website.konfhub_event_id, konfhubSessionId, token, fields)
    const updatedAt = await fetchKonfhubSessionUpdatedAt(website.konfhub_event_id, konfhubSessionId, token)
    if (updatedAt) await supabaseAdmin.from('event_agenda_sessions').update({ konfhub_last_synced_updated_at: updatedAt }).eq('id', sessionRowId)
    return null
  } catch (e) {
    return { message: e instanceof Error ? e.message : 'Saved locally, but the push to KonfHub failed', status: e instanceof KonfhubApiError ? e.status : 500 }
  }
}

/**
 * The stage a room belongs to, if the room is part of this event; null if not.
 * Used to keep session.track_id and session.room_id consistent: a session in a
 * room is always on that room's stage.
 */
export async function roomStageInEvent(eventId: string, roomId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('event_agenda_rooms').select('track_id, event_agenda_tracks!inner(event_id)').eq('id', roomId).eq('event_agenda_tracks.event_id', eventId).maybeSingle()
  return data?.track_id ?? null
}
