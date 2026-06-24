-- ═══════════════════════════════════════════════════════════════════
-- COMMERCIAL TRACKER V3 — Full BRD Implementation
-- Event Pilot · Trescon Global
-- Created: 2026-06-25
-- Maps to CEO BRD sections 5-17
-- ═══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════
-- PHASE 1A: Events table — missing role fields (BRD Section 6A)
-- ══════════════════════════════════════

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS bu_head_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operations_lead_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finance_owner_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;


-- ══════════════════════════════════════
-- PHASE 1B: Expand deal types (BRD Section 7)
-- ══════════════════════════════════════

ALTER TABLE event_deals DROP CONSTRAINT IF EXISTS event_deals_deal_type_check;
ALTER TABLE event_deals ADD CONSTRAINT event_deals_deal_type_check
  CHECK (deal_type IN (
    'sponsorship', 'exhibition', 'delegate_package', 'media_partner',
    'ticket_sales', 'government_partnership', 'strategic_partner',
    'awards', 'workshop', 'addon', 'other'
  ));


-- ══════════════════════════════════════
-- PHASE 1C: Expense subcategories + vendor + PO + invoice + payment (BRD Section 9)
-- ══════════════════════════════════════

-- Add parent_id for subcategory hierarchy
ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add vendor, PO, invoice, payment status to expenses
ALTER TABLE event_expenses
  ADD COLUMN IF NOT EXISTS vendor_name TEXT,
  ADD COLUMN IF NOT EXISTS po_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'overdue')),
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS event_expenses_payment_idx ON event_expenses(payment_status);
CREATE INDEX IF NOT EXISTS event_expenses_approval_idx ON event_expenses(approval_status);


-- ══════════════════════════════════════
-- PHASE 1D: Commercial inventory — add subcategory + adjusted fields (BRD Section 7)
-- ══════════════════════════════════════

ALTER TABLE commercial_inventory
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS adjusted_qty INTEGER,
  ADD COLUMN IF NOT EXISTS adjusted_price NUMERIC(14,2);


-- ══════════════════════════════════════
-- PHASE 1E: Staff cost — add cost center (BRD Section 8)
-- ══════════════════════════════════════

ALTER TABLE staff_salary_records
  ADD COLUMN IF NOT EXISTS cost_center TEXT;


-- ══════════════════════════════════════
-- PHASE 1F: Corporate allocations (BRD Section 11)
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS corporate_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  allocation_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (allocation_type IN ('percentage', 'fixed')),
  percentage NUMERIC(5,2) DEFAULT 0,
  fixed_amount NUMERIC(14,2) DEFAULT 0,
  description TEXT,
  set_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id)
);


-- ══════════════════════════════════════
-- PHASE 1G: Budget approval workflow (BRD Section 16)
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS commercial_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL DEFAULT 'budget'
    CHECK (approval_type IN ('budget', 'cost_change', 'expense', 'closure')),
  requested_by UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  request_payload JSONB NOT NULL DEFAULT '{}',
  threshold_amount NUMERIC(14,2),

  -- Approval chain steps
  step_1_role TEXT DEFAULT 'bu_head',
  step_1_approver_id UUID REFERENCES staff_members(id),
  step_1_status TEXT DEFAULT 'pending' CHECK (step_1_status IN ('pending', 'approved', 'rejected', 'skipped')),
  step_1_at TIMESTAMPTZ,
  step_1_note TEXT,

  step_2_role TEXT DEFAULT 'commercial_director',
  step_2_approver_id UUID REFERENCES staff_members(id),
  step_2_status TEXT DEFAULT 'pending' CHECK (step_2_status IN ('pending', 'approved', 'rejected', 'skipped')),
  step_2_at TIMESTAMPTZ,
  step_2_note TEXT,

  step_3_role TEXT DEFAULT 'finance',
  step_3_approver_id UUID REFERENCES staff_members(id),
  step_3_status TEXT DEFAULT 'pending' CHECK (step_3_status IN ('pending', 'approved', 'rejected', 'skipped')),
  step_3_at TIMESTAMPTZ,
  step_3_note TEXT,

  step_4_role TEXT DEFAULT 'ceo',
  step_4_approver_id UUID REFERENCES staff_members(id),
  step_4_status TEXT DEFAULT 'pending' CHECK (step_4_status IN ('pending', 'approved', 'rejected', 'skipped')),
  step_4_at TIMESTAMPTZ,
  step_4_note TEXT,

  current_step INTEGER NOT NULL DEFAULT 1,
  overall_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (overall_status IN ('pending', 'in_progress', 'approved', 'rejected', 'cancelled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commercial_approvals_event_idx ON commercial_approvals(event_id);
CREATE INDEX IF NOT EXISTS commercial_approvals_status_idx ON commercial_approvals(overall_status);


-- ══════════════════════════════════════
-- PHASE 1H: Event closure tracking (BRD Section 14, Stage 9-10)
-- ══════════════════════════════════════

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS closure_status TEXT DEFAULT 'open'
    CHECK (closure_status IN ('open', 'pending_closure', 'closed', 'final_report_generated')),
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_revenue NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS final_cost NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS final_profit NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS final_margin NUMERIC(5,2);


-- ══════════════════════════════════════
-- PHASE 1I: Seed missing expense subcategories (BRD Section 9)
-- ══════════════════════════════════════

-- Get parent IDs and insert subcategories
-- Venue & Logistics subcategories
INSERT INTO expense_categories (name, parent_id, sort_order, description)
SELECT sub.name, p.id, sub.sort_order, sub.description
FROM (VALUES
  ('Ballroom', 11, 'Main event hall rental'),
  ('Meeting Rooms', 12, 'Breakout rooms and meeting spaces'),
  ('Security', 13, 'Venue security and access control'),
  ('Utilities', 14, 'Power, water, internet at venue')
) AS sub(name, sort_order, description)
CROSS JOIN expense_categories p
WHERE p.name = 'Venue & Logistics' AND p.parent_id IS NULL
ON CONFLICT (name) DO NOTHING;

-- AV & Technology subcategories
INSERT INTO expense_categories (name, parent_id, sort_order, description)
SELECT sub.name, p.id, sub.sort_order, sub.description
FROM (VALUES
  ('Stage Design', 21, 'Stage construction and setup'),
  ('AV Equipment', 22, 'Audio visual equipment rental'),
  ('Lighting', 23, 'Event lighting and effects'),
  ('LED Screens', 24, 'LED walls and displays'),
  ('Apps & Platforms', 25, 'Event apps and registration systems'),
  ('Websites', 26, 'Event website development')
) AS sub(name, sort_order, description)
CROSS JOIN expense_categories p
WHERE p.name = 'AV & Technology' AND p.parent_id IS NULL
ON CONFLICT (name) DO NOTHING;

-- Marketing & Creative subcategories
INSERT INTO expense_categories (name, parent_id, sort_order, description)
SELECT sub.name, p.id, sub.sort_order, sub.description
FROM (VALUES
  ('PR & Media', 41, 'Press releases and media outreach'),
  ('Digital Marketing', 42, 'Online ads, social media, SEO'),
  ('Printing', 43, 'Brochures, banners, signage')
) AS sub(name, sort_order, description)
CROSS JOIN expense_categories p
WHERE p.name = 'Marketing & Creative' AND p.parent_id IS NULL
ON CONFLICT (name) DO NOTHING;

-- Travel & Accommodation subcategories
INSERT INTO expense_categories (name, parent_id, sort_order, description)
SELECT sub.name, p.id, sub.sort_order, sub.description
FROM (VALUES
  ('Flights', 51, 'Air travel for staff and speakers'),
  ('Hotels', 52, 'Accommodation bookings'),
  ('Local Transport', 53, 'Taxis, transfers, car rentals')
) AS sub(name, sort_order, description)
CROSS JOIN expense_categories p
WHERE p.name = 'Travel & Accommodation' AND p.parent_id IS NULL
ON CONFLICT (name) DO NOTHING;

-- Add Speaker Management as top-level category
INSERT INTO expense_categories (name, sort_order, description)
VALUES ('Speaker Management', 9, 'Speaker fees, accommodation, and logistics')
ON CONFLICT (name) DO NOTHING;

-- Speaker Management subcategories
INSERT INTO expense_categories (name, parent_id, sort_order, description)
SELECT sub.name, p.id, sub.sort_order, sub.description
FROM (VALUES
  ('Speaker Fees', 91, 'Speaking fees and honorariums'),
  ('Speaker Accommodation', 92, 'Hotels and meals for speakers')
) AS sub(name, sort_order, description)
CROSS JOIN expense_categories p
WHERE p.name = 'Speaker Management' AND p.parent_id IS NULL
ON CONFLICT (name) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════
-- END OF V3 MIGRATION
-- ═══════════════════════════════════════════════════════════════════
