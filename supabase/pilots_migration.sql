-- Pilot Projects: lightweight tracker for SME-led build projects
-- Run in EventPilot Supabase (yuyxfxoevztugtfgduks)

CREATE TABLE IF NOT EXISTS pilot_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  -- status values: active | building | testing | complete | paused
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pilot_project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pilot_projects(id) ON DELETE CASCADE,
  staff_id   UUID NOT NULL,
  role       TEXT NOT NULL,
  -- role values: pilot | consulting | tracking
  UNIQUE(project_id, staff_id)
);

CREATE TABLE IF NOT EXISTS pilot_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES pilot_projects(id) ON DELETE CASCADE,
  assigned_to  UUID NOT NULL,   -- staff_members.id
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT,            -- 'prerequisite' | 'scope_decision' | 'content_prep' | 'coordination'
  completed    BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilot_members_staff ON pilot_project_members(staff_id);
CREATE INDEX IF NOT EXISTS idx_pilot_checklist_assigned ON pilot_checklist_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_pilot_checklist_project ON pilot_checklist_items(project_id);
