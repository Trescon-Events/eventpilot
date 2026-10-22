/*
  CI gate (npm run check:keys): keeps app/lib/registry/credentials.ts — the
  list behind Admin → Settings → Keys & Credentials — from going stale.

  Fails when:
   1. app/ or middleware.ts reads a secret-looking env var
      (…KEY / …SECRET / …TOKEN / …PASSWORD / …WEBHOOK…) that is not listed in
      CREDENTIALS[].vars or NOT_SECRET_VARS;
   2. code reads a var that RETIRED_VARS says was removed;
   3. the registry file itself contains something shaped like a real secret;
   4. a credential entry is missing its console URL, login or rotation steps.

  Why: on 2026-10-22 a Railway incident forced a rotation of every key and we
  lost hours finding which login owned what (and missed Azure and several
  Railway-only vars). The fix is a list that cannot be forgotten: add the
  platform here in the same change that introduces the key.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CREDENTIALS, NOT_SECRET_VARS, RETIRED_VARS } from '../../app/lib/registry/credentials'

const ROOT = process.cwd()
const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD|WEBHOOK)/
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.scratch'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const registered = new Set<string>()
for (const c of CREDENTIALS) for (const v of c.vars) registered.add(v)

const problems: string[] = []

// 1 + 2: env vars read by the code
const files = [...walk(join(ROOT, 'app')), join(ROOT, 'middleware.ts')]
const seen = new Map<string, string>() // var -> first file
for (const f of files) {
  const src = readFileSync(f, 'utf-8')
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
    if (!seen.has(m[1])) seen.set(m[1], relative(ROOT, f))
  }
}
for (const [name, file] of seen) {
  if (name.startsWith('NEXT_PUBLIC_')) continue
  if (name in RETIRED_VARS) {
    problems.push(`${name} (read in ${file}) is listed in RETIRED_VARS: ${RETIRED_VARS[name]}`)
    continue
  }
  if (!SECRET_NAME.test(name)) continue
  if (registered.has(name) || name in NOT_SECRET_VARS) continue
  problems.push(`${name} (read in ${file}) is not in app/lib/registry/credentials.ts — add the platform, console URL and owning login.`)
}

// 3: the registry must never contain a real secret value
const registrySrc = readFileSync(join(ROOT, 'app/lib/registry/credentials.ts'), 'utf-8')
const SECRET_SHAPES: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'OpenAI-style key'],
  [/\bpat-[a-z0-9]+-[0-9a-f-]{20,}/, 'HubSpot token'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/\bkhc_[A-Za-z0-9]{10,}/, 'KonfHub credential'],
  [/\b[0-9a-f]{64}\b/, '64-char hex secret'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
]
for (const [re, label] of SECRET_SHAPES) {
  if (re.test(registrySrc)) problems.push(`credentials.ts contains something shaped like a ${label}. Names and URLs only — never values.`)
}

// 4: completeness + duplicates
const ids = new Set<string>()
for (const c of CREDENTIALS) {
  if (ids.has(c.id)) problems.push(`Duplicate credential id "${c.id}".`)
  ids.add(c.id)
  if (!c.consoleUrl?.startsWith('http')) problems.push(`${c.id}: consoleUrl must be a direct https URL.`)
  if (!c.login?.trim()) problems.push(`${c.id}: login is empty (write 'confirm' if unknown).`)
  if (!c.rotate?.trim()) problems.push(`${c.id}: rotate steps are empty.`)
}

if (problems.length) {
  console.error('\nCredentials registry check FAILED:\n')
  for (const p of problems) console.error(' - ' + p)
  console.error('\nFix: update app/lib/registry/credentials.ts (see its header comment).\n')
  process.exit(1)
}
console.log(`Credentials registry check passed — ${CREDENTIALS.length} credentials, ${seen.size} env vars scanned.`)
