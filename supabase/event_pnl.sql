-- ─────────────────────────────────────────────────────────────────────────────
-- EVENT P&L SCHEMA
-- Covers: budget, deals (revenue), expenses, delegates (strategic value)
-- Currency: each event is USD or INR; deal amounts stored raw + converted
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expense categories (admin-configurable) ────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default categories
INSERT INTO expense_categories (name, sort_order) VALUES
  ('Venue & Logistics',         1),
  ('AV & Technology',           2),
  ('Catering & Hospitality',    3),
  ('Marketing & Creative',      4),
  ('Travel & Accommodation',    5),
  ('Staff & Freelancers',       6),
  ('Government & Permits',      7),
  ('Miscellaneous',             8)
ON CONFLICT (name) DO NOTHING;

-- ── 2. Event budgets ──────────────────────────────────────────────────────────
-- One row per event. Currency is the event's base currency.
-- exchange_rate_to_usd is only meaningful when currency = 'INR'.
CREATE TABLE IF NOT EXISTS event_budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  currency              TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  approved_budget       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  exchange_rate_to_usd  NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- INR/USD rate locked at budget creation
  notes                 TEXT,
  set_by                UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Event deals (revenue) ─────────────────────────────────────────────────
-- Each deal is logged in the currency it was signed in.
-- converted_amount is in the event's base currency (calculated at entry).
CREATE TABLE IF NOT EXISTS event_deals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logged_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  deal_type         TEXT NOT NULL DEFAULT 'sponsorship'
                      CHECK (deal_type IN ('sponsorship', 'exhibition', 'delegate_package', 'media_partner', 'other')),
  company_name      TEXT NOT NULL,
  contact_name      TEXT,
  description       TEXT,
  -- Raw amount in deal currency
  amount            NUMERIC(14, 2) NOT NULL,
  deal_currency     TEXT NOT NULL DEFAULT 'USD',  -- free text — AED, EUR, INR, GBP, etc.
  exchange_rate     NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- to event base currency at time of entry
  -- Converted to event base currency
  converted_amount  NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(amount * exchange_rate, 2)) STORED,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  deal_date         DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Event expenses ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logged_by        UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  category_id      UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  amount           NUMERIC(14, 2) NOT NULL,
  expense_currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate    NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- to event base currency at time of entry
  converted_amount NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(amount * exchange_rate, 2)) STORED,
  expense_date     DATE,
  receipt_ref      TEXT,  -- reference number or receipt ID
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Event delegates ───────────────────────────────────────────────────────
-- Invited delegates — no monetary value, tracked for strategic relevance.
CREATE TABLE IF NOT EXISTS event_delegates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  company         TEXT,
  job_title       TEXT,
  industry        TEXT,
  seniority_tier  TEXT NOT NULL DEFAULT 'other'
                    CHECK (seniority_tier IN ('c_suite', 'director', 'senior_manager', 'manager', 'other')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'declined', 'attended')),
  invite_date     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Budget allocations per category (dynamic planner) ─────────────────────
-- Allows the event's total budget to be distributed across expense categories.
-- Planned amounts can be updated any time — actuals come from event_expenses.
CREATE TABLE IF NOT EXISTS event_budget_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  planned_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, category_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS event_budget_alloc_idx       ON event_budget_allocations(event_id);
CREATE INDEX IF NOT EXISTS event_deals_event_id_idx     ON event_deals(event_id);
CREATE INDEX IF NOT EXISTS event_deals_status_idx       ON event_deals(event_id, status);
CREATE INDEX IF NOT EXISTS event_expenses_event_id_idx  ON event_expenses(event_id);
CREATE INDEX IF NOT EXISTS event_delegates_event_id_idx ON event_delegates(event_id);
CREATE INDEX IF NOT EXISTS event_delegates_status_idx   ON event_delegates(event_id, status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE expense_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budgets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_deals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_delegates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budget_allocations ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — all writes go through API using supabaseAdmin.
-- Public read for categories (needed by staff entry forms).
CREATE POLICY "public read expense_categories"
  ON expense_categories FOR SELECT USING (true);
