#!/usr/bin/env tsx
/*
  CI gate: does every page.tsx under a gated tree (see GATED_ROOTS) have (a)
  a resolving entry in app/lib/registry/modules.tsx, so it gets a real
  breadcrumb, and (b) a rendered <PageHeader/>, so it has on-brand
  title/description chrome — unless explicitly exempted via
  app/lib/registry/nav-exclusions.ts, or grandfathered in
  .github/scripts/nav-branding-baseline.json.

  This is a push/PR-time gate, not a compile-time guarantee — see the plan
  discussion for why page-content composition (unlike GlobalShell's
  layout-level wrapping) can't be enforced structurally in Next's
  file-based routing. A page can still ship without PageHeader/a registry
  entry if someone bypasses CI; this makes non-conformance loud and
  blocking in the normal path, not impossible.

  Lives under .github/scripts/ (not /scripts/, which .gitignore reserves
  for local one-off ops tooling) since this script is invoked by CI and
  must be tracked in git — same convention as enrich-commit.js.

  Usage (run from the repo root):
    npm run check:nav                    # CI mode — exits 1 on any new violation
    npx tsx .github/scripts/check-nav-branding.ts --write-baseline # regenerate the frozen baseline (run by hand only)
*/
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getModuleRegistry, type ModuleDef } from '../../app/lib/registry/modules'
import { basePathOf, matchesPattern } from '../../app/lib/nav/breadcrumbs'
import {
  isRegistryExempt,
  isPageHeaderExempt,
} from '../../app/lib/registry/nav-exclusions'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const BASELINE_PATH = join(ROOT, '.github/scripts/nav-branding-baseline.json')

// Narrow on purpose for v1 — the brief's own example scope. Widen by adding
// more roots here once the check has been live a while; each new root needs
// its own baseline regeneration pass (--write-baseline) since it will have
// pre-existing non-conforming pages.
const GATED_ROOTS = ['app/admin']

type Baseline = { generatedAt: string; registryMissing: string[]; pageHeaderMissing: string[] }

function loadBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  } catch {
    return { generatedAt: '', registryMissing: [], pageHeaderMissing: [] }
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

function resolvesInRegistry(route: string, registry: ModuleDef[]): boolean {
  const patternHit = registry.some(m => m.breadcrumbPattern && matchesPattern(m.breadcrumbPattern, route))
  if (patternHit) return true
  return registry.some(m => {
    const base = basePathOf(m)
    if (!base) return false
    return route === base || route.startsWith(base + '/')
  })
}

function hasPageHeader(absPath: string): boolean {
  return readFileSync(absPath, 'utf8').includes('<PageHeader')
}

function main() {
  const writeBaseline = process.argv.includes('--write-baseline')
  const registry = getModuleRegistry()
  const baseline = loadBaseline()

  const registryMissing: string[] = []
  const pageHeaderMissing: string[] = []

  for (const root of GATED_ROOTS) {
    const files = findPageFiles(join(ROOT, root))
    for (const file of files) {
      const route = routeFromFile(file)
      if (!resolvesInRegistry(route, registry)) registryMissing.push(route)
      if (!hasPageHeader(file)) pageHeaderMissing.push(route)
    }
  }

  if (writeBaseline) {
    const next: Baseline = {
      generatedAt: new Date().toISOString().slice(0, 10),
      registryMissing: registryMissing.sort(),
      pageHeaderMissing: pageHeaderMissing.sort(),
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
    console.log(`Wrote baseline: ${next.registryMissing.length} registry gaps, ${next.pageHeaderMissing.length} PageHeader gaps.`)
    return
  }

  const newRegistryViolations = registryMissing.filter(r => !isRegistryExempt(r) && !baseline.registryMissing.includes(r))
  const newPageHeaderViolations = pageHeaderMissing.filter(r => !isPageHeaderExempt(r) && !baseline.pageHeaderMissing.includes(r))

  if (newRegistryViolations.length === 0 && newPageHeaderViolations.length === 0) {
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
  console.error('')
  process.exit(1)
}

main()
