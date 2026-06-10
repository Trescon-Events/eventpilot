-- ═══════════════════════════════════════════════════════════════════════════
-- EVENTPILOT — CORE SCHEMA
-- Base tables that everything else depends on.
-- Run this FIRST before any other SQL file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Offices ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offices (
  id          TEXT PRIMARY KEY,  -- e.g. 'dubai', 'bangalore', 'mangalore', 'manipal'
  name        TEXT NOT NULL,
  city        TEXT,
  country     TEXT,
  timezone    TEXT DEFAULT 'Asia/Dubai',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO offices (id, name, city, country, timezone) VALUES
  ('dubai',     'Dubai',     'Dubai',     'UAE',   'Asia/Dubai'),
  ('bangalore', 'Bangalore', 'Bangalore', 'India', 'Asia/Kolkata'),
  ('mangalore', 'Mangalore', 'Mangalore', 'India', 'Asia/Kolkata'),
  ('manipal',   'Manipal',   'Manipal',   'India', 'Asia/Kolkata')
ON CONFLICT (id) DO NOTHING;

-- ── Staff members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_members (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  email                     TEXT NOT NULL UNIQUE,
  office_id                 TEXT REFERENCES offices(id) ON DELETE SET NULL,
  department                TEXT,
  role                      TEXT,
  job_level                 TEXT NOT NULL DEFAULT 'staff'
                              CHECK (job_level IN ('staff','team_lead','dept_head','office_head','super_admin')),
  manager_id                UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  team                      TEXT,

  -- Auth
  password_hash             TEXT,
  access_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password      BOOLEAN NOT NULL DEFAULT FALSE,
  reset_token               TEXT,
  reset_token_expires       TIMESTAMPTZ,
  toolkit_access            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Profile
  profile_complete          BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at                 TIMESTAMPTZ DEFAULT NOW(),
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  phone                     TEXT,
  address                   TEXT,
  emergency_contact_name    TEXT,
  emergency_contact_phone   TEXT,
  work_mode                 TEXT,
  company                   TEXT,
  business_unit             TEXT,
  employee_code             TEXT,
  skills                    TEXT[],
  gender                    TEXT,
  date_of_birth             DATE,
  salutation                TEXT,
  blood_group               TEXT,
  is_management_overhead    BOOLEAN DEFAULT FALSE,
  data_source               TEXT,
  last_synced_at            TIMESTAMPTZ,

  -- AI Readiness (AIRS)
  ai_readiness_score        NUMERIC(5,2),
  tairs_completed           BOOLEAN NOT NULL DEFAULT FALSE,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_members_email_idx      ON staff_members(email);
CREATE INDEX IF NOT EXISTS staff_members_office_idx     ON staff_members(office_id);
CREATE INDEX IF NOT EXISTS staff_members_manager_idx    ON staff_members(manager_id);
CREATE INDEX IF NOT EXISTS staff_members_job_level_idx  ON staff_members(job_level);

-- ── Events ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  type                TEXT,
  status              TEXT NOT NULL DEFAULT 'planning'
                        CHECK (status IN ('planning','active','completed','cancelled')),
  event_date          DATE,
  end_date            DATE,
  venue               TEXT,
  city                TEXT,
  client_name         TEXT,
  description         TEXT,
  expected_attendance INTEGER,
  hrms_project_id     TEXT,
  created_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_status_idx ON events(status);
CREATE INDEX IF NOT EXISTS events_date_idx   ON events(event_date);

-- ── Event staff assignments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id   UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  role       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, staff_id)
);

-- ── Courses ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  subtitle         TEXT,
  overview         TEXT,
  track            TEXT NOT NULL DEFAULT 'foundation'
                     CHECK (track IN ('foundation','adoption','advanced')),
  level            TEXT NOT NULL DEFAULT 'beginner'
                     CHECK (level IN ('beginner','intermediate','advanced')),
  category         TEXT,
  estimated_time   TEXT,
  tasks            JSONB DEFAULT '[]',
  quiz_questions   JSONB DEFAULT '[]',
  pass_score       INTEGER DEFAULT 60,
  is_published     BOOLEAN NOT NULL DEFAULT FALSE,
  is_mandatory     BOOLEAN NOT NULL DEFAULT FALSE,
  suggested_by_id  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  suggested_by_name TEXT,
  suggested_by_role TEXT,
  created_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Course completions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  score         INTEGER,
  passed        BOOLEAN,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, course_id)
);

-- ── Course attempts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  answers      JSONB DEFAULT '{}',
  score        INTEGER,
  passed       BOOLEAN,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  course_id  UUID REFERENCES courses(id) ON DELETE SET NULL,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Staff task profiles (AIRS questionnaire) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_task_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE UNIQUE,
  responses    JSONB DEFAULT '{}',
  submitted_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Platform docs (Pilot AI knowledge base) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_docs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  category    TEXT,
  pilot_use   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Documents (event documents) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
  staff_id    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  type        TEXT,
  file_url    TEXT,
  status      TEXT DEFAULT 'pending',
  pilot_use   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Login attempts (brute force protection) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  ip           TEXT,
  success      BOOLEAN NOT NULL,
  reason       TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts(email);

-- ── Email log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  email_type  TEXT NOT NULL,
  success     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Chat usage (Pilot AI rate limiting) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  used_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  count      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(used_at)
);

-- ── Event checklist ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_checklist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'pending',
  assigned_to UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
