-- ═══════════════════════════════════════════════════════════════════════════
-- RECRUITMENT PIPELINE — Run ONCE in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Job Requisitions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_requisitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  department      TEXT,
  location        TEXT,                          -- office_id or city
  employment_type TEXT DEFAULT 'full_time',      -- full_time | part_time | contract | intern
  headcount       INT  NOT NULL DEFAULT 1,
  description     TEXT,
  requirements    TEXT,
  salary_min      NUMERIC,
  salary_max      NUMERIC,
  currency        TEXT DEFAULT 'AED',
  status          TEXT NOT NULL DEFAULT 'open',  -- open | paused | closed | filled
  hiring_manager_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  opened_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_at       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_req_status_idx   ON job_requisitions(status);
CREATE INDEX IF NOT EXISTS job_req_dept_idx     ON job_requisitions(department);

-- ── 2. Candidates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  linkedin_url    TEXT,
  resume_url      TEXT,                          -- Supabase Storage path
  resume_text     TEXT,                          -- extracted text for AI
  source          TEXT DEFAULT 'direct',         -- direct | linkedin | referral | agency | website
  referred_by_id  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS candidates_email_idx ON candidates(lower(email));
CREATE INDEX IF NOT EXISTS candidates_name_idx ON candidates(full_name);

-- ── 3. Applications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  requisition_id  UUID NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL DEFAULT 'applied',
                  -- applied | ai_screening | shortlisted | interview_r1 | interview_r2
                  -- | interview_final | offer | hired | rejected | withdrawn
  ai_score        INT,                           -- 0–100 fit score
  ai_summary      TEXT,                          -- Gemini analysis
  ai_strengths    TEXT[],
  ai_gaps         TEXT[],
  ai_recommendation TEXT,                        -- shortlist | hold | reject
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  UNIQUE(candidate_id, requisition_id)
);

CREATE INDEX IF NOT EXISTS app_requisition_idx ON candidate_applications(requisition_id);
CREATE INDEX IF NOT EXISTS app_stage_idx       ON candidate_applications(stage);
CREATE INDEX IF NOT EXISTS app_candidate_idx   ON candidate_applications(candidate_id);

-- ── 4. Interview Rounds ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  round_number    INT  NOT NULL DEFAULT 1,
  round_type      TEXT NOT NULL DEFAULT 'screening',
                  -- screening | technical | cultural | managerial | final | hr
  interviewer_id  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'scheduled',
                  -- scheduled | completed | cancelled | no_show
  -- Structured feedback
  rating_communication  INT CHECK (rating_communication BETWEEN 1 AND 5),
  rating_technical      INT CHECK (rating_technical      BETWEEN 1 AND 5),
  rating_culture_fit    INT CHECK (rating_culture_fit    BETWEEN 1 AND 5),
  rating_problem_solving INT CHECK (rating_problem_solving BETWEEN 1 AND 5),
  overall_rating        INT CHECK (overall_rating        BETWEEN 1 AND 5),
  strengths       TEXT,
  concerns        TEXT,
  recommendation  TEXT,                          -- advance | reject | hold
  feedback_notes  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interview_app_idx  ON interview_rounds(application_id);
CREATE INDEX IF NOT EXISTS interview_date_idx ON interview_rounds(scheduled_at);

-- ── 5. Candidate Emails ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  template        TEXT NOT NULL,
                  -- shortlist_invite | rejection | interview_scheduled | offer | hired
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by_id      UUID REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS email_app_idx ON candidate_emails(application_id);
