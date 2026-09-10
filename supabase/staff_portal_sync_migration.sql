-- Staff Portal sync v2 (2026-09-10) — supports the new secret-key sync API
-- (replaces the old admin-login sync), umbrella/child event linking, and the
-- extended staff/timesheet/leave-balance fields Lovable added in response to
-- the parity gap list. Run once by hand via direct psql (session pooler),
-- same as every other flat migration in this directory.

-- ── Umbrella / child event linking ──────────────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS staff_portal_umbrella_id UUID;
-- Plain (non-partial) UNIQUE constraint, matching the existing
-- hrms_project_id column's pattern — a partial index can't serve as an
-- ON CONFLICT arbiter for a plain `ON CONFLICT (col)` upsert. NULLs stay
-- mutually non-conflicting under a plain UNIQUE constraint regardless.
ALTER TABLE events ADD CONSTRAINT events_staff_portal_umbrella_id_key UNIQUE (staff_portal_umbrella_id);
CREATE INDEX IF NOT EXISTS idx_events_parent_event_id ON events(parent_event_id) WHERE parent_event_id IS NOT NULL;

-- ── Extended events/projects fields (Staff Portal API extension) ───────
ALTER TABLE events ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS staff_portal_series_id UUID;

-- ── Extended staff fields ────────────────────────────────────────────────
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS employment_stint INTEGER;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS previous_hire_date DATE;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS rehired_at TIMESTAMPTZ;
-- timesheet_self_entry semantics were never confirmed with Madhu/Durga (see
-- the historical comment in app/lib/hrms/... about the old timesheet_exempted
-- column) — captured raw here, deliberately NOT wired into timesheet_exempted.
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS timesheet_self_entry BOOLEAN;

-- ── Extended leave balance fields ───────────────────────────────────────
ALTER TABLE staff_leave_balances ADD COLUMN IF NOT EXISTS opening_used_days NUMERIC(5,1);
ALTER TABLE staff_leave_balances ADD COLUMN IF NOT EXISTS remaining_days NUMERIC(5,1);
ALTER TABLE staff_leave_balances ADD COLUMN IF NOT EXISTS expires_on DATE;
ALTER TABLE staff_leave_balances ADD COLUMN IF NOT EXISTS sick_paid_used_days NUMERIC(5,1);
ALTER TABLE staff_leave_balances ADD COLUMN IF NOT EXISTS sick_half_used_days NUMERIC(5,1);
ALTER TABLE staff_leave_balances ADD COLUMN IF NOT EXISTS sick_unpaid_used_days NUMERIC(5,1);

-- ── Extended timesheet fields ────────────────────────────────────────────
ALTER TABLE staff_timesheets ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE staff_timesheets ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE staff_timesheets ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE staff_timesheets ADD COLUMN IF NOT EXISTS stint INTEGER;
ALTER TABLE staff_timesheets ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE staff_timesheets ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE staff_timesheets ADD COLUMN IF NOT EXISTS revoke_reason TEXT;
