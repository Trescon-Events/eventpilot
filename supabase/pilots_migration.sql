-- Pilot Projects: lightweight tracker for SME-led build projects
-- Run in EventPilot Supabase (yuyxfxoevztugtfgduks)

CREATE TABLE IF NOT EXISTS pilot_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  -- status values: active | building | testing | complete | paused
  tool_href    TEXT,  -- where the project's "Open tool" button points; null if the tool doesn't exist yet
  tool_label   TEXT,  -- button label, e.g. "Open Bespoke Tracker"
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pilot_project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pilot_projects(id) ON DELETE CASCADE,
  staff_id   UUID NOT NULL,
  role       TEXT NOT NULL,
  -- role is a free-text key (e.g. pilot | co_pilot | consulting | tracking | anything new)
  role_label TEXT,  -- display label, e.g. "Co-Pilot"
  role_color TEXT,  -- hex accent color for the role badge, e.g. "#be185d"
  UNIQUE(project_id, staff_id)
);

-- 2 Jul 2026: added tool_href/tool_label (pilot_projects) and role_label/role_color
-- (pilot_project_members) so new roles and tool links are pure data — no code/deploy
-- needed to add a role or point a project at its tool once built. See app/api/admin/pilots.
ALTER TABLE pilot_projects        ADD COLUMN IF NOT EXISTS tool_href  TEXT;
ALTER TABLE pilot_projects        ADD COLUMN IF NOT EXISTS tool_label TEXT;
ALTER TABLE pilot_project_members ADD COLUMN IF NOT EXISTS role_label TEXT;
ALTER TABLE pilot_project_members ADD COLUMN IF NOT EXISTS role_color TEXT;

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
