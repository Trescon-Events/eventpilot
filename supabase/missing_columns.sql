-- Missing columns migration — run in Supabase Dashboard → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards)

-- 1. documents.word_count — used by Knowledge Base document processing routes
ALTER TABLE documents ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;

-- 2. course_attempts.authenticity_flag — used by course completion audit trail
ALTER TABLE course_attempts ADD COLUMN IF NOT EXISTS authenticity_flag BOOLEAN DEFAULT false;

-- Verify both columns exist
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE
  (table_name = 'documents'      AND column_name = 'word_count')
  OR
  (table_name = 'course_attempts' AND column_name = 'authenticity_flag')
ORDER BY table_name, column_name;
