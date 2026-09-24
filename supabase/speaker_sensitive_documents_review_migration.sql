-- Producer review tracking for Passport/National ID (2026-09-24) — the
-- Status Board's Passport/National ID columns need a third state beyond
-- "on file or not": a producer must explicitly mark a document reviewed
-- before it counts as done (per Madhu: only a reviewed document is
-- available for further processing, e.g. an Operations team's future
-- badge/visa workflow). Until now speaker_sensitive_documents tracked
-- upload only — no reviewed concept existed anywhere in the app (confirmed
-- by search; event_speakers.reviewed_by/reviewed_at is a separate, unused,
-- per-speaker field from the original SAE build, not per-document).
--
-- Same FK/nullability shape as every other staff-attribution column on
-- this table (uploaded_by). NULL reviewed_at = not yet reviewed ("In
-- Progress" once a file exists). Re-uploading a document inserts a fresh
-- row (see this table's own top comment — one active row per (speaker,
-- type), replace soft-deletes the prior row) so a new file always starts
-- unreviewed again, correctly forcing re-review.
--
-- Run manually via the Supabase session-pooler psql connection — this repo
-- has no migration runner, all files under supabase/ are applied by hand.

ALTER TABLE speaker_sensitive_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE speaker_sensitive_documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
