-- ═════════════════════════════════════════════════════════════════════════════
-- TRESCADEMY HRMS — FULL SCHEMA
-- Extends staff_members (confirmed live DB columns).
-- Does NOT recreate: staff_members, events, offices,
--   finance_cost_config, hr_cost_config, hr_work_logs, finance_work_logs,
--   courses, course_completions, course_attempts, notifications.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Payroll grades / cost centres ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_grades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL UNIQUE,        -- e.g. 'L1', 'L2', 'M1', 'M2', 'SM'
  label             TEXT NOT NULL,               -- e.g. 'Junior', 'Mid', 'Senior', 'Manager'
  cost_centre       TEXT NOT NULL DEFAULT 'operations',
  min_salary        NUMERIC(14,2),
  max_salary        NUMERIC(14,2),
  currency          TEXT NOT NULL DEFAULT 'USD',
  overhead_rate_pct NUMERIC(5,2) DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO payroll_grades (code, label, cost_centre, sort_order) VALUES
  ('L1', 'Junior',         'operations', 1),
  ('L2', 'Mid-Level',      'operations', 2),
  ('L3', 'Senior',         'operations', 3),
  ('M1', 'Team Lead',      'operations', 4),
  ('M2', 'Manager',        'operations', 5),
  ('SM', 'Senior Manager', 'operations', 6),
  ('D1', 'Director',       'leadership',  7),
  ('EX', 'Executive',      'leadership',  8)
ON CONFLICT (code) DO NOTHING;

-- ── 2. Staff contracts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id            UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  contract_type       TEXT NOT NULL DEFAULT 'full_time'
                        CHECK (contract_type IN ('full_time','part_time','contract','internship','probation')),
  employment_status   TEXT NOT NULL DEFAULT 'active'
                        CHECK (employment_status IN ('active','probation','notice_period','resigned','terminated','on_leave')),
  grade_id            UUID REFERENCES payroll_grades(id) ON DELETE SET NULL,
  start_date          DATE NOT NULL,
  contract_end_date   DATE,               -- null = permanent / open-ended
  probation_end       DATE,
  notice_period_days  INTEGER DEFAULT 30,
  cost_centre         TEXT,
  notes               TEXT,
  created_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Only one active contract per staff member
  CONSTRAINT one_active_contract UNIQUE (staff_id, employment_status)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS staff_contracts_staff_idx  ON staff_contracts(staff_id);
CREATE INDEX IF NOT EXISTS staff_contracts_status_idx ON staff_contracts(employment_status);
CREATE INDEX IF NOT EXISTS staff_contracts_end_idx    ON staff_contracts(contract_end_date) WHERE contract_end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_contracts_prob_idx   ON staff_contracts(probation_end)     WHERE probation_end IS NOT NULL;

-- ── 3. Employment history ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_employment_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  changed_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  change_type     TEXT NOT NULL
                    CHECK (change_type IN (
                      'hire','promotion','transfer','department_change',
                      'manager_change','grade_change','status_change','offboarding'
                    )),
  previous_value  JSONB,
  new_value       JSONB NOT NULL DEFAULT '{}',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employment_history_staff_idx ON staff_employment_history(staff_id);
CREATE INDEX IF NOT EXISTS employment_history_date_idx  ON staff_employment_history(created_at);

-- ── 4. Leave types ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  code                  TEXT NOT NULL UNIQUE,
  default_days_per_year INTEGER NOT NULL DEFAULT 0,
  requires_approval     BOOLEAN NOT NULL DEFAULT TRUE,
  is_paid               BOOLEAN NOT NULL DEFAULT TRUE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO leave_types (name, code, default_days_per_year, requires_approval, is_paid, sort_order) VALUES
  ('Annual Leave',     'AL', 20, TRUE,  TRUE,  1),
  ('Sick Leave',       'SL', 10, FALSE, TRUE,  2),
  ('Emergency Leave',  'EM',  3, FALSE, TRUE,  3),
  ('Maternity Leave',  'ML', 90, TRUE,  TRUE,  4),
  ('Paternity Leave',  'PL', 15, TRUE,  TRUE,  5),
  ('Unpaid Leave',     'UL',  0, TRUE,  FALSE, 6),
  ('Compensatory Off', 'CO',  0, FALSE, TRUE,  7)
ON CONFLICT (code) DO NOTHING;

-- ── 5. Staff leave balances ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_leave_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  leave_type_id   UUID NOT NULL REFERENCES leave_types(id)  ON DELETE CASCADE,
  year            INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  entitled_days   NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days       NUMERIC(5,1) NOT NULL DEFAULT 0,
  pending_days    NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_over    NUMERIC(5,1) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, leave_type_id, year)
);

CREATE INDEX IF NOT EXISTS leave_balances_staff_idx ON staff_leave_balances(staff_id, year);

-- ── 6. Staff leave requests ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_leave_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  leave_type_id   UUID NOT NULL REFERENCES leave_types(id)  ON DELETE CASCADE,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_days      NUMERIC(5,1) NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leave_requests_staff_idx  ON staff_leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON staff_leave_requests(status);
CREATE INDEX IF NOT EXISTS leave_requests_dates_idx  ON staff_leave_requests(start_date, end_date);

-- ── 7. Onboarding templates ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  department   TEXT,
  job_level    TEXT,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  owner        TEXT NOT NULL DEFAULT 'hr'
                 CHECK (owner IN ('hr','manager','it','staff','finance')),
  due_day      INTEGER NOT NULL DEFAULT 1,   -- due N days after joining
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  course_id    UUID REFERENCES courses(id) ON DELETE SET NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS onboarding_template_tasks_tmpl_idx ON onboarding_template_tasks(template_id);

-- ── 8. Staff onboarding instances ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_onboarding (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL UNIQUE REFERENCES staff_members(id) ON DELETE CASCADE,
  template_id  UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  started_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  target_end   DATE,
  status       TEXT NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress','completed','stalled')),
  completed_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_onboarding_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id    UUID NOT NULL REFERENCES staff_onboarding(id) ON DELETE CASCADE,
  template_task_id UUID REFERENCES onboarding_template_tasks(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  owner            TEXT NOT NULL DEFAULT 'hr',
  due_date         DATE,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','in_progress','completed','skipped')),
  completed_at     TIMESTAMPTZ,
  completed_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  notes            TEXT,
  course_id        UUID REFERENCES courses(id) ON DELETE SET NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS staff_onboarding_tasks_ob_idx ON staff_onboarding_tasks(onboarding_id);
CREATE INDEX IF NOT EXISTS staff_onboarding_tasks_status ON staff_onboarding_tasks(status);

-- ── 9. Offboarding ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_offboarding (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id                UUID NOT NULL UNIQUE REFERENCES staff_members(id) ON DELETE CASCADE,
  reason                  TEXT NOT NULL DEFAULT 'resignation'
                            CHECK (reason IN ('resignation','termination','contract_end','retirement','other')),
  last_working_day        DATE NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress','completed')),
  exit_interview          BOOLEAN NOT NULL DEFAULT FALSE,
  knowledge_transfer_done BOOLEAN NOT NULL DEFAULT FALSE,
  access_revoked          BOOLEAN NOT NULL DEFAULT FALSE,
  final_settlement        TEXT NOT NULL DEFAULT 'pending'
                            CHECK (final_settlement IN ('pending','processed','completed')),
  notes                   TEXT,
  initiated_by            UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_offboarding_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offboarding_id UUID NOT NULL REFERENCES staff_offboarding(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  owner          TEXT NOT NULL DEFAULT 'hr'
                   CHECK (owner IN ('hr','manager','it','finance','staff')),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','completed','skipped')),
  completed_at   TIMESTAMPTZ,
  completed_by   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS staff_offboarding_tasks_idx ON staff_offboarding_tasks(offboarding_id);

-- ── 10. Course assignments — individual staff training tracker ────────────────
-- One row per staff member per course. Status tracked here.
-- Auto-upserted when onboarding clones a template task with course_id.
CREATE TABLE IF NOT EXISTS course_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','completed','waived')),
  assigned_by  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_assignments_staff_idx  ON course_assignments(staff_id);
CREATE INDEX IF NOT EXISTS course_assignments_course_idx ON course_assignments(course_id);
CREATE INDEX IF NOT EXISTS course_assignments_status_idx ON course_assignments(status);

-- ── 11. Training certificates ────────────────────────────────────────────────
-- Auto-created when a course_assignment is marked completed.
-- Can also be manually issued for external/offline training.
CREATE TABLE IF NOT EXISTS training_certificates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  issued_at      DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at     DATE,
  certificate_no TEXT NOT NULL UNIQUE
                   DEFAULT 'TRES-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  notes          TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, course_id)
);

CREATE INDEX IF NOT EXISTS training_certs_staff_idx ON training_certificates(staff_id);
CREATE INDEX IF NOT EXISTS training_certs_expiry_idx ON training_certificates(expires_at) WHERE expires_at IS NOT NULL;

-- ── 12. HR alerts ─────────────────────────────────────────────────────────────
-- Open alerts surfaced on the HR dashboard.
-- run_checks endpoint auto-creates; HR can acknowledge or resolve.
CREATE TABLE IF NOT EXISTS hr_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  type          TEXT NOT NULL
                  CHECK (type IN (
                    'probation_ending','contract_expiring','leave_balance_low',
                    'certificate_expiring','onboarding_overdue','offboarding_overdue',
                    'training_overdue','birthday','work_anniversary','custom'
                  )),
  title         TEXT NOT NULL,
  body          TEXT,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','acknowledged','resolved')),
  metadata      JSONB,
  resolved_note TEXT,
  resolved_at   TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_alerts_staff_idx  ON hr_alerts(staff_id);
CREATE INDEX IF NOT EXISTS hr_alerts_status_idx ON hr_alerts(status);
CREATE INDEX IF NOT EXISTS hr_alerts_due_idx    ON hr_alerts(due_date) WHERE due_date IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE payroll_grades            ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_contracts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_employment_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types               ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_leave_balances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_leave_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_onboarding          ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_onboarding_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_offboarding         ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_offboarding_tasks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_certificates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_alerts                 ENABLE ROW LEVEL SECURITY;

-- Public read for reference/lookup tables
CREATE POLICY "public read payroll_grades" ON payroll_grades FOR SELECT USING (true);
CREATE POLICY "public read leave_types"    ON leave_types    FOR SELECT USING (true);
