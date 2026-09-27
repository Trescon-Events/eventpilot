-- Per-event feature toggles (2026-09-27) — generalizes the existing
-- events.requires_client_approval pattern into a small registry-backed
-- system so modules/sections/fields that only make sense for SOME events
-- (UAE residency question, Sensitive Documents, KonfHub/HubSpot/Postiz
-- integrations, Website Builder, Press Release Studio, Market Intel,
-- Agenda Builder, Operations) can be turned off per event instead of
-- always showing for every event. See app/lib/registry/feature-flags.ts
-- for the key registry and app/lib/access/event-access.ts for the
-- resolver helpers. Deliberately no umbrella inheritance, unlike
-- requires_client_approval — a feature toggle answers "does THIS event
-- need this module," which two sibling events under the same umbrella
-- can legitimately answer differently.
--
-- A missing key in enabled_features is NOT the same as false — callers
-- fall back to the registry's own defaultForNewEvent() when a key is
-- absent (see isEventFeatureEnabled()). The backfill below exists so
-- every event that predates this column has every key explicitly set,
-- and never has to rely on that fallback for its current behavior.
ALTER TABLE events ADD COLUMN IF NOT EXISTS enabled_features JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: every event that exists today keeps every module it already
-- has — nothing silently disappears when this ships. Only touches rows
-- still at the column default ('{}'), so this is safe to run more than
-- once and won't clobber flags an event has already had explicitly set
-- (e.g. by hand, or by a partial re-run).
UPDATE events
SET enabled_features = (
  SELECT jsonb_object_agg(key, true)
  FROM jsonb_array_elements_text(
    '["uae-resident-field","sensitive-documents",
      "integration-konfhub","integration-agenda-structure","integration-hubspot-forms",
      "integration-postiz","integration-content-guidelines-api","site-ops",
      "website-builder","press-releases","market-intel","agenda-builder","operations"]'::jsonb
  ) AS key
)
WHERE enabled_features = '{}'::jsonb;
