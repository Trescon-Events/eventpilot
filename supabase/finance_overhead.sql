-- ─────────────────────────────────────────────────────────────────────────────
-- FINANCE OVERHEAD ALLOCATION
-- Finance operates as a shared backend. Their monthly cost pool is set once,
-- and each event's share is calculated from actual hours Finance staff log.
--
-- Allocation formula per event:
--   (hours logged on this event / total Finance hours across all events
--    in the same monthly period) × monthly_cost_pool
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Finance cost pool — one row per month ──────────────────────────────────
-- Admin sets the total Finance operational cost each month.
-- All salaries, tools, subscriptions — everything Finance costs the company.
CREATE TABLE IF NOT EXISTS finance_cost_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE NOT NULL UNIQUE,  -- stored as first day of month e.g. 2026-05-01
  monthly_cost   NUMERIC(14, 2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  notes          TEXT,
  set_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Finance work logs — hours logged per event per Finance staff member ────
CREATE TABLE IF NOT EXISTS finance_work_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  hours        NUMERIC(5, 2) NOT NULL CHECK (hours > 0),
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_work_logs_event_idx   ON finance_work_logs(event_id);
CREATE INDEX IF NOT EXISTS finance_work_logs_date_idx    ON finance_work_logs(log_date);
CREATE INDEX IF NOT EXISTS finance_work_logs_staff_idx   ON finance_work_logs(staff_id);
CREATE INDEX IF NOT EXISTS finance_cost_config_month_idx ON finance_cost_config(period_month);

ALTER TABLE finance_cost_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_work_logs   ENABLE ROW LEVEL SECURITY;

-- Public read for cost config (needed by P&L calculations)
CREATE POLICY "public read finance_cost_config"
  ON finance_cost_config FOR SELECT USING (true);

CREATE POLICY "public read finance_work_logs"
  ON finance_work_logs FOR SELECT USING (true);
