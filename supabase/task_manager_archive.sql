-- Task Manager: Soft-archiving for completed tasks.
-- Completed tasks automatically archive next day (or via manual archive / bulk archive).
-- Preserves timesheets, reporting, and event post-mortems while keeping the live active board clean.
--
-- Run manually in the Supabase Dashboard SQL editor (project yuyxfxoevztugtfgduks).

BEGIN;

ALTER TABLE task_manager_tasks
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tm_tasks_archived ON task_manager_tasks(archived_at);

COMMIT;

-- Verify manually:
-- SELECT id, description, status, archived_at FROM task_manager_tasks LIMIT 5;
