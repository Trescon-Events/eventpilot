-- Bespoke Tracker · Task section overhaul
-- Nic build_request 2f002c2e
--
-- Adds three columns to support the 43-task SOP blueprint with dynamic
-- interpolation, creator-only edit/delete permissions, and team assignment
-- badges. Idempotent — safe to re-run.
--
-- Apply manually against production Supabase (Dashboard → SQL Editor → New
-- Query → paste this file → Run). No auto-deploy — CLAUDE.md rule #6.
--
-- After apply, the app code (already deployed) will start populating the new
-- columns on any new bespoke project. Existing rows remain untouched:
--   - bespoke_projects.creator_id stays NULL on legacy rows → edit/delete
--     stays permissive on those (any admin can act) until a creator is set.
--   - bespoke_tasks.assigned_team is derived from assigned_role on legacy
--     rows via the CASE in the backfill statement below.

BEGIN;

-- 1. Track who created each bespoke project (drives edit/delete permission
--    on tasks per Nic's request that "only the event creator or an admin"
--    may modify tasks).
ALTER TABLE bespoke_projects
  ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;

-- 2. Free-text description on tasks (Nic wants each SOP task to have a
--    longer description than just the title).
ALTER TABLE bespoke_tasks
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Team assignment — a canonical vocabulary distinct from assigned_role
--    (which was per-lead-user). Nic's approved values:
--    Commercial · Marketing · Delegate Team · Operations · Design · Production · DRT · Client · All Teams
ALTER TABLE bespoke_tasks
  ADD COLUMN IF NOT EXISTS assigned_team TEXT;

-- Optional CHECK constraint — reject typos while keeping the field open to
-- future additions. Wrapped in a DO block so re-running the migration
-- doesn't fail on the second attempt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bespoke_tasks_assigned_team_check'
  ) THEN
    ALTER TABLE bespoke_tasks
      ADD CONSTRAINT bespoke_tasks_assigned_team_check
      CHECK (assigned_team IS NULL OR assigned_team IN (
        'Commercial', 'Marketing', 'Delegate Team', 'Operations',
        'Design', 'Production', 'DRT', 'Client', 'All Teams'
      ));
  END IF;
END$$;

-- Backfill assigned_team from assigned_role on legacy rows so the UI can
-- show a badge on every task, not just newly-seeded ones.
UPDATE bespoke_tasks
SET assigned_team = CASE assigned_role
  WHEN 'commercial' THEN 'Commercial'
  WHEN 'marketing'  THEN 'Marketing'
  WHEN 'delegate'   THEN 'Delegate Team'
  WHEN 'operations' THEN 'Operations'
  WHEN 'design'     THEN 'Design'
  WHEN 'production' THEN 'Production'
  ELSE NULL
END
WHERE assigned_team IS NULL AND assigned_role IS NOT NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- Verify (run separately after COMMIT):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'bespoke_projects' AND column_name = 'creator_id';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'bespoke_tasks' AND column_name IN ('description', 'assigned_team');
--   SELECT assigned_team, count(*) FROM bespoke_tasks GROUP BY assigned_team;
-- ─────────────────────────────────────────────────────────────────────
