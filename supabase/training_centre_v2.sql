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
