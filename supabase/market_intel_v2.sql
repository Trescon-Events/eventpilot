-- ─── Market Intelligence v2 — Schema Migrations ───────────────────────────────
-- Run this in Supabase SQL Editor BEFORE deploying any code changes.
-- Safe to run multiple times (IF NOT EXISTS everywhere).

-- ── 1. Jobs table (must exist before adding FK to scans) ─────────────────────
CREATE TABLE IF NOT EXISTS market_intel_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                uuid REFERENCES events(id) ON DELETE SET NULL,
  label                   text,                          -- e.g. "Batch 1 — 5 URLs"
  status                  text NOT NULL DEFAULT 'pending', -- pending|running|paused|cancelled|complete|failed
  total_urls              int  DEFAULT 0,
  completed_urls          int  DEFAULT 0,
  failed_urls             int  DEFAULT 0,
  participants_found      int  DEFAULT 0,
  speakers_found          int  DEFAULT 0,
  credits_gemini_calls    int  DEFAULT 0,
  credits_firecrawl_pages int  DEFAULT 0,
  credits_jina_pages      int  DEFAULT 0,
  partial_failures        jsonb DEFAULT '[]',
  created_at              timestamptz DEFAULT now(),
  completed_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_market_intel_jobs_event_id ON market_intel_jobs(event_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_jobs_status   ON market_intel_jobs(status);

-- ── 2. Alter scans — add job_id + new tracking fields ────────────────────────
ALTER TABLE market_intel_scans
  ADD COLUMN IF NOT EXISTS job_id               uuid REFERENCES market_intel_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS speakers_found       int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_failures     jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS credits_gemini_calls    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_firecrawl_pages int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_jina_pages      int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_fresh_rescan      boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_market_intel_scans_job_id ON market_intel_scans(job_id);

-- ── 3. Alter companies — add description, linkedin, modified_at ───────────────
ALTER TABLE market_intel_companies
  ADD COLUMN IF NOT EXISTS description          text,
  ADD COLUMN IF NOT EXISTS company_linkedin_url text,
  ADD COLUMN IF NOT EXISTS modified_at          timestamptz DEFAULT now();

-- Backfill modified_at for existing rows
UPDATE market_intel_companies SET modified_at = created_at WHERE modified_at IS NULL;

-- ── 4. Speakers table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_intel_speakers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id             uuid REFERENCES market_intel_scans(id) ON DELETE CASCADE,
  job_id              uuid REFERENCES market_intel_jobs(id) ON DELETE SET NULL,
  event_id            uuid REFERENCES events(id) ON DELETE SET NULL,

  speaker_name        text NOT NULL,
  job_title           text,
  speaker_company     text,
  speaker_company_url text,
  linkedin_url        text,

  confidence          float,
  evidence            jsonb,
  source_page_url     text,

  is_duplicate        boolean DEFAULT false,

  created_at          timestamptz DEFAULT now(),
  modified_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_intel_speakers_scan_id   ON market_intel_speakers(scan_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_speakers_job_id    ON market_intel_speakers(job_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_speakers_event_id  ON market_intel_speakers(event_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_speakers_name      ON market_intel_speakers(speaker_name);
