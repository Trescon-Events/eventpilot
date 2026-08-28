-- Task Manager Microsoft Teams Integration Migration
ALTER TABLE IF EXISTS task_manager_tasks ADD COLUMN IF NOT EXISTS last_overdue_notified_at TIMESTAMPTZ NULL;
ALTER TABLE IF EXISTS task_manager_tasks ADD COLUMN IF NOT EXISTS overdue_reminder_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS staff_members ADD COLUMN IF NOT EXISTS aad_object_id UUID NULL;
ALTER TABLE IF EXISTS staff_members ADD COLUMN IF NOT EXISTS office_timezone VARCHAR(50) DEFAULT 'Asia/Dubai';
ALTER TABLE IF EXISTS staff_members ADD COLUMN IF NOT EXISTS working_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5];
