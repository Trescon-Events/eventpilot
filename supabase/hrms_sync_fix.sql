-- ═══════════════════════════════════════════════════════════════════════════
-- HRMS SYNC FIX — Run ONCE in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Add HRMS sync key to event_staff (allocation upsert conflict key) ──
ALTER TABLE event_staff
  ADD COLUMN IF NOT EXISTS hrms_allocation_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS event_staff_hrms_allocation_idx ON event_staff(hrms_allocation_id);

-- ── 2. Add HRMS sync key to staff_timesheets (timesheet upsert conflict key) ──
ALTER TABLE staff_timesheets
  ADD COLUMN IF NOT EXISTS hrms_entry_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS staff_timesheets_hrms_idx ON staff_timesheets(hrms_entry_id);
