-- Task Manager: add per-session notes + manual-entry flag to time logs.
-- Ports two more TaskSphere features: a work description captured per
-- tracked session (distinct from the task's own description/remarks), and
-- category tagging — both existed in the original prototype but weren't
-- carried over in the first pass. `category` itself already exists on
-- task_manager_time_logs (added in task_manager.sql) — this just adds what
-- was still missing.
--
-- Run manually in the Supabase Dashboard SQL editor (project yuyxfxoevztugtfgduks).

BEGIN;

ALTER TABLE task_manager_time_logs
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS manual_entry BOOLEAN NOT NULL DEFAULT false;

COMMIT;

-- Verify manually:
-- SELECT id, category, description, manual_entry FROM task_manager_time_logs LIMIT 5;
