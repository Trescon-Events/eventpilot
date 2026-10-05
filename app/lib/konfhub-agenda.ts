// Client for KonfHub's Agenda (Tracks/Sessions) API — used by the new
// Agenda Structure fetch-and-reconcile flow (Integrations page) and the new
// Agenda Builder's push-back to KonfHub, for events with
// event_websites.agenda_source === 'konfhub_authoritative'.
//
// Separate file from konfhub-speakers.ts (which owns the Speakers API and
// the narrow KonfhubSession type used only for the speaker delete-
// confirmation check) — Agenda's real shape is much richer and deserves its
// own types. Reuses getKonfhubToken/KonfhubApiError from konfhub-speakers.ts
// rather than duplicating them.
//
// All fields/endpoints here were confirmed live this session, either
// against KonfHub's real Postman "Private APIs" doc or by direct probe
// against the real Dubai Future Finance Week KonfHub event
// (f133240e-1331-44f2-8d6e-6217b3b8984d).

import { getKonfhubToken, KonfhubApiError } from './konfhub-speakers'

const API_BASE = 'https://api.konfhub.com/event'

// GET .../public/tracks?track_date=YYYY-MM-DD — REQUIRED param, confirmed
// live: there is no "all tracks" call, every fetch must specify one date.
// Confirmed live against DFFW: the same real-world stage (e.g. "Dubai
// FinTech Summit Plenary 1") gets a brand-new numeric track_id on every
// date it recurs (4532 on 2026-11-02, 4600 on 2026-11-03) — track_id is
// NOT a stable identity for a recurring stage, only (date, id) together is.
// Tracks carry no updated_at (confirmed live) — track rename can only be
// detected by diffing track_title text on refetch, never by timestamp.
export type KonfhubTrackSession = {
  session_id: string
  session_title: string
  session_description?: string | null
  session_type?: number | null
  start_timestamp?: string | null
  end_timestamp?: string | null
  session_location?: string | null
  session_colour?: string | null
  session_order?: number | null
  track_assigned: boolean
  tags?: { id: string; name: string }[]
  session_speakers?: { speaker_id: string; name: string }[]
  created_at?: string | null
  updated_at?: string | null
  updated_by?: string | null
}

export type KonfhubTrack = {
  track_id: string
  track_title: string
  track_description?: string | null
  track_date: string
  start_time?: string | null
  end_time?: string | null
  track_order?: number | null
  track_sessions: KonfhubTrackSession[]
}

function normalizeSession(s: Record<string, unknown>): KonfhubTrackSession {
  return {
    session_id: String(s.session_id),
    session_title: s.session_title as string,
    session_description: (s.session_description as string) ?? null,
    session_type: (s.session_type as number) ?? null,
    start_timestamp: (s.start_timestamp as string) ?? null,
    end_timestamp: (s.end_timestamp as string) ?? null,
    session_location: (s.session_location as string) ?? null,
    session_colour: (s.session_colour as string) ?? null,
    session_order: (s.session_order as number) ?? null,
    track_assigned: Boolean(s.track_assigned),
    tags: ((s.tags as { id: string; name: string }[]) ?? []),
    session_speakers: ((s.session_speakers as { speaker_id: string | number; name: string }[]) ?? [])
      .map(sp => ({ speaker_id: String(sp.speaker_id), name: sp.name })),
    created_at: (s.created_at as string) ?? null,
    updated_at: (s.updated_at as string) ?? null,
    updated_by: (s.updated_by as string) ?? null,
  }
}

export async function fetchKonfhubTracksForDate(konfhubEventId: string, token: string, trackDate: string): Promise<KonfhubTrack[]> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/public/tracks?track_date=${trackDate}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => []) as Array<Record<string, unknown>> | { error?: string }
  if (!res.ok || !Array.isArray(data)) throw new KonfhubApiError((data as { error?: string })?.error || 'Failed to fetch KonfHub tracks', res.status)
  return data.map(t => ({
    track_id: String(t.track_id),
    track_title: t.track_title as string,
    track_description: (t.track_description as string) ?? null,
    track_date: t.track_date as string,
    start_time: (t.start_time as string) ?? null,
    end_time: (t.end_time as string) ?? null,
    track_order: (t.track_order as number) ?? null,
    track_sessions: ((t.track_sessions as Record<string, unknown>[]) ?? []).map(normalizeSession),
  }))
}

// GET .../public/filters — informational only. Confirmed live against
// DFFW: a "Stage" filter exists with tags like "Roundtable Room 1/2/3" but
// is not applied to any real session — the actual mechanism in use is
// Tracks, not this. Surfaced read-only in the reconcile UI, never mapped.
export type KonfhubFilter = { id: string; name: string; tags: { id: string; name: string }[] }

export async function fetchKonfhubFilters(konfhubEventId: string, token: string): Promise<KonfhubFilter[]> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/public/filters`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => []) as Array<Record<string, unknown>> | { error?: string }
  if (!res.ok || !Array.isArray(data)) throw new KonfhubApiError((data as { error?: string })?.error || 'Failed to fetch KonfHub filters', res.status)
  return data.map(f => ({
    id: String(f.id),
    name: f.name as string,
    tags: (f.tags as { id: string; name: string }[]) ?? [],
  }))
}

// GET .../sessions?sessions_to_return=all — richer read than
// listKonfhubSessions in konfhub-speakers.ts (that one only exists for the
// speaker delete-confirmation check and drops description/times/tags).
// Used for drift re-checks: no track_id field exists on this flat shape
// (only a track_assigned boolean, confirmed live), so this can tell us a
// session changed but never which track it's under — track membership can
// only come from fetchKonfhubTracksForDate's nested track_sessions.
export async function fetchKonfhubSessionsFull(konfhubEventId: string, token: string): Promise<KonfhubTrackSession[]> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/sessions?sessions_to_return=all`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => []) as Array<Record<string, unknown>> | { error?: string }
  if (!res.ok || !Array.isArray(data)) throw new KonfhubApiError((data as { error?: string })?.error || 'Failed to fetch KonfHub sessions', res.status)
  return data.map(normalizeSession)
}

// PUT .../sessions/:session-id — confirmed live via the real Postman doc
// (Agenda > Sessions > Update Sessions), all fields optional. session_speakers
// is confirmed present in the doc's own sample body as a plain array of
// speaker IDs (KonfHub's own numeric id, i.e. event_speakers.konfhub_speaker_id)
// — this is what the Agenda Builder's speaker-picker push-back uses.
export async function updateKonfhubSession(
  konfhubEventId: string,
  sessionId: string,
  token: string,
  fields: Partial<{
    session_title: string
    session_description: string
    session_type: number
    start_timestamp: string
    end_timestamp: string
    session_location: string
    session_speakers: string[]
    session_colour: string
    tags: { id: string; name: string }[]
    track_assigned: boolean
  }>
): Promise<void> {
  // KonfHub only accepts "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DDTHH:MM:SS" (UTC, no
  // offset) — an ISO string with +00:00 or Z is rejected with 400 "Invalid
  // timestamp format" (confirmed live 2026-10-04), so normalise every time
  // here regardless of what the caller holds.
  const payload: Record<string, unknown> = { ...fields }
  if (fields.session_speakers) payload.session_speakers = fields.session_speakers.map(Number)
  if (fields.start_timestamp) payload.start_timestamp = toKonfhubTimestamp(fields.start_timestamp)
  if (fields.end_timestamp) payload.end_timestamp = toKonfhubTimestamp(fields.end_timestamp)
  const res = await fetch(`${API_BASE}/${konfhubEventId}/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new KonfhubApiError(data.error || 'Failed to update KonfHub session', res.status)
  }
}

// POST .../tracks — all five fields required (confirmed live 2026-10-04);
// returns the new numeric track id. KonfHub tracks are PER DATE (a recurring
// stage gets a new id each day), so the push creates one per stage per day.
export async function createKonfhubTrack(konfhubEventId: string, token: string, f: { track_title: string; track_date: string; start_time: string; end_time: string; track_order: number }): Promise<string> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/tracks`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
  const data = await res.json().catch(() => ({})) as { track_id?: number | string; error?: string }
  if (!res.ok || data.track_id === undefined) throw new KonfhubApiError(data.error || 'Failed to create KonfHub track', res.status)
  return String(data.track_id)
}

// PUT .../tracks/:id {track_sessions} REPLACES the track's whole session list,
// and KonfHub does not remove a session from another track when it's added
// here (one session can sit in two tracks at once, confirmed live) — callers
// must send the complete desired list and clean up the old track themselves.
export async function setKonfhubTrackSessions(konfhubEventId: string, trackId: string, token: string, sessionIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/tracks/${trackId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ track_sessions: sessionIds.map(Number) }) })
  if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new KonfhubApiError(d.error || 'Failed to update KonfHub track sessions', res.status) }
}

// POST .../sessions — session_title, session_type, session_order,
// track_assigned, session_colour and both timestamps are required; `tags`
// must be {id, name} objects (plain id strings are rejected). A session can't
// be created inside a track directly — assign it with setKonfhubTrackSessions.
export async function createKonfhubSession(konfhubEventId: string, token: string, f: {
  session_title: string; session_type: number; session_order: number; session_colour: string; start_timestamp: string; end_timestamp: string
  session_description?: string; session_speakers?: string[]; tags?: { id: string; name: string }[]
}): Promise<string> {
  const payload: Record<string, unknown> = { ...f, track_assigned: false, start_timestamp: toKonfhubTimestamp(f.start_timestamp), end_timestamp: toKonfhubTimestamp(f.end_timestamp) }
  if (f.session_speakers) payload.session_speakers = f.session_speakers.map(Number)
  const res = await fetch(`${API_BASE}/${konfhubEventId}/sessions`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await res.json().catch(() => ({})) as { session_id?: number | string; error?: string }
  if (!res.ok || data.session_id === undefined) throw new KonfhubApiError(data.error || 'Failed to create KonfHub session', res.status)
  return String(data.session_id)
}

// Any ISO/Date value -> KonfHub's UTC "YYYY-MM-DD HH:MM:SS".
export function toKonfhubTimestamp(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value.includes(' ') && !/[Zz+]/.test(value) ? value.replace(' ', 'T') + 'Z' : value) : value
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

// KonfHub's own updated_at for one session, as an ISO instant — used after a
// push to stamp konfhub_last_synced_updated_at with KonfHub's clock rather
// than ours (our local clock made every push look like drift on the next
// fetch). Null if the session can't be found.
export async function fetchKonfhubSessionUpdatedAt(konfhubEventId: string, sessionId: string, token: string): Promise<string | null> {
  const all = await fetchKonfhubSessionsFull(konfhubEventId, token)
  const u = all.find(s => s.session_id === String(sessionId))?.updated_at
  if (!u) return null
  return /[Zz+]/.test(u) ? u : u.replace(' ', 'T') + 'Z'
}

export { getKonfhubToken, KonfhubApiError }
