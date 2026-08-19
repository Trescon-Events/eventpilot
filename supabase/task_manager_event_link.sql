-- Task Manager: link tasks to a real event instead of a free-text name.
-- "Workstream" was requested too, but no event-independent workstream list
-- exists anywhere in EventPilot's schema or the HRMS-synced staff data
-- (checked: staff_members.department/business_unit don't match, no
-- standalone workstreams table/API) — skipped per Madhu's explicit
-- fallback instruction, Event-only for now.
--
-- Run manually in the Supabase Dashboard SQL editor (project yuyxfxoevztugtfgduks).

BEGIN;

ALTER TABLE task_manager_tasks
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tm_tasks_event ON task_manager_tasks(event_id);

-- No production tasks exist yet on this table, so no backfill needed —
-- safe to drop the old free-text column outright rather than deprecate it.
ALTER TABLE task_manager_tasks DROP COLUMN IF EXISTS event_name;

COMMIT;

-- Verify manually:
-- SELECT id, event_id, description FROM task_manager_tasks LIMIT 5;
