-- Operations Hub, Phase 1: Vendor Directory (2026-09-24)
--
-- First piece of the Operations module (per-event workspace section, see
-- app/admin/events/[id]/operations). The first real workflow built on it
-- is speaker licence procurement for UAE events; this phase only adds the
-- vendor directory that workflow (and later AV / print / visa-agency
-- tools) will reuse.
--
-- Deliberately NOT named vendor_contacts / vendor_accounts: those already
-- exist (supabase/vendor_accounts.sql) for the Task Manager's external
-- agencies, who log in via Microsoft 365 SSO as staff_members rows
-- (account_type = 'vendor'). This directory is a different concept — an
-- ops-managed list of outside suppliers and their contact people, with no
-- EventPilot login implied. The licence vendor's portal login (Phase 3)
-- gets its own ops_vendor_users table, never staff_members.
--
-- ops_vendors is a SHARED directory (one vendor serves many events);
-- ops_event_vendors is the per-event assignment.
--
-- Run manually via the Supabase session-pooler psql connection — this repo
-- has no migration runner, all files under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS ops_vendors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  -- Free text on purpose (UI offers a fixed suggestion list: speaker_license,
  -- av, print, visa, other) so a new category never needs a migration.
  category    TEXT NOT NULL DEFAULT 'other',
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_vendors_name ON ops_vendors (lower(name));

-- The people at the vendor who handle the data. The "1-2 contacts" limit
-- is enforced by the API (active contacts per vendor), not here, so a
-- vendor swapping a contact can add the new one before retiring the old.
CREATE TABLE IF NOT EXISTS ops_vendor_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES ops_vendors(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  job_title   TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_vendor_contacts_vendor ON ops_vendor_contacts(vendor_id);

-- Which vendors are engaged for which event. `purpose` names what the
-- vendor is engaged for on that event; 'speaker_license' is the Phase 2/3
-- workflow's key (a vendor can be assigned to the same event for more
-- than one purpose, hence part of the PK).
CREATE TABLE IF NOT EXISTS ops_event_vendors (
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id   UUID NOT NULL REFERENCES ops_vendors(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL DEFAULT 'speaker_license',
  created_by  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, vendor_id, purpose)
);
CREATE INDEX IF NOT EXISTS idx_ops_event_vendors_vendor ON ops_event_vendors(vendor_id);

COMMIT;
