#!/usr/bin/env tsx
/*
  CI gate: does every page.tsx under a gated tree (see GATED_ROOTS) have (a)
  a resolving entry in app/lib/registry/modules.tsx, so it gets a real
  breadcrumb, (b) a rendered <PageHeader/>, so it has on-brand
  title/description chrome, and (c) — for pages whose registry entry claims
  a real per-event permission check (the `event_permission` access kind) —
  an actual matching gate call somewhere in the route's own layout.tsx
  ancestor chain, unless explicitly exempted via
  app/lib/registry/nav-exclusions.ts, or grandfathered in
  .github/scripts/nav-branding-baseline.json.

  This is a push/PR-time gate, not a compile-time guarantee — see the plan
  discussion for why page-content composition (unlike GlobalShell's
  layout-level wrapping) can't be enforced structurally in Next's
  file-based routing. A page can still ship without PageHeader/a registry
  entry if someone bypasses CI; this makes non-conformance loud and
  blocking in the normal path, not impossible.

  Check (c) is deliberately narrow, not general static analysis — see
  hasRecognizedGateCall()'s own comment for exactly what it can and can't
  catch. Scoped to `event_permission` entries specifically because
  middleware.ts runs on the Edge runtime with no database access (confirmed
  2026-08-17), so it can structurally never perform a per-event RBAC check
  itself — an event_permission page with no matching gate call anywhere in
  its layout chain is a real, reliable signal of exactly the bug class two
  live incidents this session were both instances of (a page registered as
  gated, but the actual enforcement path had a hole nothing caught
  automatically), not a guess.

  Lives under .github/scripts/ (not /scripts/, which .gitignore reserves
  for local one-off ops tooling) since this script is invoked by CI and
  must be tracked in git — same convention as enrich-commit.js.

  Usage (run from the repo root):
    npm run check:nav                    # CI mode — exits 1 on any new violation
    npx tsx .github/scripts/check-nav-branding.ts --write-baseline # regenerate the frozen baseline (run by hand only)
*/
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getModuleRegistry, type ModuleDef } from '../../app/lib/registry/modules'
import { basePathOf, matchesPattern } from '../../app/lib/nav/breadcrumbs'
import {
  isRegistryExempt,
  isPageHeaderExempt,
  isGateExempt,
} from '../../app/lib/registry/nav-exclusions'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const BASELINE_PATH = join(ROOT, '.github/scripts/nav-branding-baseline.json')

// Narrow on purpose for v1 — the brief's own example scope. Widen by adding
// more roots here once the check has been live a while; each new root needs
// its own baseline regeneration pass (--write-baseline) since it will have
// pre-existing non-conforming pages.
//
// 2026-08-17: added app/dashboard and app/pilots as the nav rebuild's own
// first widening stage (Home and Pilot Projects sidebar sections) — see
// the nav rebuild plan's Stage 8. Remaining candidate roots (messages/
// community/chat/team/my-hr/leaderboard next, parked areas like hr/finance/
// timesheets/data/content last, lowest priority since there's no urgency
// bringing already-parked modules into compliance) are each their own
// future --write-baseline pass, not done in this one.
const GATED_ROOTS = ['app/admin', 'app/dashboard', 'app/pilots']

// gateMissing is optional on read — baselines written before 2026-08-17
// won't have it yet; `?? []` at every read site treats that the same as
// an empty array rather than a crash.
type Baseline = { generatedAt: string; registryMissing: string[]; pageHeaderMissing: string[]; gateMissing?: string[] }

function loadBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  } catch {
    return { generatedAt: '', registryMissing: [], pageHeaderMissing: [], gateMissing: [] }
  }
}

function findPageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      findPageFiles(full, out)
    } else if (entry === 'page.tsx') {
      out.push(full)
    }
  }
  return out
}

// app/admin/events/[id]/plan/page.tsx -> /admin/events/[id]/plan
// Route groups '(group)' are dropped, matching how Next resolves them.
function routeFromFile(absPath: string): string {
  const rel = relative(join(ROOT, 'app'), absPath)
  const segments = rel.split('/').slice(0, -1) // drop 'page.tsx'
  const kept = segments.filter(s => !(s.startsWith('(') && s.endsWith(')')))
  return '/' + kept.join('/')
}

// Returns the matched registry entry (not just whether one exists) — the
// gate-consistency check below needs to read its access.kind.
function findRegistryEntry(route: string, registry: ModuleDef[]): ModuleDef | undefined {
  const patternHit = registry.find(m => m.breadcrumbPattern && matchesPattern(m.breadcrumbPattern, route))
  if (patternHit) return patternHit
  return registry.find(m => {
    const base = basePathOf(m)
    if (!base) return false
    return route === base || route.startsWith(base + '/')
  })
}

function hasPageHeader(absPath: string): boolean {
  return readFileSync(absPath, 'utf8').includes('<PageHeader')
}

// Every layout.tsx from the page's own directory up to (and including)
// app/ itself — Next.js layout nesting means ALL of these actually wrap
// the page, any one of them is a legitimate place for the real gate to live.
function findAncestorLayouts(pageAbsPath: string): string[] {
  const appRoot = join(ROOT, 'app')
  const layouts: string[] = []
  let dir = dirname(pageAbsPath)
  while (dir.startsWith(appRoot)) {
    const candidate = join(dir, 'layout.tsx')
    if (existsSync(candidate)) layouts.push(candidate)
    if (dir === appRoot) break
    dir = dirname(dir)
  }
  return layouts
}

// Deliberately narrow — pattern-matching this codebase's own small, closed
// set of idiomatic gate-call shapes (app/lib/access/event-access.ts's
// exported functions, plus requireModuleAccess), not general static
// analysis of arbitrary boolean logic. Catches "there is NO real gate call
// anywhere in the layout chain" reliably; does NOT verify the call's
// arguments match the registry's declared permissionKey (that would need
// real AST parsing of call-site string literals, not a substring check —
// left as a known limitation, matching this script's existing "not a
// compile-time guarantee" honesty in the header comment above).
const RECOGNIZED_GATE_PATTERNS = [
  'requireModuleAccess', 'hasEventPermission', 'hasAnyEventAccess', 'hasAnyModulePermission', 'hasPlatformPermission',
]

function hasRecognizedGateCall(layoutPaths: string[]): boolean {
  return layoutPaths.some(p => {
    const src = readFileSync(p, 'utf8')
    return RECOGNIZED_GATE_PATTERNS.some(pattern => src.includes(pattern))
  })
}

function main() {
  const writeBaseline = process.argv.includes('--write-baseline')
  const registry = getModuleRegistry()
  const baseline = loadBaseline()

  const registryMissing: string[] = []
  const pageHeaderMissing: string[] = []
  const gateMissing: string[] = []

  for (const root of GATED_ROOTS) {
    const files = findPageFiles(join(ROOT, root))
    for (const file of files) {
      const route = routeFromFile(file)
      const entry = findRegistryEntry(route, registry)
      if (!entry) registryMissing.push(route)
      if (!hasPageHeader(file)) pageHeaderMissing.push(route)
      if (entry?.access.kind === 'event_permission' && !hasRecognizedGateCall(findAncestorLayouts(file))) {
        gateMissing.push(route)
      }
    }
  }

  if (writeBaseline) {
    const next: Baseline = {
      generatedAt: new Date().toISOString().slice(0, 10),
      registryMissing: registryMissing.sort(),
      pageHeaderMissing: pageHeaderMissing.sort(),
      gateMissing: gateMissing.sort(),
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
    console.log(`Wrote baseline: ${next.registryMissing.length} registry gaps, ${next.pageHeaderMissing.length} PageHeader gaps, ${next.gateMissing.length} gate gaps.`)
    return
  }

  const newRegistryViolations = registryMissing.filter(r => !isRegistryExempt(r) && !baseline.registryMissing.includes(r))
  const newPageHeaderViolations = pageHeaderMissing.filter(r => !isPageHeaderExempt(r) && !baseline.pageHeaderMissing.includes(r))
  const newGateViolations = gateMissing.filter(r => !isGateExempt(r) && !(baseline.gateMissing ?? []).includes(r))

  if (newRegistryViolations.length === 0 && newPageHeaderViolations.length === 0 && newGateViolations.length === 0) {
    console.log('Nav/branding check passed — no new violations.')
    return
  }

  if (newRegistryViolations.length > 0) {
    console.error('\nNew pages missing a resolving app/lib/registry/modules.tsx entry (no breadcrumb):')
    newRegistryViolations.forEach(r => console.error(`  ${r}`))
    console.error('  Fix: add a ModuleDef entry in app/lib/registry/modules.tsx, or if this page')
    console.error('  is deliberately unregistered, add it to REGISTRY_EXEMPT(_PREFIXES) in')
    console.error('  app/lib/registry/nav-exclusions.ts with a reason.')
  }
  if (newPageHeaderViolations.length > 0) {
    console.error('\nNew pages not rendering <PageHeader/>:')
    newPageHeaderViolations.forEach(r => console.error(`  ${r}`))
    console.error('  Fix: import PageHeader from app/components/PageHeader and render it, or if')
    console.error('  this page deliberately has its own hero/chrome, add it to')
    console.error('  PAGEHEADER_EXEMPT(_PREFIXES) in app/lib/registry/nav-exclusions.ts with a reason.')
  }
  if (newGateViolations.length > 0) {
    console.error('\nNew pages whose registry entry claims a real per-event permission (event_permission)')
    console.error('but have no matching gate call anywhere in their layout.tsx ancestor chain:')
    newGateViolations.forEach(r => console.error(`  ${r}`))
    console.error('  Fix: add the real check (hasEventPermission/hasAnyEventAccess/hasAnyModulePermission)')
    console.error('  to a layout.tsx above this page, or if this route is intentionally gated another way')
    console.error('  (e.g. a signed-token external flow), add it to GATE_EXEMPT(_PREFIXES) in')
    console.error('  app/lib/registry/nav-exclusions.ts with a reason.')
  }
  console.error('')
  process.exit(1)
}

main()
