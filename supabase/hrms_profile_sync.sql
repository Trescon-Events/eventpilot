-- ═══════════════════════════════════════════════════════════════════════════
-- HRMS FULL PROFILE SYNC — Run ONCE in Supabase SQL editor
-- Adds all missing HRMS fields to staff_members + leave balance sync key
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Extended profile fields on staff_members ───────────────────────────
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS phone                  TEXT,
  ADD COLUMN IF NOT EXISTS address                TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS work_mode              TEXT,          -- hybrid | remote | office
  ADD COLUMN IF NOT EXISTS company                TEXT,          -- Trescon (India) | Trescon Global etc.
  ADD COLUMN IF NOT EXISTS business_unit          TEXT,
  ADD COLUMN IF NOT EXISTS employee_code          TEXT,
  ADD COLUMN IF NOT EXISTS skills                 JSONB,
  ADD COLUMN IF NOT EXISTS is_management_overhead BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gender                 TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth          DATE,
  ADD COLUMN IF NOT EXISTS salutation             TEXT,
  ADD COLUMN IF NOT EXISTS blood_group            TEXT,
  ADD COLUMN IF NOT EXISTS timezone_override      TEXT,
  ADD COLUMN IF NOT EXISTS timesheet_exempted     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attendance_exempted    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS staff_members_employee_code_idx ON staff_members(employee_code);
CREATE INDEX IF NOT EXISTS staff_members_company_idx       ON staff_members(company);

-- ── 2. HRMS sync key on leave balances (for idempotent upsert) ───────────
ALTER TABLE staff_leave_balances
  ADD COLUMN IF NOT EXISTS hrms_balance_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS staff_leave_balances_hrms_idx ON staff_leave_balances(hrms_balance_id);
