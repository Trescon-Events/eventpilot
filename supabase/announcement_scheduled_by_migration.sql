-- scheduled_by (2026-08-28) — per Madhu: once a scheduled (not
-- immediate-post) announcement actually goes live on every channel, the
-- producer who scheduled it should get an email with a direct link to the
-- published announcement, so they can go straight to tagging + notifying
-- internal/external stakeholders. Stamped by schedule/route.ts at the
-- moment of scheduling; the sync-status cron's success branch reads it to
-- decide who to email. Deliberately separate from created_by — the person
-- who drafted an announcement and the person who actually schedules it
-- can be different staff members, and the notification should reach
-- whoever made the schedule decision, see schedule/route.ts's own comment.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS scheduled_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;

COMMIT;
