-- Global placeholder defaults (2026-08-29) — per Madhu: today's per-event
-- Placeholder panel (events.creative_template_config.placeholder.<type>)
-- has no cross-event default at all — every new event starts from a
-- hardcoded "Jane Doe / Chief Officer / Acme Corp" fallback, and the
-- Photo/Logo Slot's placeholder-preview image is deliberately the SAME
-- stored value as its per-template "reference layer" (a conscious decision
-- from an earlier session — see composite.ts's own PhotoSlotLayer comment).
-- This adds a genuinely global, one-time-set default (one row per
-- stakeholder_type) that every event's preview falls back to when it has
-- no per-event override — Name/Job Title/Company/Country plus a real,
-- dedicated placeholder photo (a clean 1024x1024 transparent PNG, same
-- shape as the photo-cleaning module's own output), decoupled from
-- whatever reference layer the branding team uploads per-template purely
-- for auto-positioning (which can be anybody's photo).
--
-- Also adds `country` to event_sponsors (event_speakers already has it,
-- fully wired — form schema, KonfHub push, announcement prompt) so
-- partners get the same real field, not just a placeholder-tool concept.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS template_placeholder_defaults (
  stakeholder_type TEXT PRIMARY KEY CHECK (stakeholder_type IN ('speaker', 'partner')),
  name             TEXT,
  job_title        TEXT,
  company_name     TEXT,
  country          TEXT,
  photo_url        TEXT,
  updated_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE event_sponsors ADD COLUMN IF NOT EXISTS country TEXT;

-- Partner form types already have DB-seeded schemas (form_schema_defaults,
-- tier 2 of the 3-tier resolve-schema chain) — editing the code-level
-- fallback (default-schemas.ts) alone would never reach these already-
-- seeded rows, so the new field is patched in directly here. Not marked
-- required — existing partner submissions predate this field.
UPDATE form_schema_defaults
SET fields = fields || '[{"id":"partner-country","key":"country","type":"text","label":"Country","locked":false,"required":false}]'::jsonb,
    updated_at = NOW()
WHERE form_type IN ('sponsor', 'media_partner', 'association_partner')
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(fields) f WHERE f->>'key' = 'country');

COMMIT;
