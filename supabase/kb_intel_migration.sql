-- ═══════════════════════════════════════════════════════════════════════════
-- KB INTEL MIGRATION
-- Adds doc_category to documents, and the Press Intelligence Pipeline tables
-- (kb_intel_sources, kb_intel_items, kb_intel_runs, kb_intel_config).
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. kb_admin role support ──────────────────────────────────────────────────
-- Uses the existing access_roles TEXT[] array — just add 'kb_admin' to a user's array
-- No schema change needed. Check access with: 'kb_admin' = ANY(access_roles)

-- ── 2. Document category column ───────────────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS doc_category TEXT DEFAULT 'uncategorised'
  CHECK (doc_category IN (
    'event_intelligence',
    'business_development',
    'project_management',
    'marketing',
    'company_knowledge',
    'external_owned',
    'external_partner',
    'external_press',
    'uncategorised'
  ));

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(doc_category);

-- ── 2b. One-time backfill — map existing docs' doc_category from their type ───
-- Only touches rows still at the 'uncategorised' default, so this is safe to
-- run again later without clobbering categories set by the upload form/ingest.
UPDATE documents SET doc_category = CASE
  WHEN type IN ('proposal', 'tender') THEN 'business_development'
  WHEN type IN ('event_report', 'event_brief') THEN 'event_intelligence'
  WHEN type IN ('corporate_profile', 'service_portfolio') THEN 'company_knowledge'
  WHEN type = 'external_intel' THEN 'external_press'
  ELSE 'uncategorised'
END
WHERE doc_category = 'uncategorised' OR doc_category IS NULL;

-- ── 3. Press intelligence tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_intel_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  -- 'search_query': run via Serper API (returns URLs from Google)
  -- 'direct_url':   crawl directly via Firecrawl (extracts links from the page)
  -- 'event_registry': special type — extracts structured event list from tresconglobal.com
  source_type     TEXT NOT NULL CHECK (source_type IN ('search_query', 'direct_url', 'event_registry')),
  -- 'owned_property': Trescon's own websites
  -- 'partner_govt':   client / government partner newsrooms
  -- 'press_media':    third-party media (searched via Serper)
  -- 'event_registry': tresconglobal.com event listing (special)
  category        TEXT NOT NULL DEFAULT 'press_media'
    CHECK (category IN ('owned_property', 'partner_govt', 'press_media', 'event_registry')),
  config          JSONB NOT NULL,
  -- For search_query: { "query": "Trescon site:arabianbusiness.com" }
  -- For direct_url:   { "url": "https://difc.ae/newsroom" }
  -- For event_registry: { "url": "https://tresconglobal.com/events" }
  crawl_frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (crawl_frequency IN ('weekly', 'monthly')),
  -- For owned_property URLs: how to handle pages found
  -- 'article_discovery': new pages → scored as articles → added to KB (default)
  -- 'fact_extraction':   page content → updates existing KB doc (e.g. company overview)
  -- 'event_extraction':  structured event list extraction (event_registry only)
  crawl_behaviour TEXT NOT NULL DEFAULT 'article_discovery'
    CHECK (crawl_behaviour IN ('article_discovery', 'fact_extraction', 'event_extraction')),
  is_active       BOOLEAN DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  last_found_count INTEGER DEFAULT 0,
  created_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_intel_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         UUID REFERENCES kb_intel_sources(id) ON DELETE SET NULL,
  url               TEXT NOT NULL UNIQUE,
  title             TEXT,
  published_date    TEXT,
  raw_content       TEXT,
  gemini_score      INTEGER CHECK (gemini_score BETWEEN 0 AND 100),
  gemini_reasoning  TEXT,
  gemini_summary    TEXT,
  event_mentioned   TEXT,
  article_type      TEXT CHECK (article_type IN ('press_release', 'media_coverage', 'government', 'event_website', 'other')),
  -- 'pending':        score 40–74, awaiting Thulasi review
  -- 'approved':       Thulasi approved, published to KB
  -- 'rejected':       Thulasi rejected
  -- 'auto_published': score ≥ 75, auto-published without review
  -- 'skipped':        score < 40, not relevant enough
  status            TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'auto_published', 'skipped')),
  reviewed_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,
  run_id            UUID,
  discovered_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_intel_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  status                TEXT DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  sources_checked       INTEGER DEFAULT 0,
  urls_discovered       INTEGER DEFAULT 0,
  items_auto_published  INTEGER DEFAULT 0,
  items_queued          INTEGER DEFAULT 0,
  items_skipped         INTEGER DEFAULT 0,
  error_message         TEXT,
  -- 'scheduler' = cron-job.org | 'manual' = admin clicked Run Now
  triggered_by          TEXT DEFAULT 'scheduler',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_intel_config (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cron schedule string (informational — actual cron is on cron-job.org)
  cron_schedule_display     TEXT DEFAULT '0 22 * * 0',
  is_enabled                BOOLEAN DEFAULT TRUE,
  auto_publish_threshold    INTEGER DEFAULT 75,
  review_threshold          INTEGER DEFAULT 40,
  -- Cached event registry data — refreshed weekly from tresconglobal.com
  event_registry_data       JSONB,
  event_registry_source     TEXT DEFAULT 'tresconglobal'
    CHECK (event_registry_source IN ('tresconglobal', 'eventpilot_internal')),
  event_registry_last_updated TIMESTAMPTZ,
  updated_by                UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- id is a randomly-generated PK, so ON CONFLICT DO NOTHING never actually
-- catches a re-run — guard explicitly so this stays a true singleton row.
INSERT INTO kb_intel_config (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM kb_intel_config);

-- ── 4. Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_status   ON kb_intel_items(status);
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_run_id   ON kb_intel_items(run_id);
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_source   ON kb_intel_items(source_id);
CREATE INDEX IF NOT EXISTS idx_kb_intel_runs_status    ON kb_intel_runs(status);
CREATE INDEX IF NOT EXISTS idx_kb_intel_sources_active ON kb_intel_sources(is_active);

-- ── 5. Verify ──────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name = 'doc_category';
