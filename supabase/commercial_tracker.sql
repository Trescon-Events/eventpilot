-- ═══════════════════════════════════════════════════════════════════
-- COMMERCIAL TRACKER — Database Migration
-- Event Pilot · Trescon Global
-- Created: 2026-06-24
-- ═══════════════════════════════════════════════════════════════════

-- ── 1A. Extend events table with commercial fields ──────────────

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN (
    'concept','research','planning','sales','delivery','completed','closed',
    'active','cancelled'
  ));

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS business_unit TEXT,
  ADD COLUMN IF NOT EXISTS event_director_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_director_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_status TEXT DEFAULT 'green'
    CHECK (commercial_status IN ('green','amber','red'));

CREATE INDEX IF NOT EXISTS events_region_idx ON events(region);
CREATE INDEX IF NOT EXISTS events_bu_idx ON events(business_unit);


-- ── 1B. Commercial Inventory — revenue items ────────────────────

CREATE TABLE IF NOT EXISTS commercial_inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'sponsorship'
    CHECK (category IN (
      'sponsorship','exhibition','delegate_package','media_partner',
      'government','strategic_partner','awards','workshop','addon','other'
    )),
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC(14,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  reserved        INTEGER NOT NULL DEFAULT 0,
  sold            INTEGER NOT NULL DEFAULT 0,
  total_potential  NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  total_sold_value NUMERIC(14,2) GENERATED ALWAYS AS (sold * unit_price) STORED,
  total_pipeline   NUMERIC(14,2) GENERATED ALWAYS AS (reserved * unit_price) STORED,
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commercial_inventory_event_idx ON commercial_inventory(event_id);


-- ── 1C. Link deals to inventory items ───────────────────────────

ALTER TABLE event_deals
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES commercial_inventory(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_deals_inventory_idx ON event_deals(inventory_item_id);


-- ── 1D. Unified overhead cost pools ─────────────────────────────

CREATE TABLE IF NOT EXISTS overhead_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component      TEXT NOT NULL,
  period_month   DATE NOT NULL,
  monthly_cost   NUMERIC(14,2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  notes          TEXT,
  set_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(component, period_month)
);

CREATE INDEX IF NOT EXISTS overhead_config_comp_idx  ON overhead_config(component);
CREATE INDEX IF NOT EXISTS overhead_config_month_idx ON overhead_config(period_month);


-- ── 1E. Per-event overhead allocation rules ─────────────────────

CREATE TABLE IF NOT EXISTS overhead_event_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  component        TEXT NOT NULL,
  allocation_model TEXT NOT NULL DEFAULT 'fixed_pct'
    CHECK (allocation_model IN ('fixed_pct','revenue_pct','headcount_pct','manual')),
  allocation_value NUMERIC(10,4) NOT NULL DEFAULT 0,
  manual_amount    NUMERIC(14,2),
  notes            TEXT,
  set_by           UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, component)
);

CREATE INDEX IF NOT EXISTS overhead_alloc_event_idx ON overhead_event_allocations(event_id);


-- ── 1F. Adjusted budget figures ─────────────────────────────────

CREATE TABLE IF NOT EXISTS commercial_adjusted (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  adjusted_revenue     NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjusted_staff_cost  NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjusted_direct_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjusted_overhead    NUMERIC(14,2) NOT NULL DEFAULT 0,
  category_adjustments JSONB NOT NULL DEFAULT '[]',
  revenue_adjustments  JSONB NOT NULL DEFAULT '[]',
  notes                TEXT,
  adjusted_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  adjusted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 1G. Scenario planning ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS commercial_scenarios (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  scenario_type        TEXT NOT NULL DEFAULT 'expected'
    CHECK (scenario_type IN ('best','expected','worst','custom')),
  revenue_adjustments  JSONB NOT NULL DEFAULT '[]',
  cost_adjustments     JSONB NOT NULL DEFAULT '[]',
  overhead_adjustments JSONB NOT NULL DEFAULT '[]',
  total_revenue        NUMERIC(14,2),
  total_cost           NUMERIC(14,2),
  net_profit           NUMERIC(14,2),
  margin_pct           NUMERIC(5,2),
  notes                TEXT,
  created_by           UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commercial_scenarios_event_idx ON commercial_scenarios(event_id);


-- ═══════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════
