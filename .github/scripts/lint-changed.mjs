#!/usr/bin/env node
/*
  Runs eslint only against .ts/.tsx files changed since a base ref, and
  reports only violations on lines actually added/modified in that diff.

  The repo's unscoped `npm run lint` currently reports thousands of
  pre-existing errors/warnings (confirmed 2026-07-20) — a hard CI gate on
  the whole repo would be permanently red from day one.

  2026-08-16: originally file-scoped, not line-scoped (eslint has no
  first-party "only fail on new lines" mode) — touching one line in an
  otherwise-non-conforming legacy file surfaced that WHOLE file's
  pre-existing errors as a CI failure, even when the actual new code was
  clean. In a codebase with hundreds of files carrying legacy debt, that
  made CI red on nearly every push regardless of the push's own quality —
  exactly the noisy outcome the file's own comment had flagged as a risk
  and named its follow-up for (reviewdog/action-eslint with
  filter_mode=added). Implemented that filtering directly here instead of
  adding a third-party action, to stay consistent with this repo's
  existing hand-rolled-script convention (enrich-commits.js, this file)
  rather than introducing new external CI dependencies for something a
  ~40-line diff-parse can do on its own.

  Approach: `git diff --unified=0` to get the exact added/modified line
  numbers per file (hunk headers only, no context lines — every line
  reported is a real change), eslint's own `--format json` for structured
  per-line results, then intersect the two. Only errors (severity 2) on
  changed lines fail the build, matching plain `eslint <files>`'s default
  exit-code behavior (warnings alone don't fail); everything else —
  errors elsewhere in a touched file, or warnings anywhere — still prints
  for visibility but no longer blocks the push.

  Lives under .github/scripts/ (not /scripts/, which .gitignore reserves
  for local one-off ops tooling) since this script is invoked by CI and
  must be tracked in git.

  Usage (run from the repo root): node .github/scripts/lint-changed.mjs [baseRef]   (baseRef defaults to HEAD~1)
*/
import { execSync } from 'node:child_process'

const base = process.argv[2] || 'HEAD~1'

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
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

// Parses `git diff --unified=0` hunk headers (`@@ -oldStart,oldLines +newStart,newLines @@`)
// into the exact set of added/modified line numbers in the NEW file version.
// unified=0 means no context lines are included, so every '+' line under a
// hunk is a genuine change, not surrounding context.
function changedLinesFor(file) {
  const diff = run(`git diff --unified=0 --diff-filter=ACMR ${base}...HEAD -- ${JSON.stringify(file)}`)
  const lines = new Set()
  for (const line of diff.split('\n')) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!m) continue
    const start = Number(m[1])
    const count = m[2] === undefined ? 1 : Number(m[2])
    for (let i = 0; i < count; i++) lines.add(start + i)
  }
  return lines
}

console.log(`Linting ${files.length} changed file(s) (new/changed lines only):\n  ${files.join('\n  ')}`)

let results
try {
  const json = execSync(`npx eslint --format json ${files.map(f => JSON.stringify(f)).join(' ')}`, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
  results = JSON.parse(json)
} catch (err) {
  // eslint exits non-zero when it finds errors — stdout still has the JSON.
  if (err.stdout) results = JSON.parse(err.stdout)
  else { console.error(err.message); process.exit(1) }
}

let hadBlockingError = false
let printedAny = false

for (const file of results) {
  const rel = file.filePath.replace(process.cwd() + '/', '')
  if (!file.messages.length) continue
  const changed = changedLinesFor(rel)

  const onChangedLines = file.messages.filter(m => changed.has(m.line))
  const elsewhere = file.messages.length - onChangedLines.length

  if (onChangedLines.length === 0) {
    if (elsewhere > 0) console.log(`\n${rel}: ${elsewhere} pre-existing issue(s) on untouched lines — not blocking.`)
    continue
  }

  printedAny = true
  console.log(`\n${rel}`)
  for (const m of onChangedLines) {
    const level = m.severity === 2 ? 'error' : 'warning'
    console.log(`  ${m.line}:${m.column}  ${level}  ${m.message}  ${m.ruleId ?? ''}`)
    if (m.severity === 2) hadBlockingError = true
  }
  if (elsewhere > 0) console.log(`  (+${elsewhere} more pre-existing issue(s) elsewhere in this file — not blocking)`)
}

if (!printedAny) console.log('\nNo lint issues on changed lines.')

process.exit(hadBlockingError ? 1 : 0)
