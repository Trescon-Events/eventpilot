-- ============================================================
-- PER-EVENT ACCESS / RBAC (2026-08-07) — Phase 1 of the SAE
-- producer-workflow initiative. Three separate platform-wide
-- permission systems already exist (staff_members.tool_grants,
-- staff_members.access_roles, module_access table) — none of
-- them can express "this person can do X for event Y but not
-- event Z". This is the first per-event-scoped system.
--
-- Roles are a GLOBAL, reusable catalog (event_id nullable, NULL
-- = global — v1 only ever creates global roles) — defined once,
-- assigned per event, so editing "Producer" is one edit, not one
-- edit per event. permission_key is validated against the code
-- registry at app/lib/registry/access-permissions.ts, not FK'd
-- to a DB table — same "single source of truth in code" pattern
-- already used by app/lib/registry/modules.tsx.
--
-- No RLS — consistent with every other table in this codebase;
-- guarded entirely in application code via supabaseAdmin + the
-- hand-checked session cookie (see app/lib/access/event-access.ts).
-- ============================================================

CREATE TABLE IF NOT EXISTS access_roles_catalog (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,                 -- 'Producer'
  slug         TEXT NOT NULL,                 -- 'producer' — stable key, survives display-name renames
  description  TEXT,
  event_id     UUID REFERENCES events(id) ON DELETE CASCADE,  -- NULL = global (v1 UI only ever creates these)
  is_system    BOOLEAN NOT NULL DEFAULT FALSE, -- reserved for future seeded roles that can't be deleted
  created_by   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A plain UNIQUE(slug, event_id) would let multiple event_id IS NULL rows
-- share a slug (Postgres treats NULLs as distinct) — partial indexes close
-- that gap for both the common (global) and future (per-event) case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_roles_catalog_global_slug
  ON access_roles_catalog (slug) WHERE event_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_roles_catalog_event_slug
  ON access_roles_catalog (slug, event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS access_role_permissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id        UUID NOT NULL REFERENCES access_roles_catalog(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,   -- e.g. 'sae.stakeholders.edit' — see access-permissions.ts
  UNIQUE (role_id, permission_key)
);
CREATE INDEX IF NOT EXISTS idx_access_role_permissions_role ON access_role_permissions(role_id);

-- Staffer X holds role Y on event Z. A staffer can hold multiple roles on
-- the same event (e.g. Producer + Finance Reviewer) — multiple rows, not a
-- single role column, mirroring event_staff's own one-row-per-relationship
-- shape. Independent of (does not sync with) the event_staff roster table.
CREATE TABLE IF NOT EXISTS event_access_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id    UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES access_roles_catalog(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, staff_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_event_access_assignments_event ON event_access_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_access_assignments_staff ON event_access_assignments(staff_id);
