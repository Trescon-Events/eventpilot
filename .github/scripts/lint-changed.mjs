#!/usr/bin/env node
/*
  Runs eslint only against .ts/.tsx files changed since a base ref. The
  repo's unscoped `npm run lint` currently reports thousands of pre-existing
  errors/warnings (confirmed 2026-07-20) — a hard CI gate on the whole repo
  would be permanently red from day one. Diff-scoping is what makes "hard
  CI gate" honest: it fails on genuinely new/touched code, not on legacy
  debt nobody asked this change to fix.

  Deliberately file-scoped, not line-scoped: eslint has no first-party
  "only fail on new lines" mode. This means touching one line in an
  otherwise-non-conforming legacy file surfaces that whole file's errors —
  a real but accepted tradeoff for v1 (see the plan's noted follow-up:
  reviewdog/action-eslint with filter_mode=added, if this proves too noisy
  in practice).

  Lives under .github/scripts/ (not /scripts/, which .gitignore reserves for
  local one-off ops tooling) since this script is invoked by CI and must be
  tracked in git — same convention as enrich-commit.js.

  Usage (run from the repo root): node .github/scripts/lint-changed.mjs [baseRef]   (baseRef defaults to HEAD~1)
*/
import { execSync } from 'node:child_process'

const base = process.argv[2] || 'HEAD~1'

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim()
}

let files
try {
  files = run(`git diff --name-only --diff-filter=ACMR ${base}...HEAD -- '*.ts' '*.tsx'`)
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean)
    .filter(f => !f.startsWith('tools/smartexcel/'))
} catch (err) {
  console.error(`Could not diff against ${base}: ${err.message}`)
  process.exit(1)
}

if (files.length === 0) {
  console.log('No changed .ts/.tsx files.')
  process.exit(0)
}

console.log(`Linting ${files.length} changed file(s):\n  ${files.join('\n  ')}`)
try {
  execSync(`npx eslint ${files.map(f => JSON.stringify(f)).join(' ')}`, { stdio: 'inherit' })
} catch {
  process.exit(1)
}
