-- ============================================================
-- FORM SCHEMA DEFAULTS (2026-08-10) — follow-up phase to Phase 4 of
-- the SAE producer-workflow initiative. One row per form_type,
-- GLOBAL (no event_id) — edited by the workspace-level "Form
-- Templates" admin tool (app/admin/form-templates). This is the new
-- middle tier in resolveFormSchema(): event override
-- (event_form_schemas) > global default (this table) > hardcoded
-- fallback (app/lib/forms/default-schemas.ts). Absence of a row
-- means "use the hardcoded fallback" — the same absence-means-
-- default convention event_form_schemas uses, one level up.
--
-- Seeded at launch by scripts/seed-form-schema-defaults.ts so the
-- table starts "live" (matching current hardcoded content) rather
-- than a passive shadow of the code. NOT auto-reseeded if a row is
-- later deleted via "Reset to Original" in the builder — deletion
-- just lets the hardcoded fallback take back over, symmetric with
-- how the event tier's "Reset to Default" already behaves.
--
-- `fields` is the full ordered field array, same shape/validation
-- convention as event_form_schemas.fields — validated at the API
-- layer (app/api/admin/form-templates/[formType]/schema), not by a
-- DB constraint.
-- ============================================================

CREATE TABLE IF NOT EXISTS form_schema_defaults (
  form_type    TEXT PRIMARY KEY CHECK (form_type IN ('speaker', 'sponsor', 'media_partner', 'association_partner')),
  fields       JSONB NOT NULL,
  updated_by   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
