// Umbrella/event structural separation (2026-09-11) — a piece of content
// (a messaging doc, a validation rule) is owned by EITHER a real event OR
// an umbrella, never both — see the CHECK constraints in
// supabase/umbrella_events_separation_migration.sql. Every resolver that
// used to take a plain `eventId: string` and assume everything lived in
// `events` now takes one of these instead, so "this id is an umbrella,
// not an event" is a compile-time-checked branch, not a runtime guess.
//
// Trescon-wide layer (2026-10-15) — a third owner, `org`, for content that sits above every umbrella (house rules, the
// Trescon-wide style guide): exactly one of event_id / umbrella_id / org_scope is set on a row. See
// supabase/rules_screen_trescon_layer_migration.sql.
export type ContentOwnerRef =
  | { kind: 'event'; id: string }
  | { kind: 'umbrella'; id: string }
  | { kind: 'org'; id: 'trescon' }

export const ORG_OWNER: ContentOwnerRef = { kind: 'org', id: 'trescon' }

type OwnedRow = { event_id?: string | null; umbrella_id?: string | null; org_scope?: string | null }

/** The owner a stored doc/rule row belongs to. */
export function ownerOfRow(row: OwnedRow): ContentOwnerRef {
  if (row.event_id) return { kind: 'event', id: row.event_id }
  if (row.umbrella_id) return { kind: 'umbrella', id: row.umbrella_id }
  return ORG_OWNER
}

/** The column + value that selects an owner's rows. */
export function ownerColumn(owner: ContentOwnerRef): { column: 'event_id' | 'umbrella_id' | 'org_scope'; value: string } {
  return { column: owner.kind === 'event' ? 'event_id' : owner.kind === 'umbrella' ? 'umbrella_id' : 'org_scope', value: owner.id }
}

/** Insert-shape: exactly one of the three set. */
export function ownerInsertColumns(owner: ContentOwnerRef): { event_id: string | null; umbrella_id: string | null; org_scope: 'trescon' | null } {
  return {
    event_id: owner.kind === 'event' ? owner.id : null,
    umbrella_id: owner.kind === 'umbrella' ? owner.id : null,
    org_scope: owner.kind === 'org' ? 'trescon' : null,
  }
}

/** Audit-table label: 'event:<id>' | 'umbrella:<id>' | 'org:trescon'. */
export function ownerLabel(owner: ContentOwnerRef): string {
  return `${owner.kind}:${owner.id}`
}
