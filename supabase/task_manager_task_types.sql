-- Task Manager — task types (Web Design, Web Dev, ...) — a required
-- classification on every task going forward, internal or vendor-assigned.
-- Separate concept from the vendor-contact roster (supabase/vendor_accounts.sql,
-- "who at an agency should pick this up") — this applies to every task.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS task_manager_task_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nullable at the DB level — existing tasks have none, no backfill forced.
-- The app layer (app/api/task-manager POST/PATCH) is what makes this
-- required going forward for creating/editing a task.
ALTER TABLE task_manager_tasks
  ADD COLUMN IF NOT EXISTS task_type_id UUID REFERENCES task_manager_task_types(id) ON DELETE SET NULL;

-- Seed once — safe to run multiple times, only inserts if the table is
-- still empty (no unique constraint on label to key an ON CONFLICT off).
INSERT INTO task_manager_task_types (label, sort_order)
SELECT * FROM (VALUES
  ('Web Design',              0),
  ('Web Dev',                 1),
  ('Brochure/Package',        2),
  ('Proposal',                3),
  ('Floorplan',               4),
  ('General Graphic Design',  5),
  ('Social Video',            6),
  ('Regular Video Editing',   7),
  ('3D',                      8)
) AS seed(label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM task_manager_task_types);

COMMIT;

-- Verify manually:
-- SELECT id, label, sort_order, active FROM task_manager_task_types ORDER BY sort_order;
