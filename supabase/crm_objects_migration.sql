-- CRM layer — Phase 1: cross-event Contact/Company objects + property registry.
--
-- Sits above individual events. `event_speakers`/`event_sponsors` stay the
-- per-event operational records; crm_contacts/crm_companies are the shared
-- identity layer they link into (via new nullable FKs below), deduped by
-- email/domain the same way SmartData's sd_contact_records/sd_company_records
-- already do. Forward-only — no backfill of existing speakers/sponsors.
--
-- crm_properties/crm_property_groups are the real, working version of what
-- SmartData's sd_properties tried to be (confirmed dead code there) —
-- HubSpot-shaped (entity_type/group/field_type) so Phase 3's HubSpot
-- property auto-provisioning is a direct mapping.
--
-- Applied by hand via psql, same convention as every other migration in
-- this repo (no RLS, no ORM).

BEGIN;

CREATE TABLE IF NOT EXISTS crm_companies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain                TEXT,
  name                  TEXT NOT NULL,
  website               TEXT,
  property_values       JSONB NOT NULL DEFAULT '{}',
  hubspot_company_id    TEXT,
  hubspot_last_synced_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_domain_unique_idx
  ON crm_companies (lower(domain)) WHERE domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT,
  first_name            TEXT,
  last_name             TEXT,
  linkedin_url          TEXT,
  company_id            UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  property_values       JSONB NOT NULL DEFAULT '{}',
  hubspot_contact_id    TEXT,
  hubspot_last_synced_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_unique_idx
  ON crm_contacts (lower(email)) WHERE email IS NOT NULL;

-- Contact<->Event and Company<->Event, each with a role — the EventPilot-side
-- mirror of HubSpot's association-label pattern (Speaker/Sponsor/Attendee).
CREATE TABLE IF NOT EXISTS crm_contact_event_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contact_id, event_id, role)
);

CREATE TABLE IF NOT EXISTS crm_company_event_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, event_id, role)
);

CREATE TABLE IF NOT EXISTS crm_property_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact', 'company')),
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  UNIQUE(entity_type, key)
);

CREATE TABLE IF NOT EXISTS crm_properties (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type           TEXT NOT NULL CHECK (entity_type IN ('contact', 'company')),
  property_key          TEXT NOT NULL,
  label                 TEXT NOT NULL,
  field_type            TEXT NOT NULL DEFAULT 'text', -- text|textarea|select|number|date|checkbox|url|email|phone
  group_id              UUID REFERENCES crm_property_groups(id) ON DELETE SET NULL,
  options               JSONB NOT NULL DEFAULT '[]',
  is_required           BOOLEAN NOT NULL DEFAULT false,
  hubspot_property_name TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, property_key)
);

-- Additive, nullable FKs on the existing per-event stakeholder tables — no
-- backfill, no break for any existing row.
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS crm_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL;
ALTER TABLE event_sponsors ADD COLUMN IF NOT EXISTS crm_company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL;

-- Seed a starter property registry from the fields the two onboarding forms
-- already collect today, so /admin/crm/objects isn't empty on first load and
-- the HubSpot form-mapping page has real "CRM property" targets to pick from
-- immediately. Producers can add more via CRM Admin.
INSERT INTO crm_property_groups (entity_type, key, label, order_index) VALUES
  ('contact', 'identity', 'Identity', 0),
  ('contact', 'professional', 'Professional', 1),
  ('company', 'identity', 'Identity', 0)
ON CONFLICT (entity_type, key) DO NOTHING;

INSERT INTO crm_properties (entity_type, property_key, label, field_type, group_id, is_required)
SELECT 'contact', 'email', 'Email', 'email', g.id, false FROM crm_property_groups g WHERE g.entity_type = 'contact' AND g.key = 'identity'
ON CONFLICT (entity_type, property_key) DO NOTHING;

INSERT INTO crm_properties (entity_type, property_key, label, field_type, group_id, is_required)
SELECT 'contact', 'linkedin_url', 'LinkedIn Profile URL', 'url', g.id, false FROM crm_property_groups g WHERE g.entity_type = 'contact' AND g.key = 'identity'
ON CONFLICT (entity_type, property_key) DO NOTHING;

INSERT INTO crm_properties (entity_type, property_key, label, field_type, group_id, is_required)
SELECT 'contact', 'job_title', 'Job Title', 'text', g.id, false FROM crm_property_groups g WHERE g.entity_type = 'contact' AND g.key = 'professional'
ON CONFLICT (entity_type, property_key) DO NOTHING;

INSERT INTO crm_properties (entity_type, property_key, label, field_type, group_id, is_required)
SELECT 'company', 'website', 'Website', 'url', g.id, false FROM crm_property_groups g WHERE g.entity_type = 'company' AND g.key = 'identity'
ON CONFLICT (entity_type, property_key) DO NOTHING;

COMMIT;
