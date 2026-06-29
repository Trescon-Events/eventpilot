-- ============================================================
-- BESPOKE TRACKER — Database Migration
-- Run: 2026-06-28
-- Creates: bespoke_projects, bespoke_tasks, bespoke_delegates
-- ============================================================

-- ── bespoke_projects ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bespoke_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,

  -- Client info
  client_company       TEXT NOT NULL,
  client_contact_name  TEXT,
  client_contact_email TEXT,
  client_contact_phone TEXT,
  contract_value       NUMERIC(12,2) DEFAULT 0,
  contract_signed_date DATE,

  -- Event basics
  title                TEXT NOT NULL,
  format               TEXT NOT NULL DEFAULT 'physical' CHECK (format IN ('virtual','physical','hybrid')),
  event_date           DATE,
  event_time           TIME,
  city                 TEXT,
  venue                TEXT,
  target_delegate_count INT DEFAULT 25,
  target_delegate_profile TEXT,

  -- Phase tracking
  current_phase        INT DEFAULT 1 CHECK (current_phase BETWEEN 1 AND 5),
  phase_status         TEXT DEFAULT 'initiation' CHECK (phase_status IN ('initiation','campaign','live','closure','completed','cancelled')),

  -- Team leads (FK to staff)
  commercial_lead_id   UUID REFERENCES staff(id),
  marketing_lead_id    UUID REFERENCES staff(id),
  delegate_lead_id     UUID REFERENCES staff(id),
  operations_lead_id   UUID REFERENCES staff(id),
  design_lead_id       UUID REFERENCES staff(id),
  production_advisor_id UUID REFERENCES staff(id),

  -- Client brief
  brief_status         TEXT DEFAULT 'pending' CHECK (brief_status IN ('pending','in_progress','completed')),
  brief_data           JSONB DEFAULT '{}',

  -- Meta
  created_by           UUID REFERENCES staff(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bespoke_projects_phase ON bespoke_projects(phase_status);
CREATE INDEX IF NOT EXISTS idx_bespoke_projects_event ON bespoke_projects(event_id);

-- ── bespoke_tasks ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bespoke_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES bespoke_projects(id) ON DELETE CASCADE,

  title           TEXT NOT NULL,
  description     TEXT,
  phase           INT NOT NULL CHECK (phase BETWEEN 1 AND 5),
  week_number     INT CHECK (week_number BETWEEN 1 AND 6),
  assigned_to     UUID REFERENCES staff(id),
  assigned_role   TEXT CHECK (assigned_role IN ('commercial','marketing','delegate','operations','design','production')),
  due_date        DATE,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','blocked','skipped')),
  notes           TEXT,
  sort_order      INT DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bespoke_tasks_project ON bespoke_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_bespoke_tasks_assignee ON bespoke_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_bespoke_tasks_status ON bespoke_tasks(status);

-- ── bespoke_delegates ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS bespoke_delegates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES bespoke_projects(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  company         TEXT,
  title           TEXT,
  industry        TEXT,
  email           TEXT,
  phone           TEXT,
  linkedin_url    TEXT,

  source          TEXT DEFAULT 'client_wishlist' CHECK (source IN ('drt','direct','marketing','client_wishlist','referral')),
  priority        TEXT DEFAULT 'nice_to_have' CHECK (priority IN ('must_have','nice_to_have')),
  stage           TEXT DEFAULT 'sourced' CHECK (stage IN ('sourced','contacted','interested','registered','confirmed','attended','no_show','declined')),

  last_contacted_at TIMESTAMPTZ,
  notes           TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bespoke_delegates_project ON bespoke_delegates(project_id);
CREATE INDEX IF NOT EXISTS idx_bespoke_delegates_stage ON bespoke_delegates(stage);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE bespoke_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bespoke_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bespoke_delegates ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (API routes use service client)
CREATE POLICY "Service role full access" ON bespoke_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON bespoke_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON bespoke_delegates FOR ALL USING (true) WITH CHECK (true);
