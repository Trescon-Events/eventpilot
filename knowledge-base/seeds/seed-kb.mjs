/**
 * Seeds the existing knowledge-base/ .md files into Supabase `documents`.
 * Walks bd/proposals, bd/_reference, events/managed, events/signature (skips
 * seeds/, _inbox/, _template/, _templates/), classifies each file per
 * knowledge-engine/classifiers/document-classifier.md, and inserts a row.
 *
 * Proposal files already carry full YAML front matter (layer, department,
 * min_level, pilot_use, source_url) — that's used verbatim when present.
 * Files with no front matter (event master files, BD reference docs) fall
 * back to directory-based classification.
 *
 * Idempotent: skips any title that already exists in `documents`.
 *
 * Run: node knowledge-base/seeds/seed-kb.mjs
 */

import { readFileSync, readdirSync } from 'fs'
import { join, relative, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const KB_ROOT = join(REPO_ROOT, 'knowledge-base')

config({ path: join(REPO_ROOT, '.env.local') })

const EXCLUDE_DIRS = new Set(['seeds', '_inbox', '_template', '_templates'])

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function walk(dir) {
  let results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue
      results = results.concat(walk(join(dir, entry.name)))
    } else if (entry.name.endsWith('.md')) {
      results.push(join(dir, entry.name))
    }
  }
  return results
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { meta: {}, body: content }
  const end = content.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: content }
  const fmBlock = content.slice(3, end).trim()
  const body = content.slice(end + 4).replace(/^\n/, '')
  let meta = {}
  try { meta = parseYaml(fmBlock) || {} } catch { meta = {} }
  return { meta, body }
}

// Directory-based classification — used when a file has no (or incomplete) front matter.
// Mirrors knowledge-engine/classifiers/document-classifier.md's metadata tagging rules.
function classify(filePath) {
  const rel = relative(KB_ROOT, filePath).split('\\').join('/')

  if (rel.startsWith('bd/proposals/')) {
    return { type: 'proposal', layer: 'specific', department: 'events', min_level: 'team_lead', pilot_use: false }
  }
  if (rel.startsWith('events/')) {
    return { type: 'event_report', layer: 'knowledge_base', department: 'all', min_level: 'all', pilot_use: true }
  }
  if (rel.startsWith('bd/_reference/credential-blocks/')) {
    return { type: 'corporate_profile', layer: 'knowledge_base', department: 'all', min_level: 'all', pilot_use: true }
  }
  if (rel.startsWith('bd/_reference/')) {
    return { type: 'other', layer: 'specific', department: 'events', min_level: 'team_lead', pilot_use: false }
  }
  if (rel.startsWith('corporate/')) {
    return { type: 'corporate_profile', layer: 'knowledge_base', department: 'all', min_level: 'all', pilot_use: true }
  }
  if (rel.startsWith('external/')) {
    return { type: 'external_intel', layer: 'knowledge_base', department: 'all', min_level: 'all', pilot_use: true }
  }
  return { type: 'other', layer: 'general', department: 'all', min_level: 'all', pilot_use: false }
}

function titleFor(meta, body, filePath) {
  if (typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim()
  const h1 = body.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].trim()
  return basename(filePath, '.md')
}

function resolveSourceUrl(meta) {
  if (typeof meta.source_url === 'string' && meta.source_url.trim() && !meta.source_url.includes('[S3')) {
    return meta.source_url.trim()
  }
  return null
}

async function main() {
  const files = walk(KB_ROOT)
  console.log(`Found ${files.length} knowledge-base file(s) to seed\n`)

  const { data: existing, error: fetchErr } = await sb.from('documents').select('title')
  if (fetchErr) { console.error('Could not read existing documents:', fetchErr.message); process.exit(1) }
  const existingTitles = new Set((existing ?? []).map(d => d.title))

  let inserted = 0
  let skipped = 0
  let failed = 0

  for (const filePath of files) {
    const raw = readFileSync(filePath, 'utf-8')
    const { meta, body } = parseFrontmatter(raw)
    const cls = classify(filePath)
    const title = titleFor(meta, body, filePath)
    const rel = relative(REPO_ROOT, filePath)

    if (existingTitles.has(title)) {
      console.log(`Skip (already exists): ${title}`)
      skipped++
      continue
    }

    const id = randomUUID()
    const wordCount = raw.split(/\s+/).filter(Boolean).length

    const row = {
      id,
      document_group_id: id,
      version: 1,
      title,
      type: cls.type,
      extracted_text: raw,
      word_count: wordCount,
      visibility: 'all',
      layer: typeof meta.layer === 'string' ? meta.layer : cls.layer,
      department: typeof meta.department === 'string' ? meta.department : cls.department,
      min_level: typeof meta.min_level === 'string' ? meta.min_level : cls.min_level,
      pilot_use: typeof meta.pilot_use === 'boolean' ? meta.pilot_use : cls.pilot_use,
      status: 'live',
      is_active: true,
      source_url: resolveSourceUrl(meta),
      ai_reasoning: `Seeded directly from ${rel} at KB launch — not AI-classified.`,
      confidence: 100,
      flagged: false,
    }

    const { error } = await sb.from('documents').insert(row)
    if (error) {
      console.error(`FAILED: ${title} — ${error.message}`)
      failed++
      continue
    }
    console.log(`Inserted: ${title}  [${row.type} / ${row.layer}${row.layer === 'specific' ? ` / ${row.department} / ${row.min_level}` : ''}]`)
    inserted++
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already existed), failed ${failed}.`)
}

main().catch(e => { console.error('Seed failed:', e); process.exit(1) })
