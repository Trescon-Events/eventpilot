-- Migration: add access_roles to staff_members, project_role_type + assignment_type to event_staff
-- Run once in Supabase SQL editor

-- 1. Access roles array on staff (synced from HRMS user_roles table)
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS access_roles TEXT[] NOT NULL DEFAULT ARRAY['standard']::TEXT[];

-- 2. Project role type on event_staff (synced from HRMS project_roles table)
ALTER TABLE event_staff
  ADD COLUMN IF NOT EXISTS project_role_type TEXT,
  ADD COLUMN IF NOT EXISTS assignment_type   TEXT;  -- 'full_time' | 'shared'

-- 3. Backfill: staff with office_head/super_admin job_level get admin role
UPDATE staff_members
SET access_roles = ARRAY['admin']::TEXT[]
WHERE job_level IN ('office_head', 'super_admin')
  AND access_roles = ARRAY['standard']::TEXT[];

-- 4. Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_staff_members_access_roles ON staff_members USING GIN (access_roles);
