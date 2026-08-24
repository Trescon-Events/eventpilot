-- Background-job tracking for POST /api/kb/ingest (2026-08-24). Same
-- Cloudflare-proxy-timeout class as speaker_photo_clean_jobs (see that
-- migration's own comment) and the original precedent, kb_intel_runs
-- (supabase/kb_intel_migration.sql): production sits behind a Cloudflare
-- Worker proxy in front of Railway that kills any single proxied request
-- around ~100s. /api/kb/ingest's structured branch chains a PDF-extraction
-- Gemini call (Files API for anything over 5MB), a second Gemini call to
-- generate the structured .md summary, and a third best-effort Gemini call
-- for self-learning gap detection — already flagged in the route's own
-- `export const maxDuration = 120` as a known-long-running path, but that
-- Next.js config does nothing against Cloudflare's independent timeout.
-- The general-ingest branch chains a similar extraction call + one
-- analyseGeneralDocument Gemini call.
--
-- Same fix shape: the route now creates this row, fires the real ingest
-- pipeline off as a background async function without awaiting it (safe on
-- Railway's persistent `next start` process), and returns { job_id }
-- immediately. The KB upload UI polls .../kb/ingest/job/[jobId] until the
-- job leaves 'processing', then applies the exact same result object it
-- used to get back synchronously.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS kb_ingest_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  result        JSONB,          -- set on status='done': the exact { success, detected_type, document, summary, gaps, gap_session_id } (or general-branch equivalent) shape the route used to return inline
  error_message TEXT,           -- set on status='error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

COMMIT;
