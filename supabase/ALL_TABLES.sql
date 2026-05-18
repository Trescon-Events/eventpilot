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
-- ═════════════════════════════════════════════════════════════════════════════
-- STAFF ATTENDANCE & TIMESHEETS
-- Daily attendance records for all staff.
-- Timesheets: hours per day, project-tagged (separate from Finance/HR overhead).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Daily attendance ───────────────────────────────────────────────────────
-- One row per staff per day. HR or staff can log; admin can override.
CREATE TABLE IF NOT EXISTS staff_attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  status       TEXT NOT NULL DEFAULT 'present'
                 CHECK (status IN ('present','absent','half_day','wfh','on_leave','holiday','weekend')),
  clock_in     TIME,
  clock_out    TIME,
  work_hours   NUMERIC(4,2) GENERATED ALWAYS AS (
                 CASE WHEN clock_in IS NOT NULL AND clock_out IS NOT NULL
                      THEN ROUND(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0, 2)
                      ELSE NULL END
               ) STORED,
  location     TEXT DEFAULT 'office' CHECK (location IN ('office','wfh','client_site','travel')),
  late_arrival BOOLEAN NOT NULL DEFAULT FALSE,
  early_leave  BOOLEAN NOT NULL DEFAULT FALSE,
  notes        TEXT,
  logged_by    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, date)
);

CREATE INDEX IF NOT EXISTS staff_attendance_staff_idx  ON staff_attendance(staff_id);
CREATE INDEX IF NOT EXISTS staff_attendance_date_idx   ON staff_attendance(date);
CREATE INDEX IF NOT EXISTS staff_attendance_status_idx ON staff_attendance(status, date);

-- ── 2. Staff timesheets ───────────────────────────────────────────────────────
-- Daily hour logs for all staff — project/event tagged.
-- Different from finance_work_logs/hr_work_logs which are for overhead allocation.
CREATE TABLE IF NOT EXISTS staff_timesheets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  hours       NUMERIC(4,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,  -- null = internal/admin work
  task_type   TEXT NOT NULL DEFAULT 'project_work'
                CHECK (task_type IN (
                  'project_work','event_execution','business_development',
                  'internal_meeting','training','admin','other'
                )),
  description TEXT NOT NULL,
  approved    BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_timesheets_staff_idx ON staff_timesheets(staff_id);
CREATE INDEX IF NOT EXISTS staff_timesheets_date_idx  ON staff_timesheets(date);
CREATE INDEX IF NOT EXISTS staff_timesheets_event_idx ON staff_timesheets(event_id);

-- ── 3. Company assets ────────────────────────────────────────────────────────
-- Track laptops, phones, access cards, etc. assigned to staff.
CREATE TABLE IF NOT EXISTS staff_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID REFERENCES staff_members(id) ON DELETE SET NULL,  -- null = in stock
  asset_type    TEXT NOT NULL
                  CHECK (asset_type IN ('laptop','phone','access_card','monitor','headset','sim_card','other')),
  asset_tag     TEXT UNIQUE,            -- asset serial / tag number
  brand_model   TEXT,
  serial_number TEXT,
  assigned_at   DATE,
  returned_at   DATE,
  condition     TEXT NOT NULL DEFAULT 'good'
                  CHECK (condition IN ('new','good','fair','damaged','lost')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_assets_staff_idx ON staff_assets(staff_id);
CREATE INDEX IF NOT EXISTS staff_assets_type_idx  ON staff_assets(asset_type);

-- ── 4. Staff HR documents ────────────────────────────────────────────────────
-- Metadata for HR documents (offer letters, ID copies, visa, etc.)
-- Actual files stored in Supabase Storage — only metadata here.
CREATE TABLE IF NOT EXISTS staff_hr_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL
                  CHECK (doc_type IN (
                    'offer_letter','contract','nda','id_copy','passport',
                    'visa','emirates_id','educational_certificate',
                    'experience_letter','salary_slip','other'
                  )),
  title         TEXT NOT NULL,
  file_url      TEXT,       -- Supabase Storage URL
  file_name     TEXT,
  issued_date   DATE,
  expiry_date   DATE,
  uploaded_by   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_hr_docs_staff_idx ON staff_hr_documents(staff_id);
CREATE INDEX IF NOT EXISTS staff_hr_docs_type_idx  ON staff_hr_documents(doc_type);
CREATE INDEX IF NOT EXISTS staff_hr_docs_expiry_idx ON staff_hr_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- ── 5. Performance reviews ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  reviewer_id     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  review_period   TEXT NOT NULL,   -- e.g. 'Q1 2026', 'Annual 2025'
  review_date     DATE,
  overall_rating  NUMERIC(3,1) CHECK (overall_rating BETWEEN 1 AND 5),
  kpi_score       NUMERIC(5,2),    -- percentage achievement
  strengths       TEXT,
  areas_to_improve TEXT,
  goals_next_period TEXT,
  reviewer_comments TEXT,
  staff_comments  TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','acknowledged','completed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS perf_reviews_staff_idx    ON performance_reviews(staff_id);
CREATE INDEX IF NOT EXISTS perf_reviews_reviewer_idx ON performance_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS perf_reviews_period_idx   ON performance_reviews(review_period);

-- ── 6. Salary records ────────────────────────────────────────────────────────
-- Actual salary per staff member per period (confidential).
-- Separate from payroll_grades which are just band labels.
CREATE TABLE IF NOT EXISTS staff_salary_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  effective_from  DATE NOT NULL,
  effective_to    DATE,             -- null = current
  basic_salary    NUMERIC(14,2) NOT NULL,
  allowances      NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_salary    NUMERIC(14,2) GENERATED ALWAYS AS (basic_salary + allowances) STORED,
  net_salary      NUMERIC(14,2) GENERATED ALWAYS AS (basic_salary + allowances - deductions) STORED,
  currency        TEXT NOT NULL DEFAULT 'USD',
  grade_id        UUID REFERENCES payroll_grades(id) ON DELETE SET NULL,
  notes           TEXT,
  created_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS salary_records_staff_idx ON staff_salary_records(staff_id);
CREATE INDEX IF NOT EXISTS salary_records_date_idx  ON staff_salary_records(effective_from);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE staff_attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_timesheets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_assets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_hr_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_salary_records  ENABLE ROW LEVEL SECURITY;
-- All reads/writes go through API with supabaseAdmin (service role bypasses RLS).
-- ─────────────────────────────────────────────────────────────────────────────
-- EVENT P&L SCHEMA
-- Covers: budget, deals (revenue), expenses, delegates (strategic value)
-- Currency: each event is USD or INR; deal amounts stored raw + converted
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expense categories (admin-configurable) ────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default categories
INSERT INTO expense_categories (name, sort_order) VALUES
  ('Venue & Logistics',         1),
  ('AV & Technology',           2),
  ('Catering & Hospitality',    3),
  ('Marketing & Creative',      4),
  ('Travel & Accommodation',    5),
  ('Staff & Freelancers',       6),
  ('Government & Permits',      7),
  ('Miscellaneous',             8)
ON CONFLICT (name) DO NOTHING;

-- ── 2. Event budgets ──────────────────────────────────────────────────────────
-- One row per event. Currency is the event's base currency.
-- exchange_rate_to_usd is only meaningful when currency = 'INR'.
CREATE TABLE IF NOT EXISTS event_budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  currency              TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  approved_budget       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  exchange_rate_to_usd  NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- INR/USD rate locked at budget creation
  notes                 TEXT,
  set_by                UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Event deals (revenue) ─────────────────────────────────────────────────
-- Each deal is logged in the currency it was signed in.
-- converted_amount is in the event's base currency (calculated at entry).
CREATE TABLE IF NOT EXISTS event_deals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logged_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  deal_type         TEXT NOT NULL DEFAULT 'sponsorship'
                      CHECK (deal_type IN ('sponsorship', 'exhibition', 'delegate_package', 'media_partner', 'other')),
  company_name      TEXT NOT NULL,
  contact_name      TEXT,
  description       TEXT,
  -- Raw amount in deal currency
  amount            NUMERIC(14, 2) NOT NULL,
  deal_currency     TEXT NOT NULL DEFAULT 'USD',  -- free text — AED, EUR, INR, GBP, etc.
  exchange_rate     NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- to event base currency at time of entry
  -- Converted to event base currency
  converted_amount  NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(amount * exchange_rate, 2)) STORED,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  deal_date         DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Event expenses ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logged_by        UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  category_id      UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  amount           NUMERIC(14, 2) NOT NULL,
  expense_currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate    NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- to event base currency at time of entry
  converted_amount NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(amount * exchange_rate, 2)) STORED,
  expense_date     DATE,
  receipt_ref      TEXT,  -- reference number or receipt ID
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Event delegates ───────────────────────────────────────────────────────
-- Invited delegates — no monetary value, tracked for strategic relevance.
CREATE TABLE IF NOT EXISTS event_delegates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  company         TEXT,
  job_title       TEXT,
  industry        TEXT,
  seniority_tier  TEXT NOT NULL DEFAULT 'other'
                    CHECK (seniority_tier IN ('c_suite', 'director', 'senior_manager', 'manager', 'other')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'declined', 'attended')),
  invite_date     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Budget allocations per category (dynamic planner) ─────────────────────
-- Allows the event's total budget to be distributed across expense categories.
-- Planned amounts can be updated any time — actuals come from event_expenses.
CREATE TABLE IF NOT EXISTS event_budget_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  planned_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, category_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS event_budget_alloc_idx       ON event_budget_allocations(event_id);
CREATE INDEX IF NOT EXISTS event_deals_event_id_idx     ON event_deals(event_id);
CREATE INDEX IF NOT EXISTS event_deals_status_idx       ON event_deals(event_id, status);
CREATE INDEX IF NOT EXISTS event_expenses_event_id_idx  ON event_expenses(event_id);
CREATE INDEX IF NOT EXISTS event_delegates_event_id_idx ON event_delegates(event_id);
CREATE INDEX IF NOT EXISTS event_delegates_status_idx   ON event_delegates(event_id, status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE expense_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budgets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_deals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_delegates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budget_allocations ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — all writes go through API using supabaseAdmin.
-- Public read for categories (needed by staff entry forms).
CREATE POLICY "public read expense_categories"
  ON expense_categories FOR SELECT USING (true);
-- ─────────────────────────────────────────────────────────────────────────────
-- FINANCE OVERHEAD ALLOCATION
-- Finance operates as a shared backend. Their monthly cost pool is set once,
-- and each event's share is calculated from actual hours Finance staff log.
--
-- Allocation formula per event:
--   (hours logged on this event / total Finance hours across all events
--    in the same monthly period) × monthly_cost_pool
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Finance cost pool — one row per month ──────────────────────────────────
-- Admin sets the total Finance operational cost each month.
-- All salaries, tools, subscriptions — everything Finance costs the company.
CREATE TABLE IF NOT EXISTS finance_cost_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE NOT NULL UNIQUE,  -- stored as first day of month e.g. 2026-05-01
  monthly_cost   NUMERIC(14, 2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  notes          TEXT,
  set_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Finance work logs — hours logged per event per Finance staff member ────
CREATE TABLE IF NOT EXISTS finance_work_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  hours        NUMERIC(5, 2) NOT NULL CHECK (hours > 0),
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_work_logs_event_idx   ON finance_work_logs(event_id);
CREATE INDEX IF NOT EXISTS finance_work_logs_date_idx    ON finance_work_logs(log_date);
CREATE INDEX IF NOT EXISTS finance_work_logs_staff_idx   ON finance_work_logs(staff_id);
CREATE INDEX IF NOT EXISTS finance_cost_config_month_idx ON finance_cost_config(period_month);

ALTER TABLE finance_cost_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_work_logs   ENABLE ROW LEVEL SECURITY;

-- Public read for cost config (needed by P&L calculations)
CREATE POLICY "public read finance_cost_config"
  ON finance_cost_config FOR SELECT USING (true);

CREATE POLICY "public read finance_work_logs"
  ON finance_work_logs FOR SELECT USING (true);
-- ─────────────────────────────────────────────────────────────────────────────
-- HR OVERHEAD ALLOCATION
-- HR operates as a shared function. Monthly cost pool set by admin.
-- HR staff log timesheets — tagged to an event or left general (company overhead).
--
-- Event allocation per month:
--   (hr_hours_on_event / total_hr_hours_that_month) × monthly_cost_pool
--
-- Untagged hours → company overhead (not charged to any event).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. HR monthly cost pool ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_cost_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE NOT NULL UNIQUE,   -- first day of month e.g. 2026-05-01
  monthly_cost   NUMERIC(14, 2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  notes          TEXT,
  set_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. HR timesheets ──────────────────────────────────────────────────────────
-- event_id is nullable — null means company overhead (recruitment, general HR ops)
CREATE TABLE IF NOT EXISTS hr_work_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES events(id) ON DELETE SET NULL,  -- nullable
  staff_id     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  hours        NUMERIC(5, 2) NOT NULL CHECK (hours > 0),
  description  TEXT NOT NULL,
  work_type    TEXT NOT NULL DEFAULT 'event_support'
                 CHECK (work_type IN ('event_support', 'recruitment', 'onboarding', 'training', 'admin', 'other')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_work_logs_event_idx   ON hr_work_logs(event_id);
CREATE INDEX IF NOT EXISTS hr_work_logs_date_idx    ON hr_work_logs(log_date);
CREATE INDEX IF NOT EXISTS hr_work_logs_staff_idx   ON hr_work_logs(staff_id);
CREATE INDEX IF NOT EXISTS hr_cost_config_month_idx ON hr_cost_config(period_month);

ALTER TABLE hr_cost_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_work_logs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read hr_cost_config" ON hr_cost_config FOR SELECT USING (true);
CREATE POLICY "public read hr_work_logs"   ON hr_work_logs   FOR SELECT USING (true);
-- TAI Academy v2 Migration
-- Run in Supabase SQL Editor → Database → SQL Editor → New query

-- question_bank: full pool of 10 questions per course (5 served randomly per attempt)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS question_bank JSONB DEFAULT '[]';

-- questions_served: which 5 questions this specific attempt received (for admin audit)
ALTER TABLE course_attempts ADD COLUMN IF NOT EXISTS questions_served JSONB DEFAULT '[]';

-- task_submission: staff paste/type their actual AI output as evidence
ALTER TABLE course_attempts ADD COLUMN IF NOT EXISTS task_submission TEXT;

-- time_spent_seconds: total seconds from course open to submission (flags suspiciously fast completions)
ALTER TABLE course_attempts ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER DEFAULT 0;
-- ─── DOCUMENTS ───────────────────────────────────────────────────────────────
-- Stores extracted text from uploaded PDFs. The original file is never saved.
CREATE TABLE IF NOT EXISTS documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('policy','event_brief','staff_doc','onboarding','other')),
  extracted_text TEXT NOT NULL,
  word_count     INTEGER DEFAULT 0,
  visibility     TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all','event_only')),
  event_id       UUID REFERENCES events(id) ON DELETE SET NULL,
  uploaded_by    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  is_active      BOOLEAN DEFAULT TRUE
);

-- ─── EVENTS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('conference','summit','forum','awards','workshop','other')),
  status         TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','completed','cancelled')),
  event_date     DATE,
  venue          TEXT,
  city           TEXT,
  client_name    TEXT,
  description    TEXT,
  created_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EVENT STAFF ASSIGNMENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id   UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  role       TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, staff_id)
);

-- ─── FIX: documents table references events, so events must exist first ───────
-- Run this order: events → documents (if FK needed) or keep event_id nullable

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_type       ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_event_id   ON documents(event_id);
CREATE INDEX IF NOT EXISTS idx_documents_is_active  ON documents(is_active);
CREATE INDEX IF NOT EXISTS idx_events_status        ON events(status);
CREATE INDEX IF NOT EXISTS idx_event_staff_event_id ON event_staff(event_id);
CREATE INDEX IF NOT EXISTS idx_event_staff_staff_id ON event_staff(staff_id);
-- ─── TRESCON CONTENT ENGINE ───────────────────────────────────────────────────
-- Run this in your Supabase SQL editor after documents_events.sql

-- ─── CONTENT CAMPAIGNS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID REFERENCES events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  objective      TEXT DEFAULT '',
  phase          TEXT NOT NULL DEFAULT 'pre_event'
                   CHECK (phase IN ('pre_event', 'live_week', 'post_event', 'always_on')),
  status         TEXT NOT NULL DEFAULT 'planning'
                   CHECK (status IN ('planning', 'active', 'paused', 'completed')),
  platforms      TEXT[] DEFAULT '{}',
  posts_per_week JSONB DEFAULT '{}',        -- { "LinkedIn": 3, "Instagram": 5, ... }
  weeks          JSONB DEFAULT '[]',        -- narrative week plan
  start_date     TEXT,                      -- YYYY-MM-DD
  duration_weeks INTEGER DEFAULT 4,
  brand_notes    TEXT DEFAULT '',           -- team's manual additions on top of brief
  created_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONTENT POSTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES content_campaigns(id) ON DELETE CASCADE,
  week_number    INTEGER NOT NULL,
  narrative_role TEXT NOT NULL DEFAULT 'Awareness',
  platform       TEXT NOT NULL
                   CHECK (platform IN ('LinkedIn','Instagram','Facebook','Twitter','YouTube')),
  scheduled_date TEXT NOT NULL,             -- YYYY-MM-DD
  scheduled_time TEXT NOT NULL DEFAULT '09:00',
  status         TEXT NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned','generated','approved','posted')),
  text           TEXT DEFAULT '',
  image_url      TEXT DEFAULT '',
  image_seed     INTEGER,
  published_at   TIMESTAMPTZ,
  publish_error  TEXT,
  revision_note  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── POST COMMENTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  staff_id   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONNECTED SOCIAL ACCOUNTS (per event) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS connected_social_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES events(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,              -- lowercase: instagram, linkedin, facebook, twitter, youtube
  access_token TEXT NOT NULL,
  page_id      TEXT,                       -- IG business account ID / FB page ID / LinkedIn URN
  account_name TEXT,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, platform)
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_campaigns_event_id    ON content_campaigns(event_id);
CREATE INDEX IF NOT EXISTS idx_content_campaigns_status      ON content_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_content_posts_campaign_id     ON content_posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_status          ON content_posts(status);
CREATE INDEX IF NOT EXISTS idx_content_posts_scheduled_date  ON content_posts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id         ON content_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_event_id      ON connected_social_accounts(event_id);
-- Run this in Supabase SQL Editor

create table if not exists intelligence_reports (
  id               uuid        primary key default gen_random_uuid(),
  generated_at     timestamptz not null default now(),
  total_submissions int         not null default 0,
  trigger_type     text        not null default 'manual' check (trigger_type in ('manual', 'cron')),
  report           jsonb       not null
);

-- Most recent first
create index if not exists intelligence_reports_generated_at_idx
  on intelligence_reports (generated_at desc);

-- Service role only — no public reads
alter table intelligence_reports enable row level security;
