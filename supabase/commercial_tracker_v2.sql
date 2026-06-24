-- ═══════════════════════════════════════════════════════════════════
-- COMMERCIAL TRACKER V2 — Revenue Target Driven P&L
-- Event Pilot · Trescon Global
-- Created: 2026-06-25
--
-- This adds revenue_target to events and restructures the P&L
-- around: Revenue Target vs Actual Revenue vs Total Costs
-- ═══════════════════════════════════════════════════════════════════

-- ── Add revenue target to events ────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS revenue_target NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_target_currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS cost_budget NUMERIC(14,2) DEFAULT 0;

-- ── Weekly P&L snapshots for trend tracking ─────────────────────

CREATE TABLE IF NOT EXISTS commercial_weekly_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  revenue_target  NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_actual  NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_pipeline NUMERIC(14,2) NOT NULL DEFAULT 0,
  direct_costs    NUMERIC(14,2) NOT NULL DEFAULT 0,
  staff_costs     NUMERIC(14,2) NOT NULL DEFAULT 0,
  overhead_costs  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_costs     NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_position    NUMERIC(14,2) NOT NULL DEFAULT 0,
  margin_pct      NUMERIC(5,2) DEFAULT 0,
  gap             NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, week_start)
);

CREATE INDEX IF NOT EXISTS weekly_snapshots_event_idx ON commercial_weekly_snapshots(event_id);
CREATE INDEX IF NOT EXISTS weekly_snapshots_week_idx ON commercial_weekly_snapshots(week_start);

-- ═══════════════════════════════════════════════════════════════════
-- END
-- ═══════════════════════════════════════════════════════════════════
