// Event timezone helpers (2026-10-05). Events store a plain IANA zone name in
// events.timezone — the same format KonfHub uses for its own event
// `time_zone` (Asia/Dubai, Asia/Jakarta, Asia/Kuala_Lumpur, ...). KonfHub
// returns the legacy alias Asia/Calcutta for India; we keep the canonical
// Asia/Kolkata, so ANY value coming from KonfHub must go through
// normalizeTimezone() before it's stored or compared.

// Legacy IANA aliases KonfHub / older systems may return → canonical name.
const ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Pacific': 'America/Los_Angeles',
  'Etc/UTC': 'UTC',
  'GMT': 'UTC',
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Canonical IANA name, or null if the input isn't a real timezone. */
export function normalizeTimezone(tz: string | null | undefined): string | null {
  const t = (tz ?? '').trim()
  if (!t) return null
  const canonical = ALIASES[t] ?? t
  return isValidTimezone(canonical) ? canonical : null
}

// Zones Trescon events actually run in — the picker's quick list. Anything
// else can be typed as a full IANA name.
export const COMMON_TIMEZONES: { tz: string; place: string }[] = [
  { tz: 'Asia/Dubai', place: 'Dubai, Abu Dhabi' },
  { tz: 'Asia/Riyadh', place: 'Riyadh' },
  { tz: 'Asia/Qatar', place: 'Doha' },
  { tz: 'Asia/Kolkata', place: 'India' },
  { tz: 'Asia/Singapore', place: 'Singapore' },
  { tz: 'Asia/Kuala_Lumpur', place: 'Kuala Lumpur' },
  { tz: 'Asia/Jakarta', place: 'Jakarta' },
  { tz: 'Asia/Bangkok', place: 'Bangkok' },
  { tz: 'Asia/Manila', place: 'Manila' },
  { tz: 'Asia/Ho_Chi_Minh', place: 'Ho Chi Minh City, Hanoi' },
  { tz: 'Asia/Hong_Kong', place: 'Hong Kong' },
  { tz: 'Asia/Tokyo', place: 'Tokyo' },
  { tz: 'Australia/Sydney', place: 'Sydney, Melbourne' },
  { tz: 'Europe/London', place: 'London' },
  { tz: 'Europe/Paris', place: 'Paris, Berlin' },
  { tz: 'Africa/Lagos', place: 'Lagos' },
  { tz: 'Africa/Nairobi', place: 'Nairobi' },
  { tz: 'Africa/Johannesburg', place: 'Johannesburg' },
  { tz: 'America/New_York', place: 'New York' },
  { tz: 'America/Chicago', place: 'Chicago' },
  { tz: 'America/Los_Angeles', place: 'Los Angeles' },
  { tz: 'UTC', place: 'UTC' },
]

/** "GMT+4" style offset for a zone right now (display only; DST-aware for the date given). */
export function timezoneOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

// ── Wall-clock <-> UTC conversion (no external date library) ────────────────
// Session times are stored as UTC instants; people enter and read them as
// wall-clock time in the event's timezone. These two functions are the only
// place that conversion happens.

/** Offset of `tz` from UTC at the given instant, in ms (positive east of UTC). */
function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const g = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/
const HAS_ZONE_RE = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Parses a session time into a UTC Date. A value with an explicit zone ("…Z",
 * "…+04:00") is taken as-is; a bare wall-clock value ("2026-12-01T09:30" or
 * "2026-12-01 09:30:00") is read as time in `tz` — DST-correct. Null if invalid.
 */
export function parseEventTime(value: string, tz: string): Date | null {
  const v = value.trim()
  if (HAS_ZONE_RE.test(v)) {
    const d = new Date(v.replace(' ', 'T'))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = LOCAL_RE.exec(v)
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? 0))
  let utc = guess - tzOffsetMs(tz, new Date(guess))
  utc = guess - tzOffsetMs(tz, new Date(utc)) // second pass settles DST edges
  const out = new Date(utc)
  return Number.isNaN(out.getTime()) ? null : out
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" wall-clock in `tz` (for inputs / grouping by day). */
export function utcToZonedLocal(at: Date | string, tz: string): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}
