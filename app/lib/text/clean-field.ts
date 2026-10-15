/* Lossless clean-up for event text fields — Unicode space separators (NBSP etc.) become a normal space, zero-width characters and
   soft hyphens are removed, repeated spaces collapse and both ends are trimmed. Letters are never touched: a lookalike letter
   (lower-case l for capital I) is flagged by the SAE readiness check, never auto-changed. */
const SPACE_SEPARATORS = /[   -   　]/g
const INVISIBLES = /[​-‍⁠﻿­]/g

export function cleanField(value: string): string
export function cleanField(value: string | null | undefined): string | null | undefined
export function cleanField(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') return value
  return value.replace(INVISIBLES, '').replace(SPACE_SEPARATORS, ' ').replace(/ {2,}/g, ' ').trim()
}

/** True when the value still holds anything cleanField would remove (invisible characters, odd spaces, repeats, edge spaces). */
export function isDirty(value: string | null | undefined): boolean {
  return typeof value === 'string' && cleanField(value) !== value
}

/** The event columns written through cleanField wherever they are saved. */
export const CLEAN_EVENT_FIELDS = [
  'name', 'public_name', 'public_dates_display', 'public_venue_display', 'event_hashtag', 'registration_url',
  'announcement_cta_label', 'announcement_attribution_line',
] as const

/** Returns a copy of `patch` with every CLEAN_EVENT_FIELDS string cleaned; other keys untouched. */
export function cleanEventPatch<T extends Record<string, unknown>>(patch: T): T {
  const out: Record<string, unknown> = { ...patch }
  for (const k of CLEAN_EVENT_FIELDS) if (typeof out[k] === 'string') out[k] = cleanField(out[k] as string)
  return out as T
}
