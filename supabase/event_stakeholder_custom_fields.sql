-- ============================================================
-- STAKEHOLDER CUSTOM FIELDS (2026-08-10) — Phase 4 of the SAE
-- producer-workflow initiative. Additive, safe to run multiple
-- times. Home for any field a producer adds via the Form Builder
-- that has no dedicated typed column (e.g. "T-Shirt Size") and
-- never will — both the onboarding-form conversion routes and the
-- Stakeholder Hub's manual Add/Edit panel write unmapped field
-- values here via app/lib/forms/map-to-stakeholder-record.ts.
-- ============================================================

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE event_sponsors ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
