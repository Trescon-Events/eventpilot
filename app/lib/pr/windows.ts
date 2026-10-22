/* Availability windows for media interviews (PR & Media). Pure functions, no I/O.
   A window is event-local wall-clock time on one day; the speaker's answer is a set of them, never a booking. */

export type MediaWindow = { date: string; from: string; to: string }
export type SlotMinutes = 30 | 60
export type MediaDay = { day: string; open: string; close: string; slot?: SlotMinutes }
export const slotOf = (d: { slot?: number }): SlotMinutes => (d.slot === 30 ? 30 : 60)

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
export const toMinutes = (t: string): number => { const m = HHMM.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN }
export const fromMinutes = (n: number): string => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

/** Sorts, and joins windows on the same day that overlap or touch (09:00-10:00 + 10:00-11:00 -> 09:00-11:00). */
export function mergeWindows(ws: MediaWindow[]): MediaWindow[] {
  const sorted = [...ws].sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.from) - toMinutes(b.from))
  const out: MediaWindow[] = []
  for (const w of sorted) {
    const last = out[out.length - 1]
    if (last && last.date === w.date && toMinutes(w.from) <= toMinutes(last.to)) {
      if (toMinutes(w.to) > toMinutes(last.to)) last.to = w.to
    } else out.push({ ...w })
  }
  return out
}

/** Checks a speaker's windows against the days the PR person opened. Returns the merged windows or a message fit to show the speaker. */
export function validateWindows(input: unknown, days: MediaDay[]): { ok: true; windows: MediaWindow[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Please choose your availability.' }
  if (input.length > 60) return { ok: false, error: 'Too many time ranges.' }
  const byDay = new Map(days.map(d => [d.day, d]))
  const cleaned: MediaWindow[] = []
  for (const raw of input) {
    const w = raw as Partial<MediaWindow> | null
    if (!w || typeof w.date !== 'string' || typeof w.from !== 'string' || typeof w.to !== 'string' || !DATE.test(w.date) || !HHMM.test(w.from) || !HHMM.test(w.to)) return { ok: false, error: 'One of the time ranges is not valid.' }
    const d = byDay.get(w.date)
    if (!d) return { ok: false, error: 'One of the days you chose is not an event day.' }
    const f = toMinutes(w.from), t = toMinutes(w.to)
    if (t <= f) return { ok: false, error: 'A time range ends before it starts.' }
    if (f < toMinutes(d.open) || t > toMinutes(d.close)) return { ok: false, error: `A time range falls outside the event hours (${d.open}-${d.close}).` }
    cleaned.push({ date: w.date, from: w.from, to: w.to })
  }
  return { ok: true, windows: mergeWindows(cleaned) }
}

/** The slots the form shows for one day: open..close split on the slot grid (30 or 60 minutes; an off-grid start or end gives a shorter first/last slot). */
export function dayBlocks(open: string, close: string, slot: SlotMinutes = 60): { from: string; to: string }[] {
  const o = toMinutes(open), c = toMinutes(close)
  if (!(c > o)) return []
  const out: { from: string; to: string }[] = []
  for (let s = o; s < c;) { const e = Math.min(c, (Math.floor(s / slot) + 1) * slot); out.push({ from: fromMinutes(s), to: fromMinutes(e) }); s = e }
  return out
}

/** Every day from `start` to `end` inclusive (YYYY-MM-DD), capped so a wrong date can't make a huge list. */
export function daysBetween(start: string, end: string, cap = 14): string[] {
  if (!DATE.test(start) || !DATE.test(end) || end < start) return DATE.test(start) ? [start] : []
  const out: string[] = []
  for (let t = Date.parse(start + 'T00:00:00Z'); out.length < cap; t += 86400000) { const d = new Date(t).toISOString().slice(0, 10); out.push(d); if (d >= end) break }
  return out
}

/** "09:00-12:00, 16:00-17:00" for one day's windows. */
export const describeWindows = (ws: MediaWindow[]): string => ws.map(w => `${w.from}-${w.to}`).join(', ')
