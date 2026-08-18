-- Task Manager module — branding/creative team task tracker.
-- Rebuilt from Khalifa's TaskSphere prototype (Express + flat db.json, no
-- auth) natively inside EventPilot: assignees now bind to real staff_members
-- rows instead of free-text names, and access is gated via tool_grants.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS task_manager_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name      TEXT,                     -- free text per TaskSphere ("Bespoke Events", "Others", etc.) — not an events(id) FK
  description     TEXT NOT NULL,
  assigned_by     UUID NOT NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  assigned_to     UUID NOT NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  assigned_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  deadline        DATE,
  status          TEXT NOT NULL DEFAULT 'Not-Started' CHECK (status IN ('Not-Started','In-Progress','Completed')),
  priority        TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
  remarks         TEXT,
  tracked_seconds INT NOT NULL DEFAULT 0,     -- denormalized, rolled up from task_manager_time_logs on stop/pause
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Named task_manager_time_logs, NOT "timesheets" — staff_timesheets already
-- exists (supabase/ALL_TABLES.sql) for HR/payroll daily-hours approval;
-- reusing that name here would collide semantically with unrelated finance code.
CREATE TABLE IF NOT EXISTS task_manager_time_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES task_manager_tasks(id) ON DELETE CASCADE,
  staff_id          UUID NOT NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  category          TEXT,
  log_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time        TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time          TIMESTAMPTZ,               -- null while running
  duration_seconds  INT,                       -- set on stop/pause
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One running timer per person, platform-wide (matches TaskSphere's single timer widget)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tm_one_active_timer_per_staff
  ON task_manager_time_logs(staff_id) WHERE end_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_tm_tasks_assigned_to ON task_manager_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tm_tasks_status      ON task_manager_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tm_time_logs_task    ON task_manager_time_logs(task_id);

COMMIT;

-- Verify manually:
-- SELECT * FROM task_manager_tasks LIMIT 5;
-- SELECT * FROM task_manager_time_logs WHERE end_time IS NULL;
