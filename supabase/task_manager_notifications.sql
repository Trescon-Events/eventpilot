-- Task Manager — desktop "you were just assigned a task" notifications.
-- assigned_to_changed_at is a purpose-built column that only moves when
-- assigned_to itself changes (via the trigger below), never on an edit to
-- remarks/priority/status/etc. — that's what lets the polling client
-- (app/admin/task-manager/NotificationManager.tsx, via
-- GET /api/task-manager/notifications) tell "newly assigned to me" apart
-- from "any edit touched a task already assigned to me" without false
-- positives.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand. This is a NEW file, separate from
-- the already-applied supabase/task_manager_task_types.sql.

BEGIN;

ALTER TABLE task_manager_tasks
  ADD COLUMN IF NOT EXISTS assigned_to_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION task_manager_set_assigned_to_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.assigned_to_changed_at := now();
  ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    NEW.assigned_to_changed_at := now();
  ELSE
    NEW.assigned_to_changed_at := OLD.assigned_to_changed_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_manager_assigned_to_changed_at ON task_manager_tasks;
CREATE TRIGGER trg_task_manager_assigned_to_changed_at
  BEFORE INSERT OR UPDATE ON task_manager_tasks
  FOR EACH ROW EXECUTE FUNCTION task_manager_set_assigned_to_changed_at();

CREATE INDEX IF NOT EXISTS idx_tm_tasks_assigned_to_changed_at ON task_manager_tasks(assigned_to, assigned_to_changed_at);

COMMIT;

-- Verify manually:
-- UPDATE task_manager_tasks SET remarks = remarks WHERE id = '<some id>'; -- should NOT change assigned_to_changed_at
-- UPDATE task_manager_tasks SET assigned_to = '<other staff id>' WHERE id = '<some id>'; -- SHOULD change it
