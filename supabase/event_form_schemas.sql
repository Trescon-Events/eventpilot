-- ============================================================
-- EVENT FORM SCHEMAS (2026-08-10) — Phase 4 of the SAE
-- producer-workflow initiative. One row per (event_id, form_type),
-- ONLY when a producer has customized that onboarding form. Absence
-- of a row means "use the hardcoded defaults" (see
-- app/lib/forms/default-schemas.ts) — every existing event keeps
-- working with zero backfill; only events where a producer actively
-- customizes get a stored override.
--
-- `fields` is the full ordered field array — there is no separate
-- order column, array order IS field order, and the whole array is
-- replaced atomically on every save (no partial/targeted field
-- updates), so JSONB array order is a safe source of truth here.
-- Shape is app/lib/forms/types.ts's FieldSchema[], validated at the
-- API layer (app/api/events/stakeholders/forms/[formType]/schema),
-- not by a DB constraint.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_form_schemas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  form_type    TEXT NOT NULL CHECK (form_type IN ('speaker', 'sponsor', 'media_partner', 'association_partner')),
  fields       JSONB NOT NULL,
  updated_by   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, form_type)
);
CREATE INDEX IF NOT EXISTS idx_event_form_schemas_event ON event_form_schemas(event_id, form_type);
