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
