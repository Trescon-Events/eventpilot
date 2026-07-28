-- Bespoke Tracker · Assets tab overhaul
-- Nic build_request 517e232e
--
-- Adds two columns for the Assets tab's Brand & Styling category so the
-- client logo + brand guidelines files uploaded through the new UI have
-- a persistent home. Idempotent — safe to re-run.

BEGIN;

ALTER TABLE bespoke_projects
  ADD COLUMN IF NOT EXISTS client_logo_url TEXT;

ALTER TABLE bespoke_projects
  ADD COLUMN IF NOT EXISTS brand_guidelines_url TEXT;

COMMIT;

-- Verify (run separately):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='bespoke_projects'
--       AND column_name IN ('client_logo_url','brand_guidelines_url');
