// Wildcard-aware permission key matching (2026-08-16, Event Workspace
// Access Roles foundation redesign) — shared between server-side checks
// (app/lib/access/event-access.ts) and client-side `can()` gates, so both
// sides agree on what "a role holds sae.*" means. Deliberately has no
// server-only imports (no supabaseAdmin etc.) so it's safe to import from
// 'use client' components directly.
//
// Convention: a held permission_key is either an exact leaf key
// ('sae.announcements.publish') or a wildcard ending in '.*' at any depth
// ('sae.*' = everything in that module; a future 'sae.email_templates.*'
// would mean everything in that sub-area once a module grows that deep).

export function matchesPermission(held: string, requested: string): boolean {
  if (held === requested) return true
  if (held.endsWith('.*')) return requested.startsWith(held.slice(0, -1))
  return false
}

// held may contain the platform-admin sentinel '*' (see
// getEventPermissions' admin branch) — treated as "every permission."
export function permissionSetSatisfies(held: Set<string> | string[], requested: string): boolean {
  const heldArr = Array.isArray(held) ? held : Array.from(held)
  if (heldArr.includes('*')) return true
  return heldArr.some(h => matchesPermission(h, requested))
}
