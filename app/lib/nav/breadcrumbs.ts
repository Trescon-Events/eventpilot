import { getModuleRegistry, type ModuleDef } from '@/app/lib/registry/modules'

export type Crumb = { label: string; href: string | null }

/*
  Derives a breadcrumb trail purely from the current pathname + the module
  registry (app/lib/registry/modules.tsx) — no page has to register
  anything. Two matching strategies:

  1. Pattern match — for the handful of registry entries whose `href` is a
     function AND whose PATH (not just querystring) varies at runtime, e.g.
     event-scoped tools (Website Builder: /admin/events/:eventId/website).
     These declare `breadcrumbPattern` (a path template) + `breadcrumbParent`
     (their registry-key ancestor, since the pattern's own path can't be
     prefix-matched against anything else).

  2. Prefix match — everything else. Each entry's "base path" is either its
     plain string href, or (for ctx-functions that only vary the
     QUERYSTRING, like /dashboard?id=X) the href evaluated with an empty
     ctx, stripped of its querystring. The registry entry whose base path is
     the longest prefix of the current pathname is the "deepest" match;
     trailing unmatched segments (e.g. `manage`, `settings` under Knowledge
     Base, which have no registry entry of their own) become unlinked,
     title-cased crumbs.

  'admin' is deliberately excluded from ANCESTOR resolution (though not from
  being the deepest match for its own exact page, /admin) — Toolkit, Bespoke
  Tracker, and other tools happen to live under the /admin/* URL prefix for
  historical/access-check reasons, but conceptually are not "inside" the
  Admin Dashboard, and non-admin staff granted just one tool would find
  "Admin Dashboard" in their trail confusing.
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

export function deriveBreadcrumbs(pathname: string): Crumb[] {
  const registry = getModuleRegistry()
  const clean = pathname.replace(/\/+$/, '') || '/'
  const dashboardMod = registry.find(m => m.key === 'dashboard')
  const dashboardLabel = dashboardMod?.label ?? 'Dashboard'

  const crumbs: Crumb[] = []
  const pushDashboardRoot = () => {
    if (clean !== '/dashboard') crumbs.push({ label: dashboardLabel, href: '/dashboard' })
  }

  // 1. Pattern-matched entries (event-scoped tools etc.)
  const patternMatch = registry.find(m => m.breadcrumbPattern && matchesPattern(m.breadcrumbPattern, clean))
  if (patternMatch) {
    pushDashboardRoot()
    const params = patternMatch.breadcrumbPattern ? extractParams(patternMatch.breadcrumbPattern, clean) : {}
    // Walk the FULL breadcrumbParent chain, not just one hop — a
    // sub-console nested under an event-scoped tool (e.g. the Stakeholder
    // Announcement Engine's Admin Console under its own landing page,
    // itself under Toolkit) needs every ancestor, not just the immediate
    // one. Each ancestor's own href may be a ctx function needing the same
    // path params (:eventId etc) captured from the current pathname above.
    const ancestorCrumbs: Crumb[] = []
    let parentKey = patternMatch.breadcrumbParent
    const seen = new Set<string>()
    while (parentKey && !seen.has(parentKey)) {
      seen.add(parentKey)
      const parent = registry.find(m => m.key === parentKey)
      if (!parent) break
      const href = resolveHref(parent, params)
      if (href) ancestorCrumbs.unshift({ label: parent.label, href })
      parentKey = parent.breadcrumbParent
    }
    crumbs.push(...ancestorCrumbs)
    crumbs.push({ label: patternMatch.label, href: null })
    return crumbs
  }

  // 2. Prefix matching
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

  // Walk up one explicit breadcrumbParent hop, or (if none) look for the
  // next-longest prefix candidate that is itself a prefix of the deepest
  // match's own base path (excluding 'admin' from ancestor candidacy).
  if (deepest.mod.breadcrumbParent) {
    const parent = registry.find(m => m.key === deepest.mod.breadcrumbParent)
    if (parent && typeof parent.href === 'string') crumbs.push({ label: parent.label, href: parent.href })
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
    rest.forEach(seg => crumbs.push({ label: titleCase(seg), href: null }))
  }

  return crumbs
}
