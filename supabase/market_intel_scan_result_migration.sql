-- Background-job support for the Market Intelligence scan route (2026-08-24).
-- Same Cloudflare ~100s proxy timeout risk as speaker_photo_clean_jobs_migration.sql
-- (read that file's own comment for the full incident writeup) — a single
-- market-intel scan (up to 20 page fetches + an 8-page level-2 crawl + a
-- Gemini call with up to 4 model fallbacks) can run well past 100s, and this
-- route worked fine in local dev (no Cloudflare in that path) but is exposed
-- to the same proxy live, since the scan happens against the SAME
-- eventpilot.tresconglobal.com origin regardless of whether the caller is
-- the browser (app/lib/scanManager.ts) or another server route.
--
-- market_intel_scans already tracked status ('running'/'complete'/'failed')
-- per scan — this just adds the two columns needed to make POST
-- /api/market-intel a background job against that SAME row instead of
-- awaiting the whole pipeline inline: `result` holds the exact JSON shape
-- the route used to return inline (so a poller reads the identical shape it
-- always expected, byte for byte), `failure_reason` persists the same short
-- failure category the inline error response used to include
-- (network|parse|rate_limit|timeout|ai|invalid_request).
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE market_intel_scans ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE market_intel_scans ADD COLUMN IF NOT EXISTS failure_reason TEXT;

COMMIT;
