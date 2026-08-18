/*
  Central, visible opt-out list for the nav/branding CI gate
  (scripts/check-nav-branding.ts). Mirrors AuthedShellGate.tsx's
  EXACT_NO_SHELL/PREFIX_NO_SHELL pattern (a page's path decides whether it's
  exempt), with one deliberate addition: every entry carries a `reason`.
  AuthedShellGate gets away with a bare Set because one file-level comment
  covers its handful of pre-auth pages; this list will be extended by many
  different people for many different reasons over time, so each opt-out
  needs to justify itself inline rather than relying on institutional memory.

  Three independent checks, three independent exemption lists — a page can
  be legitimately exempt from one and not the others:
  - REGISTRY_EXEMPT(_PREFIXES): page has no app/lib/registry/modules.tsx
    entry that resolves to it (no breadcrumb / no nav representation).
  - PAGEHEADER_EXEMPT(_PREFIXES): page doesn't render <PageHeader/> (e.g. a
    full-bleed builder canvas or a hub page with its own custom hero).
  - GATE_EXEMPT(_PREFIXES): page resolves to an event_permission registry
    entry but is intentionally gated outside this codebase's usual
    hasEventPermission/hasAnyEventAccess/hasAnyModulePermission/
    requireModuleAccess call pattern (2026-08-17) — e.g. a signed-token
    external-approver flow with no EventPilot session to check permissions
    against in the first place.

  Start empty. Do NOT pre-populate with today's non-conforming pages — those
  are tracked separately in scripts/nav-branding-baseline.json as a frozen,
  shrink-only "not yet migrated" snapshot. This list is only for pages that
  are exempt BY DESIGN, going forward.
*/

export type NavExclusion = { path: string; reason: string }
export type NavExclusionPrefix = { prefix: string; reason: string }

export const REGISTRY_EXEMPT: NavExclusion[] = []
export const REGISTRY_EXEMPT_PREFIXES: NavExclusionPrefix[] = []

export const PAGEHEADER_EXEMPT: NavExclusion[] = [
  {
    path: '/admin/events/[id]/announcements/[announcementId]/review',
    reason: 'Stakeholder Announcement Engine approval review page — a standalone layout reachable by external approvers with no EventPilot session via a signed token (see middleware.ts + AuthedShellGate.tsx), same treatment as the public onboarding forms under app/public/*. Lives under app/admin/** only because the PRD placed it there; it never renders the internal admin chrome.',
  },
]
export const PAGEHEADER_EXEMPT_PREFIXES: NavExclusionPrefix[] = []

export const GATE_EXEMPT: NavExclusion[] = []
export const GATE_EXEMPT_PREFIXES: NavExclusionPrefix[] = []

function matches(pathname: string, exact: NavExclusion[], prefixes: NavExclusionPrefix[]): boolean {
  if (exact.some(e => e.path === pathname)) return true
  return prefixes.some(p => pathname === p.prefix || pathname.startsWith(p.prefix + '/'))
}

export function isRegistryExempt(pathname: string): boolean {
  return matches(pathname, REGISTRY_EXEMPT, REGISTRY_EXEMPT_PREFIXES)
}

export function isPageHeaderExempt(pathname: string): boolean {
  return matches(pathname, PAGEHEADER_EXEMPT, PAGEHEADER_EXEMPT_PREFIXES)
}

export function isGateExempt(pathname: string): boolean {
  return matches(pathname, GATE_EXEMPT, GATE_EXEMPT_PREFIXES)
}
