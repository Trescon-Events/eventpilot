import { parseEventTime } from '@/app/lib/events/timezones'

/* Emails module, phase 4 (2026-11-12) — when a scheduled email goes out and when its owner is reminded. Pure: no database, no clock of its own, so every rule is tested.
   The default time for post-event emails is the day after the event's last day at 09:00 in the event's own timezone; it can always be changed. */

export const REMIND_WITHIN_MS = 3 * 86_400_000     // start reminding about a missing required field this long before the send time
export const REMIND_EVERY_MS = 20 * 3_600_000      // …and at most this often (about once a day)
export const HEADS_UP_BEFORE_MS = 24 * 3_600_000   // "it goes out tomorrow" message

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** The day after the event's last day, 09:00 in the event's timezone (UTC when none is set). Null when the event has no end day. */
export function defaultSendTime(eventEndDay: string | null | undefined, timezone: string | null | undefined, now: Date, hour = 9): { at: Date; inPast: boolean } | null {
  if (!eventEndDay || !/^\d{4}-\d{2}-\d{2}/.test(eventEndDay)) return null
  const day = nextDay(eventEndDay.slice(0, 10))
  const local = `${day}T${String(hour).padStart(2, '0')}:00`
  const at = (timezone ? parseEventTime(local, timezone) : null) ?? new Date(`${local}:00Z`)
  return { at, inPast: at.getTime() <= now.getTime() }
}

/** "2026-11-13T09:00" typed in the event's timezone → the UTC instant. Null when it is not a real date and time. */
export function localToUtc(local: string, timezone: string | null | undefined): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  const d = (timezone ? parseEventTime(local, timezone) : null) ?? new Date(`${local}:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The UTC instant as "YYYY-MM-DDTHH:mm" on the clock of `timezone`, for a datetime-local input. */
export function utcToLocalInput(at: Date | string, timezone: string | null | undefined): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

/** A readable time in the event's timezone, e.g. "13 Nov 2026, 09:00 (Asia/Dubai)". */
export function formatSendTime(at: Date | string, timezone: string | null | undefined): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  return `${s} (${timezone || 'UTC'})`
}

export type RequiredFieldLike = { key: string; label: string }

/** Which required fields still have no value. */
export function missingFields(fields: RequiredFieldLike[], values: Record<string, unknown> | null | undefined): RequiredFieldLike[] {
  return fields.filter(f => { const v = values?.[f.key]; return typeof v !== 'string' || !v.trim() })
}

export type Due = {
  status: string
  scheduled_for: string | null
  missing: number
  last_reminder_at: string | null
  heads_up_sent_at: string | null
}
export type Decision = { release: boolean; remind: boolean; headsUp: boolean; waitingFor: 'time' | 'fields' | 'none' }

/** What to do with a scheduled email right now.
 *  release   the send time has come and every required field is filled: send it (immediately when the time had already passed when the field was filled)
 *  remind    a required field is still empty and the send time is near or past: tell the owner, at most about once a day
 *  headsUp   everything is ready and it goes out within a day: tell the owner once */
export function decide(c: Due, now: Date): Decision {
  const none: Decision = { release: false, remind: false, headsUp: false, waitingFor: 'none' }
  if (c.status !== 'scheduled' || !c.scheduled_for) return none
  const at = new Date(c.scheduled_for).getTime(), t = now.getTime()
  const due = at <= t
  if (c.missing > 0) {
    const nearOrPast = at - t <= REMIND_WITHIN_MS
    const last = c.last_reminder_at ? new Date(c.last_reminder_at).getTime() : 0
    return { release: false, remind: nearOrPast && t - last >= REMIND_EVERY_MS, headsUp: false, waitingFor: 'fields' }
  }
  if (due) return { release: true, remind: false, headsUp: false, waitingFor: 'none' }
  return { release: false, remind: false, headsUp: at - t <= HEADS_UP_BEFORE_MS && !c.heads_up_sent_at, waitingFor: 'time' }
}
