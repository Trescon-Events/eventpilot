// Umbrella/event structural separation (2026-09-11) — a piece of content
// (a messaging doc, a validation rule) is owned by EITHER a real event OR
// an umbrella, never both — see the CHECK constraints in
// supabase/umbrella_events_separation_migration.sql. Every resolver that
// used to take a plain `eventId: string` and assume everything lived in
// `events` now takes one of these instead, so "this id is an umbrella,
// not an event" is a compile-time-checked branch, not a runtime guess.
export type ContentOwnerRef =
  | { kind: 'event'; id: string }
  | { kind: 'umbrella'; id: string }
