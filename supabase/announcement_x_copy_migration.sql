-- X (Twitter)-specific post copy (2026-08-27) — per Madhu: "we post on X
-- all the time", a single shared LinkedIn-length copy was tripping X's 280
-- char limit on every post. Generated ALWAYS, alongside the main copy, not
-- on-demand — same generation call (one more field in the existing Gemini
-- JSON response), so no extra AI round-trip. Falls back to a hard-truncated
-- slice of the main copy if Gemini ever omits it (see
-- app/lib/events/announcements.ts's parseGeminiCopyResponse).
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS post_copy_x TEXT;

COMMIT;
