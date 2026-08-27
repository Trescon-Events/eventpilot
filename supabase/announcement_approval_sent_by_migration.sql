-- Real sender name on announcement_approvals (2026-08-27) — the review
-- page was falling back to a hardcoded "the Marketing Manager" whenever
-- stakeholder_announcements.created_by was unhelpful or unset, which is
-- actively wrong for the external round (a speaker/their office should see
-- the real name of whoever actually emailed them, matching the "from"
-- name already in their inbox) — per Madhu, spotted live-testing.
--
-- Populated at send time for both layers: send-for-approval/route.ts
-- (internal) resolves the triggering staffer's name from the session;
-- send-for-external-approval/send/route.ts (external) already resolves
-- this via resolveSenderIdentity() for the Graph "from" header, so it's
-- just stored alongside instead of discarded.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE announcement_approvals ADD COLUMN IF NOT EXISTS sent_by_name TEXT;

COMMIT;
