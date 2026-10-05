import { parseEventTime, utcToZonedLocal } from '@/app/lib/events/timezones'
import { COLOUR_TOKENS, colourToCss, type ColourToken } from '@/app/lib/agenda/colours'

export type Track = { id: string; name: string; order_index: number; konfhub_track_title?: string | null }
export type Room = { id: string; track_id: string; name: string; order_index: number }
export type Session = {
  id: string
  track_id: string | null
  room_id: string | null
  title: string
  description: string | null
  session_type: string
  content_type: string | null
  start_timestamp: string | null
  end_timestamp: string | null
  location: string | null
  colour: string | null
  order_index: number
  capacity: number | null
  status: 'draft' | 'published'
  konfhub_session_id: string | null
  updated_at: string | null
}
export type SpeakerLink = {
  session_id: string
  order_index: number
  role_tag_id: string
  event_speakers: { id: string; name: string; public_name: string | null; company: string | null } | null
}
export type Speaker = { id: string; name: string; public_name?: string | null; company: string | null }
export type Role = { tag_id: string; label: string }

export const SNAP_MIN = 15
export const MIN_DURATION = 15

export const SESSION_TYPES: { value: string; label: string }[] = [
  { value: 'speaker_session', label: 'Session' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'roundtable', label: 'Roundtable' },
  { value: 'networking', label: 'Networking' },
  { value: 'registration', label: 'Registration' },
  { value: 'refreshment_break', label: 'Refreshment break' },
  { value: 'lunch_break', label: 'Lunch break' },
  { value: 'custom_session', label: 'Other' },
]
export const CONTENT_TYPES = ['Keynote', 'Panel Discussion', 'Fireside Chat', 'Roundtable', 'Presentation', 'Masterclass']

export const SWATCHES: readonly ColourToken[] = COLOUR_TOKENS

/** CSS colour for a session: its own colour, else a default by type/format. */
export function sessionColour(s: Pick<Session, 'colour' | 'session_type' | 'content_type'>): string {
  if (s.colour) return colourToCss(s.colour)
  if (s.session_type === 'lunch_break' || s.session_type === 'refreshment_break') return colourToCss('indigo')
  if (s.session_type === 'networking' || s.session_type === 'registration') return colourToCss('orange')
  if (s.session_type === 'workshop') return colourToCss('info')
  if (s.session_type === 'roundtable') return colourToCss('success')
  if (s.content_type === 'Keynote') return colourToCss('purple')
  if (s.content_type === 'Panel Discussion') return colourToCss('amber')
  return colourToCss('teal')
}

export const pad = (n: number) => String(n).padStart(2, '0')
export const minutesToHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
export const hhmmToMinutes = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0) }
export const snap = (m: number) => Math.round(m / SNAP_MIN) * SNAP_MIN

/** Wall-clock parts of a UTC instant in the event timezone. */
export function localParts(iso: string | null, tz: string): { date: string; minutes: number } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const l = utcToZonedLocal(d, tz) // YYYY-MM-DDTHH:mm
  return { date: l.slice(0, 10), minutes: hhmmToMinutes(l.slice(11, 16)) }
}

/** Wall-clock "YYYY-MM-DDTHH:mm" the API reads in the event timezone. */
export const wallClock = (date: string, minutes: number) => `${date}T${minutesToHHMM(minutes)}`

export function wallClockToIso(date: string, minutes: number, tz: string): string | null {
  return parseEventTime(wallClock(date, minutes), tz)?.toISOString() ?? null
}

export type Placed = { s: Session; date: string; start: number; end: number }

/** Sessions with a valid time, placed on their local day (a session that crosses midnight is clamped to its start day). */
export function placeSessions(sessions: Session[], tz: string): Placed[] {
  const out: Placed[] = []
  for (const s of sessions) {
    const a = localParts(s.start_timestamp, tz); const b = localParts(s.end_timestamp, tz)
    if (!a || !b) continue
    const end = b.date === a.date ? b.minutes : 24 * 60
    out.push({ s, date: a.date, start: a.minutes, end: Math.max(end, a.minutes + MIN_DURATION) })
  }
  return out
}

/** Session ids that overlap another session in the same stage (and room, when the stage has rooms). */
export function stageClashes(placed: Placed[]): Set<string> {
  const ids = new Set<string>()
  const byKey = new Map<string, Placed[]>()
  for (const p of placed) { const k = `${p.date}|${p.s.track_id ?? ''}|${p.s.room_id ?? ''}`; (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(p) }
  for (const list of byKey.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (list[i].start < list[j].end && list[j].start < list[i].end) { ids.add(list[i].s.id); ids.add(list[j].s.id) }
    }
  }
  return ids
}

/** speaker id -> set of session ids where they're double-booked (overlapping sessions in different or same stages). */
export function speakerClashes(placed: Placed[], links: SpeakerLink[]): Map<string, string[]> {
  const speakersBySession = new Map<string, Set<string>>()
  for (const l of links) if (l.event_speakers) (speakersBySession.get(l.session_id) ?? speakersBySession.set(l.session_id, new Set()).get(l.session_id)!).add(l.event_speakers.id)
  const out = new Map<string, string[]>() // session id -> speaker names clashing
  const nameOf = new Map(links.filter(l => l.event_speakers).map(l => [l.event_speakers!.id, l.event_speakers!.public_name || l.event_speakers!.name]))
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j]
    if (a.date !== b.date || !(a.start < b.end && b.start < a.end)) continue
    const sa = speakersBySession.get(a.s.id), sb = speakersBySession.get(b.s.id)
    if (!sa || !sb) continue
    for (const id of sa) if (sb.has(id)) {
      for (const sid of [a.s.id, b.s.id]) (out.get(sid) ?? out.set(sid, []).get(sid)!).push(nameOf.get(id) ?? 'A speaker')
    }
  }
  return out
}

export const fmtDay = (date: string) => new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
export const fmtRange = (start: number, end: number) => `${minutesToHHMM(start)} – ${minutesToHHMM(end % (24 * 60) === 0 && end > 0 ? 24 * 60 - 1 : end)}`
