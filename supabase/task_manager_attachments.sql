-- Task Manager Attachments migration
-- Adds attachment_url and attachment_name to task_manager_tasks
-- Run in Supabase SQL Editor if not already applied

BEGIN;

ALTER TABLE task_manager_tasks
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

COMMIT;
