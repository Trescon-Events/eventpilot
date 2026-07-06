/**
 * Seeds the default Press Intelligence sources into Supabase `kb_intel_sources`.
 * Run once after applying supabase/kb_intel_migration.sql.
 *
 * Idempotent: skips any source whose `name` already exists.
 *
 * Run: node knowledge-base/seeds/seed-intel-sources.mjs
 */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

config({ path: join(REPO_ROOT, '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const SOURCES = [
  // ── Event Registry (special — run weekly) ──
  { name: 'tresconglobal.com Events Page', source_type: 'event_registry', category: 'event_registry',
    config: { url: 'https://tresconglobal.com/events' }, crawl_frequency: 'weekly', crawl_behaviour: 'event_extraction' },

  // ── Owned Properties (monthly) ──
  { name: 'Trescon News Page', source_type: 'direct_url', category: 'owned_property',
    config: { url: 'https://tresconglobal.com/news' }, crawl_frequency: 'monthly', crawl_behaviour: 'article_discovery' },
  { name: 'Trescon About Page', source_type: 'direct_url', category: 'owned_property',
    config: { url: 'https://tresconglobal.com/about' }, crawl_frequency: 'monthly', crawl_behaviour: 'fact_extraction' },
  { name: 'Trescon Managed Events', source_type: 'direct_url', category: 'owned_property',
    config: { url: 'https://tresconglobal.com/managed-events' }, crawl_frequency: 'monthly', crawl_behaviour: 'fact_extraction' },
  { name: 'Trescon Signature Events', source_type: 'direct_url', category: 'owned_property',
    config: { url: 'https://tresconglobal.com/signature-events' }, crawl_frequency: 'monthly', crawl_behaviour: 'fact_extraction' },

  // ── Partner & Government (weekly) ──
  { name: 'DIFC Newsroom', source_type: 'direct_url', category: 'partner_govt',
    config: { url: 'https://difc.ae/newsroom' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
  { name: 'Dubai AI Campus News', source_type: 'direct_url', category: 'partner_govt',
    config: { url: 'https://www.dubaiai.ae/news' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
  { name: 'SPARK Media Centre', source_type: 'direct_url', category: 'partner_govt',
    config: { url: 'https://www.spark.ae/media-centre' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },

  // ── Press & Media — Search Queries (weekly) ──
  { name: 'Arabian Business — Trescon', source_type: 'search_query', category: 'press_media',
    config: { query: 'Trescon site:arabianbusiness.com' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
  { name: 'Khaleej Times — Trescon', source_type: 'search_query', category: 'press_media',
    config: { query: 'Trescon site:khaleejtimes.com' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
  { name: 'Gulf News — Trescon', source_type: 'search_query', category: 'press_media',
    config: { query: 'Trescon site:gulfnews.com' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
  { name: 'Dubai FinTech Summit Coverage', source_type: 'search_query', category: 'press_media',
    config: { query: '"Dubai FinTech Summit" press release OR coverage' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
  { name: 'Dubai AI Festival Coverage', source_type: 'search_query', category: 'press_media',
    config: { query: '"Dubai AI Festival" coverage' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
  { name: 'World AI Show Coverage', source_type: 'search_query', category: 'press_media',
    config: { query: '"World AI Show" Trescon' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
  { name: 'Trescon Leadership Mentions', source_type: 'search_query', category: 'press_media',
    config: { query: 'Trescon "Mohammed Saleem" OR "Naveen Bharadwaj"' }, crawl_frequency: 'weekly', crawl_behaviour: 'article_discovery' },
]

async function main() {
  console.log(`Seeding ${SOURCES.length} intel source(s)\n`)

  const { data: existing, error: fetchErr } = await sb.from('kb_intel_sources').select('name')
  if (fetchErr) { console.error('Could not read existing kb_intel_sources:', fetchErr.message); process.exit(1) }
  const existingNames = new Set((existing ?? []).map(s => s.name))

  let inserted = 0
  let skipped = 0
  let failed = 0

  for (const source of SOURCES) {
    if (existingNames.has(source.name)) {
      console.log(`Skip (already exists): ${source.name}`)
      skipped++
      continue
    }

    const { error } = await sb.from('kb_intel_sources').insert(source)
    if (error) {
      console.error(`FAILED: ${source.name} — ${error.message}`)
      failed++
      continue
    }
    console.log(`Inserted: ${source.name}  [${source.source_type} / ${source.category}]`)
    inserted++
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already existed), failed ${failed}.`)
}

main().catch(e => { console.error('Seed failed:', e); process.exit(1) })
