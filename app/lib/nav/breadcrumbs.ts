import { getModuleRegistry, type ModuleDef } from '@/app/lib/registry/modules'

export type Crumb = { label: string; href: string | null }

/*
  Derives a breadcrumb trail purely from the current pathname + the module
  registry (app/lib/registry/modules.tsx) — no page has to register a
  route. Three matching strategies, in order:

  1. Exact pattern match — the current page IS a registered
     `breadcrumbPattern` route itself (e.g. the Website Builder:
     /admin/events/:eventId/website).

  2. Pattern PREFIX match (2026-08-14, per Madhu) — the current page is
     NESTED one or more segments deeper than any registered pattern route,
     with no pattern of its own (e.g. the stakeholder detail page,
     /admin/events/:eventId/stakeholders/:stakeholderId, one segment past
     admin-event-stakeholders' own /admin/events/:eventId/stakeholders
     pattern). Before this existed, a deeper page like this fell straight
     through to plain prefix matching (step 3), which only understands
     plain-string hrefs — every pattern-based ancestor (Event Workspace,
     Stakeholder Hub, ...) was invisible to it, so the ENTIRE tail of the
     path (event ID, "stakeholders", stakeholder ID) rendered as raw,
     unlinked, title-cased segments. This picks the pattern whose template
     is the longest strict-prefix ancestor of the current path, walks its
     breadcrumbParent chain exactly like an exact match does, then hands
     whatever's left after that to the same trailing-segment handling
     step 3 already had.

  3. Plain prefix match — everything else (plain-string-href entries only).
     The registry entry whose base path is the longest prefix of the
     current pathname is the "deepest" match; trailing unmatched segments
     become unlinked crumbs (label-overridden per `labels`, else
     title-cased).

  Dynamic-segment labels (2026-08-14, per Madhu — raw UUIDs in the trail
  "doesn't look like a standard way of showing navigation"): any crumb
  ultimately tied to a single dynamic `:param` value (a pattern-based
  module with exactly one dynamic segment, or a bare trailing segment) can
  be overridden with a human-readable label via the `labels` map — see
  app/lib/nav/breadcrumb-labels.tsx, which pages call into once they know
  e.g. an event's name or a stakeholder's name. Keyed by the raw path
  value itself (not position), so any page that's ever resolved that exact
  ID benefits, for the rest of the session, regardless of which page
  registers it first.

  'admin' is deliberately excluded from ANCESTOR resolution in step 3's own
  heuristic (though not from being the deepest match for its own exact
  page, /admin) — Toolkit, Bespoke Tracker, and other tools happen to live
  under the /admin/* URL prefix for historical/access-check reasons, but
  conceptually are not "inside" the Admin Dashboard, and non-admin staff
  granted just one tool would find "Admin Dashboard" in their trail
  confusing. Event-scoped admin-only tools (Stakeholder Hub etc.) aren't
  subject to that same confusion — they're truly nested under Admin
  Dashboard for every user who can reach them at all — so those chain
  through 'admin' explicitly via breadcrumbParent instead.
*/

const CHAIN_EXCLUDE = new Set(['admin'])

function titleCase(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function basePathOf(mod: ModuleDef): string | null {
  if (mod.breadcrumbPattern) return null // handled by pattern matching instead
  if (typeof mod.href === 'string') return mod.href
  try {
    return mod.href({}).split('?')[0]
  } catch {
    return null
  }
}

export function matchesPattern(pattern: string, pathname: string): boolean {
  const patternSegs = pattern.split('/').filter(Boolean)
  const pathSegs = pathname.split('/').filter(Boolean)
  if (patternSegs.length !== pathSegs.length) return false
  return patternSegs.every((seg, i) => seg.startsWith(':') || seg === pathSegs[i])
}

/** Strict-prefix version of matchesPattern — pattern must be SHORTER than the path and match every segment it has. Returns the pattern's segment count (its "depth") on match, else null. Used to find the deepest pattern-based ANCESTOR of a page one or more segments past any registered pattern. */
function patternPrefixDepth(pattern: string, pathname: string): number | null {
  const patternSegs = pattern.split('/').filter(Boolean)
  const pathSegs = pathname.split('/').filter(Boolean)
  if (patternSegs.length >= pathSegs.length) return null
  const ok = patternSegs.every((seg, i) => seg.startsWith(':') || seg === pathSegs[i])
  return ok ? patternSegs.length : null
}

/** Pulls named `:param` values (e.g. `:eventId`) out of pathname per pattern — used to resolve a breadcrumbParent whose own href is a ctx function, not a plain string. */
function extractParams(pattern: string, pathname: string): Record<string, string> {
  const patternSegs = pattern.split('/').filter(Boolean)
  const pathSegs = pathname.split('/').filter(Boolean)
  const params: Record<string, string> = {}
  patternSegs.forEach((seg, i) => { if (seg.startsWith(':')) params[seg.slice(1)] = pathSegs[i] })
  return params
}

/** Resolves a module's href to a plain path for breadcrumb linking — same ctx-function-with-empty-object fallback as basePathOf, but callers needing a real param (event-scoped chains) pass it in. */
function resolveHref(mod: ModuleDef, params: Record<string, string>): string | null {
  if (typeof mod.href === 'string') return mod.href
  try {
    return mod.href(params).split('?')[0]
  } catch {
    return null
  }
}

/** A module whose pattern ENDS in a dynamic segment (and has only that one
    dynamic segment) IS, unambiguously, "the page for that one entity" —
    e.g. /admin/events/:eventId IS the page for that specific event, so its
    generic static label ("Event Workspace") can be swapped for the real
    event name once known. A pattern like
    /admin/events/:eventId/stakeholders also has exactly one dynamic
    segment, but it's a fixed NAMED sub-resource of that event ("the
    Stakeholder Hub"), not the event itself — ending in a static segment is
    exactly the signal that distinguishes the two, so those are left alone. */
function moduleLabel(mod: ModuleDef, params: Record<string, string>, labels: Record<string, string>): string {
  if (!mod.breadcrumbPattern) return mod.label
  const segs = mod.breadcrumbPattern.split('/').filter(Boolean)
  const last = segs[segs.length - 1]
  if (!last?.startsWith(':')) return mod.label
  if (segs.filter(s => s.startsWith(':')).length !== 1) return mod.label
  const value = params[last.slice(1)]
  return (value && labels[value]) || mod.label
}

/** Walks a module's full breadcrumbParent chain (oldest ancestor first), resolving each parent's href + label-override. Shared by the exact-match and pattern-prefix-match branches below — same chain-walking logic either way. */
function walkParentChain(startKey: string | undefined, registry: ModuleDef[], params: Record<string, string>, labels: Record<string, string>): Crumb[] {
  const ancestorCrumbs: Crumb[] = []
  let parentKey = startKey
  const seen = new Set<string>()
  while (parentKey && !seen.has(parentKey)) {
    seen.add(parentKey)
    const parent = registry.find(m => m.key === parentKey)
    if (!parent) break
    const href = resolveHref(parent, params)
    if (href) ancestorCrumbs.unshift({ label: moduleLabel(parent, params, labels), href })
    parentKey = parent.breadcrumbParent
  }
  return ancestorCrumbs
}

export function deriveBreadcrumbs(pathname: string, labels: Record<string, string> = {}): Crumb[] {
  const registry = getModuleRegistry()
  const clean = pathname.replace(/\/+$/, '') || '/'
  const dashboardMod = registry.find(m => m.key === 'dashboard')
  const dashboardLabel = dashboardMod?.label ?? 'Dashboard'

  const crumbs: Crumb[] = []
  const pushDashboardRoot = () => {
    if (clean !== '/dashboard') crumbs.push({ label: dashboardLabel, href: '/dashboard' })
  }
  const labelFor = (seg: string) => labels[seg] ?? titleCase(seg)

  // 1. Exact pattern match — current page IS a registered pattern route.
  const patternMatch = registry.find(m => m.breadcrumbPattern && matchesPattern(m.breadcrumbPattern, clean))
  if (patternMatch) {
    pushDashboardRoot()
    const params = patternMatch.breadcrumbPattern ? extractParams(patternMatch.breadcrumbPattern, clean) : {}
    crumbs.push(...walkParentChain(patternMatch.breadcrumbParent, registry, params, labels))
    crumbs.push({ label: moduleLabel(patternMatch, params, labels), href: null })
    return crumbs
  }

  // 2. Pattern PREFIX match — deeper page nested past a pattern route with no pattern of its own.
  const patternAncestors = registry
    .map(m => ({ mod: m, depth: m.breadcrumbPattern ? patternPrefixDepth(m.breadcrumbPattern, clean) : null }))
    .filter((c): c is { mod: ModuleDef; depth: number } => c.depth !== null)
    .sort((a, b) => b.depth - a.depth)
  const patternAncestor = patternAncestors[0]

  if (patternAncestor) {
    pushDashboardRoot()
    const params = extractParams(patternAncestor.mod.breadcrumbPattern!, clean)
    crumbs.push(...walkParentChain(patternAncestor.mod.breadcrumbParent, registry, params, labels))
    const ownHref = resolveHref(patternAncestor.mod, params)
    crumbs.push({ label: moduleLabel(patternAncestor.mod, params, labels), href: ownHref })

    const pathSegs = clean.split('/').filter(Boolean)
    const rest = pathSegs.slice(patternAncestor.depth)
    rest.forEach(seg => crumbs.push({ label: labelFor(seg), href: null }))
    return crumbs
  }

  // 3. Plain prefix matching (plain-string hrefs only).
  const candidates = registry
    .map(m => ({ mod: m, base: basePathOf(m) }))
    .filter((c): c is { mod: ModuleDef; base: string } => !!c.base)
    .filter(c => clean === c.base || clean.startsWith(c.base + '/'))

  if (candidates.length === 0) {
    if (clean === '/dashboard') return [{ label: dashboardLabel, href: null }]
    pushDashboardRoot()
    return crumbs
  }

  candidates.sort((a, b) => b.base.length - a.base.length)
  const deepest = candidates[0]

  pushDashboardRoot()

  // Walk the FULL explicit breadcrumbParent chain (2026-08-16 fix — this
  // used to stop after one hop, so a 2+-level chain silently dropped
  // everything past the immediate parent; e.g. Access & Permissions'
  // People -> Admin Dashboard chain lost "Admin Dashboard" entirely.
  // Reuses walkParentChain, same as the pattern-match branches above —
  // params is always {} here since plain-string hrefs have no dynamic
  // segments to resolve), or (if no explicit parent) look for the
  // next-longest prefix candidate that is itself a prefix of the deepest
  // match's own base path (excluding 'admin' from ancestor candidacy).
  if (deepest.mod.breadcrumbParent) {
    crumbs.push(...walkParentChain(deepest.mod.breadcrumbParent, registry, {}, labels))
  } else {
    const ancestor = candidates
      .slice(1)
      .filter(c => !CHAIN_EXCLUDE.has(c.mod.key))
      .filter(c => deepest.base !== c.base && deepest.base.startsWith(c.base + '/'))
      .sort((a, b) => b.base.length - a.base.length)[0]
    if (ancestor) crumbs.push({ label: ancestor.mod.label, href: ancestor.base })
  }

  crumbs.push({ label: deepest.mod.label, href: deepest.base === clean ? null : deepest.base })

  // Trailing unmatched segments (e.g. "manage", "settings") become unlinked crumbs.
  if (clean !== deepest.base) {
    const rest = clean.slice(deepest.base.length).split('/').filter(Boolean)
    rest.forEach(seg => crumbs.push({ label: labelFor(seg), href: null }))
  }

  return crumbs
}
