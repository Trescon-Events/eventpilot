-- Event Pilot Training Centre — Database Schema
-- Run this entire block in your Supabase SQL editor (Database → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS courses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  subtitle         TEXT,
  tool_name        TEXT,
  tier_level       TEXT NOT NULL CHECK (tier_level IN ('foundation', 'adoption', 'advanced')),
  dept_tags        TEXT[] DEFAULT '{}',     -- empty = relevant to all depts
  is_mandatory     BOOLEAN DEFAULT true,
  source           TEXT DEFAULT 'manual',   -- 'manual' | 'gemini'
  overview         TEXT,                    -- why this matters for staff
  read_content     TEXT,                    -- the reading section
  task_steps       JSONB DEFAULT '[]',      -- [{step, instruction, tip}]
  questions        JSONB DEFAULT '[]',      -- [{question, options[], correct_index, explanation}]
  estimated_minutes INTEGER DEFAULT 15,
  status           TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  published_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  course_id     UUID REFERENCES courses(id) ON DELETE CASCADE,
  test_score    INTEGER CHECK (test_score >= 0 AND test_score <= 100),
  passed        BOOLEAN NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  completed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  course_id    UUID REFERENCES courses(id) ON DELETE CASCADE,
  answers      JSONB DEFAULT '{}',
  score        INTEGER,
  passed       BOOLEAN,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_public_read"   ON courses            FOR SELECT USING (status = 'published');
CREATE POLICY "courses_admin_write"   ON courses            FOR ALL    USING (true);
CREATE POLICY "completions_all"       ON course_completions FOR ALL    USING (true);
CREATE POLICY "attempts_all"          ON course_attempts    FOR ALL    USING (true);
