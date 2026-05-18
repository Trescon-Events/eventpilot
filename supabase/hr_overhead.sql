-- ─────────────────────────────────────────────────────────────────────────────
-- HR OVERHEAD ALLOCATION
-- HR operates as a shared function. Monthly cost pool set by admin.
-- HR staff log timesheets — tagged to an event or left general (company overhead).
--
-- Event allocation per month:
--   (hr_hours_on_event / total_hr_hours_that_month) × monthly_cost_pool
--
-- Untagged hours → company overhead (not charged to any event).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. HR monthly cost pool ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_cost_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE NOT NULL UNIQUE,   -- first day of month e.g. 2026-05-01
  monthly_cost   NUMERIC(14, 2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  notes          TEXT,
  set_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. HR timesheets ──────────────────────────────────────────────────────────
-- event_id is nullable — null means company overhead (recruitment, general HR ops)
CREATE TABLE IF NOT EXISTS hr_work_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES events(id) ON DELETE SET NULL,  -- nullable
  staff_id     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  hours        NUMERIC(5, 2) NOT NULL CHECK (hours > 0),
  description  TEXT NOT NULL,
  work_type    TEXT NOT NULL DEFAULT 'event_support'
                 CHECK (work_type IN ('event_support', 'recruitment', 'onboarding', 'training', 'admin', 'other')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_work_logs_event_idx   ON hr_work_logs(event_id);
CREATE INDEX IF NOT EXISTS hr_work_logs_date_idx    ON hr_work_logs(log_date);
CREATE INDEX IF NOT EXISTS hr_work_logs_staff_idx   ON hr_work_logs(staff_id);
CREATE INDEX IF NOT EXISTS hr_cost_config_month_idx ON hr_cost_config(period_month);

ALTER TABLE hr_cost_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_work_logs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read hr_cost_config" ON hr_cost_config FOR SELECT USING (true);
CREATE POLICY "public read hr_work_logs"   ON hr_work_logs   FOR SELECT USING (true);
