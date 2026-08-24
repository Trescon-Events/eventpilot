-- Background-job tracking for the Photo Cleaning Wizard's "AI Fill + Enhance"
-- step (2026-08-24). Production (eventpilot.tresconglobal.com) sits behind a
-- Cloudflare Worker proxy in front of Railway that enforces a hard ~100s
-- timeout on any single proxied request — confirmed precedent: the KB Intel
-- pipeline (supabase/kb_intel_migration.sql's kb_intel_runs) hit the exact
-- same wall. AI Fill's own pipeline (OpenAI gpt-image-2 edit, documented at
-- 30-90s, sometimes 120s+ at the 'high' quality regenerate tier, plus a
-- PhotoRoom green-screen despill call after it) was previously awaited
-- synchronously inside clean-photo/generate's request handler — worked
-- every time in local dev (no Cloudflare in that path) but can be killed by
-- the proxy in production, which the browser then sees as a non-JSON 502
-- Cloudflare error page instead of the route's own error response.
--
-- Same fix shape as kb_intel_runs: the route creates this row and fires the
-- actual pipeline off as a background async function without awaiting it
-- (safe here — EventPilot runs on Railway as a persistent `next start`
-- Node process, not a serverless function torn down after the response),
-- returning { job_id } immediately. The wizard then polls
-- .../clean-photo/job/[jobId] every few seconds until status leaves
-- 'processing'.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS speaker_photo_clean_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id    UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  mode          TEXT NOT NULL,                 -- always 'ai_fill' today; kept open in case another mode needs this later
  quality       TEXT,                          -- 'medium' | 'high'
  result        JSONB,                         -- set on status='done': { pending_photo_url, ai_edited_photo_url?, suggested_head_box, ai_extended }
  error_message TEXT,                          -- set on status='error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS speaker_photo_clean_jobs_speaker_id_idx ON speaker_photo_clean_jobs(speaker_id);

COMMIT;
