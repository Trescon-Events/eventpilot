-- Background-job tracking for /api/generate-dept-courses (2026-08-24).
-- Production (eventpilot.tresconglobal.com) sits behind a Cloudflare Worker
-- proxy in front of Railway that kills any single proxied request around
-- ~100s. This route runs up to 3 sequential full Gemini course generations
-- (each producing 500+ words of read_content plus a 10-question bank) —
-- worked fine in local dev (no Cloudflare in that path) but three of those
-- stacked inline risks exceeding the live proxy's timeout. Same fix shape as
-- speaker_photo_clean_jobs / kb_intel_runs: the route creates this row and
-- fires the generation loop off as a background async function without
-- awaiting it (safe — EventPilot runs on Railway as a persistent
-- `next start` process, not serverless), returning { job_id } immediately.
-- The admin UI (CourseGeneratorSection.tsx) polls
-- /api/generate-dept-courses/job/[jobId] until status leaves 'processing'.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS dept_course_gen_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status       TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  department   TEXT NOT NULL,
  tier_level   TEXT NOT NULL,
  count        INT NOT NULL,
  courses      JSONB,        -- set on done: [{ id, title, tier_level }]
  errors       JSONB,        -- set on done: string[] (per-course generation/save failures, non-fatal)
  error_message TEXT,        -- set on error: an uncaught/fatal failure for the whole job
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

COMMIT;
