-- ── Expense Claims ──────────────────────────────────────────────────────────
-- Staff submit expense receipts, managers approve, feeds into P&L.

CREATE TABLE IF NOT EXISTS expense_claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  category        TEXT NOT NULL
                    CHECK (category IN (
                      'travel','accommodation','meals','transport','office_supplies',
                      'software','marketing','client_entertainment','training','other'
                    )),
  description     TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'USD',
  receipt_url     TEXT,
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','paid')),
  approved_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expense_claims_staff_idx  ON expense_claims(staff_id);
CREATE INDEX IF NOT EXISTS expense_claims_event_idx  ON expense_claims(event_id);
CREATE INDEX IF NOT EXISTS expense_claims_status_idx ON expense_claims(status);
CREATE INDEX IF NOT EXISTS expense_claims_date_idx   ON expense_claims(expense_date);

ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

-- ── Vendor Payments ─────────────────────────────────────────────────────────
-- Track vendor invoices per event.

CREATE TABLE IF NOT EXISTS vendor_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  vendor_name     TEXT NOT NULL,
  description     TEXT NOT NULL,
  invoice_number  TEXT,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'USD',
  category        TEXT NOT NULL DEFAULT 'other'
                    CHECK (category IN (
                      'venue','catering','av_production','printing','marketing',
                      'travel_logistics','technology','staffing','government_fees','other'
                    )),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','paid','overdue','cancelled')),
  due_date        DATE,
  paid_date       DATE,
  approved_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  payment_ref     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendor_payments_event_idx  ON vendor_payments(event_id);
CREATE INDEX IF NOT EXISTS vendor_payments_status_idx ON vendor_payments(status);
CREATE INDEX IF NOT EXISTS vendor_payments_due_idx    ON vendor_payments(due_date);

ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
