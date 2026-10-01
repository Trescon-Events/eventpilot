-- Umbrella-level role assignments (2026-10-01, Madhu): grant a role once at an umbrella (e.g. Dubai Future
-- Finance Week) and it applies to EVERY event under it — current and future — instead of one assignment per
-- child event. Typical use: the Operations person for DFFW.
--
-- A separate table on purpose. event_access_assignments uses event_id IS NULL to mean "organization-wide", so an
-- umbrella row stored there (event_id NULL + umbrella_id) would be silently read as org-wide by every existing
-- check. Nothing that reads event_access_assignments changes behaviour; app/lib/access/event-access.ts unions
-- this table in explicitly (a child event inherits its umbrella's roles).
--
-- Same shape as event_access_assignments: expires_at supported (contractors), revoke = delete the row.

CREATE TABLE IF NOT EXISTS umbrella_access_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  umbrella_id UUID NOT NULL REFERENCES event_umbrellas(id) ON DELETE CASCADE,
  staff_id    UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES access_roles_catalog(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  UNIQUE (umbrella_id, staff_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_umbrella_access_staff ON umbrella_access_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_umbrella_access_umbrella ON umbrella_access_assignments(umbrella_id);
