-- ============================================================
-- HUBSPOT FORM CONNECTIONS (2026-08-11) — Phase A of the HubSpot
-- Forms integration, superseding the custom Form Builder direction
-- for onboarding forms (that code stays in place, unused for events
-- that connect a HubSpot form). One row per (event_id, form_type) —
-- each event has its OWN HubSpot form (own hubspot_form_id), not a
-- form shared across events. Trescon's HubSpot portal ID is a single
-- global env var (HUBSPOT_PORTAL_ID), not stored per row — one
-- portal for the whole account.
--
-- cached_fields is the last-fetched HubSpot field definition set, so
-- the mapping UI renders without a live API call on every page load.
-- field_mapping is the human-authored HubSpot field -> EventPilot
-- concept mapping (HubSpotFieldMapping[], see app/lib/hubspot/types.ts) —
-- explicit, not inferred, per the product decision that field names
-- aren't assumed to be consistent across forms.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_hubspot_forms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  form_type         TEXT NOT NULL CHECK (form_type IN ('speaker', 'sponsor', 'media_partner', 'association_partner')),
  hubspot_form_id   TEXT NOT NULL,
  hubspot_form_name TEXT,
  cached_fields     JSONB,
  fields_synced_at  TIMESTAMPTZ,
  field_mapping     JSONB NOT NULL DEFAULT '[]'::jsonb,
  connected_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  connected_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, form_type)
);
-- The webhook receiver's only lookup key — HubSpot tells us which form
-- fired, we look up event+form_type+mapping from that alone.
CREATE INDEX IF NOT EXISTS idx_event_hubspot_forms_hs_form_id ON event_hubspot_forms(hubspot_form_id);
