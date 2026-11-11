/* Staff Portal event core (2026-11-11). Pure functions, no DB, so they can be tested and shared by the full sync and the per-event refresh.

   Three dates exist and must never be mixed up:
     project dates  → events.event_date / end_date      (staff allocation; Staff Portal "Project Start/End Date")
     event days     → events.actual_start_date / _end   (the real event; Staff Portal "Event Start/End Date")
     public dates   → events.public_dates_display       (text shown on materials; auto-filled from the event days, then editable) */

export type SpDates = { start: string | null; end: string | null }
export type ResolvedDates = { layout: 'project_prefixed' | 'event_prefixed' | 'unknown'; project: SpDates; event: SpDates }

const iso = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const has = (row: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(row, k)

/** The Staff Portal renamed its date fields. Which pair means what is read from the keys the row actually carries, so a wrong guess can never put event days into the project dates:
 *  project_start_date / project_end_date present → those are the project dates and plain start_date / end_date are the event days;
 *  event_start_date / event_end_date present → those are the event days and plain start_date / end_date are the project dates;
 *  neither present → the old shape: start_date / end_date are the project dates and the event days are left untouched. */
export function resolveDates(row: Record<string, unknown>): ResolvedDates {
  if (has(row, 'project_start_date') || has(row, 'project_end_date')) {
    return { layout: 'project_prefixed', project: { start: iso(row.project_start_date), end: iso(row.project_end_date) }, event: { start: iso(row.start_date), end: iso(row.end_date) } }
  }
  if (has(row, 'event_start_date') || has(row, 'event_end_date')) {
    return { layout: 'event_prefixed', project: { start: iso(row.start_date), end: iso(row.end_date) }, event: { start: iso(row.event_start_date), end: iso(row.event_end_date) } }
  }
  return { layout: 'unknown', project: { start: iso(row.start_date), end: iso(row.end_date) }, event: { start: null, end: null } }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const parts = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), d: Number(d.slice(8, 10)) })

/** The house format for dates on materials: "5 November 2026", "3–5 November 2026", "30 October – 2 November 2026". Null when the dates are missing or out of order. */
export function formatPublicDates(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = iso(start); const e = iso(end) ?? s
  if (!s || !e || e < s) return null
  const a = parts(s); const b = parts(e)
  if (a.m < 1 || a.m > 12 || b.m < 1 || b.m > 12) return null
  if (s === e) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]} ${a.y}`
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${a.y}`
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`
}

const blank = (v: string | null | undefined) => !v || !v.trim()

/** A suggested value is written only into an empty field, or one still holding what we last filled in ourselves. A value a person has typed is never overwritten. */
export function decideAutoFill(current: string | null | undefined, lastAuto: string | null | undefined, suggested: string | null | undefined): { write: boolean; value: string | null } {
  if (blank(suggested)) return { write: false, value: current ?? null }
  if (blank(current) || (lastAuto && current!.trim() === lastAuto.trim())) {
    return current?.trim() === suggested!.trim() ? { write: false, value: current ?? null } : { write: true, value: suggested!.trim() }
  }
  return { write: false, value: current ?? null }
}

/** Event days from the Staff Portal always win when it sends them; when it sends nothing the days already here are kept. An end before the start is refused. */
export function decideEventDays(
  current: SpDates, portal: SpDates,
): { patch: { actual_start_date?: string; actual_end_date?: string }; problem: string | null } {
  const start = portal.start ?? current.start
  const end = portal.end ?? current.end
  if (start && end && end < start) return { patch: {}, problem: 'The Staff Portal event end date is before its start date, so the event days were not changed.' }
  const patch: { actual_start_date?: string; actual_end_date?: string } = {}
  if (portal.start && portal.start !== current.start) patch.actual_start_date = portal.start
  if (portal.end && portal.end !== current.end) patch.actual_end_date = portal.end
  return { patch, problem: null }
}

/** Names the Staff Portal may use for an umbrella's or project's type. Absent → the value already here is kept. */
export const portalType = (row: Record<string, unknown>): string | null => {
  const v = row.project_type ?? row.type
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Fields the Staff Portal owns on a linked record. They cannot be edited in EventPilot. */
export const EVENT_PORTAL_FIELDS = ['name', 'client_name', 'status', 'type', 'event_date', 'end_date'] as const
export const UMBRELLA_PORTAL_FIELDS = ['name', 'client_name', 'status', 'event_date', 'end_date'] as const
export const PORTAL_LOCK_MESSAGE = 'This field cannot be edited here. Update it in the Staff Portal, then use Refresh from Staff Portal.'

const norm = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v).slice(0, 10) === String(v) && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : String(v).trim())
const normDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : norm(v))

/** Splits an edit into what may be saved and which Staff Portal fields it tried to change. A form that sends an owned field back unchanged is fine: it is dropped from the save, not refused. */
export function stripPortalFields(current: Record<string, unknown>, body: Record<string, unknown>, fields: readonly string[]): { body: Record<string, unknown>; blocked: string[] } {
  const out = { ...body }; const blocked: string[] = []
  for (const f of fields) {
    if (!(f in out)) continue
    if (normDate(out[f]) !== normDate(current[f])) blocked.push(f)
    delete out[f]
  }
  return { body: out, blocked }
}

export const STATUS_MAP: Record<string, string> = {
  planning: 'planning', active: 'active', on_hold: 'on_hold', completed: 'completed', cancelled: 'cancelled',
  // The Staff Portal's "Post-event" (added 2026-11-11) is still an open project; EventPilot has no such status, so it stays Active rather than falling back to Planning.
  post_event: 'active',
}

/** Staff Portal status → EventPilot status. "Post-event", "post event" and "post_event" all mean the same; anything unknown falls back to Planning as before. */
export const mapStatus = (v: string | null | undefined): string => STATUS_MAP[(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? 'planning'

