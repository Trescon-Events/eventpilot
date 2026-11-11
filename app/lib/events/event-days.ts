import { parseEventTime } from './timezones'

/* One place that says when an event happens (2026-11-11). Three dates exist on an event and features must not pick one at random:
     event days    actual_start_date / actual_end_date   the real event (Staff Portal "Event Start/End Date")
     project dates event_date / end_date                 staff allocation, often a long cycle (Staff Portal "Project Start/End Date")
     public text   public_dates_display                  wording for materials, never read by logic
   Anything that fires an action or deletes something (post-event banner, thank-you, retention) uses the event days only, via strictEventDays.
   Display and sorting may fall back to the project dates, and say so (source = 'project_dates'). */

export type DateFields = { actual_start_date?: string | null; actual_end_date?: string | null; event_date?: string | null; end_date?: string | null }
export type EventDays = { start: string | null; end: string | null; source: 'event_days' | 'project_dates' | 'none' }

const iso = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

/** The real event days, or nothing. No fallback — use this for anything that acts. A start with no end is a one-day event. */
export function strictEventDays(e: DateFields): { start: string | null; end: string | null } {
  const start = iso(e.actual_start_date); const end = iso(e.actual_end_date) ?? start
  return { start: start ?? (end ?? null), end }
}

/** Event days when they exist, otherwise the project dates, labelled. For display, sorting and rough "weeks away" figures only. */
export function eventDays(e: DateFields): EventDays {
  const s = strictEventDays(e)
  if (s.start) return { ...s, source: 'event_days' }
  const start = iso(e.event_date); const end = iso(e.end_date) ?? start
  return start ? { start, end, source: 'project_dates' } : { start: null, end: null, source: 'none' }
}

export const hasEventDays = (e: DateFields) => !!strictEventDays(e).start

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** The event is over once its last day has finished in the event's own timezone (UTC when none is set), so a Dubai evening is still the event. */
export function eventEnded(endDate: string | null | undefined, now: Date, timezone?: string | null): boolean {
  const end = iso(endDate)
  if (!end) return false
  const at = (timezone ? parseEventTime(`${nextDay(end)}T00:00`, timezone) : null) ?? new Date(`${nextDay(end)}T00:00:00Z`)
  return now.getTime() >= at.getTime()
}
