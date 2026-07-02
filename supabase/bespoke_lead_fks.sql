-- Bespoke Tracker — corrective FK migration for the six lead columns
-- Run in EventPilot Supabase (yuyxfxoevztugtfgduks)
--
-- Why this migration exists:
--   The original bespoke_tracker.sql (29 Jun) declared the six lead columns
--   on bespoke_projects as `REFERENCES staff(id)`. That table has never
--   existed in this project — the staff table is `staff_members`. As a
--   result, the FK constraints were silently never created, and PostgREST's
--   embedded-resource resolver had no relationship to walk when
--   `/api/bespoke` (GET) tried to select
--     commercial_lead:commercial_lead_id ( id, name )
--   PostgREST returned 500 with
--     "Could not find a relationship between 'bespoke_projects' and
--      'commercial_lead_id' in the schema cache"
--   The 500 broke the detail page (/admin/bespoke/[id]) — it fell through
--   to its "Project not found" state, even though the row existed and had
--   been correctly created by POST /api/bespoke.
--
-- Reported by Nicholas Nunes; unblocked project already in the wild:
--   21fb39f3-5555-453b-b9e6-d88d8396c212  (AJMS CXO Boardroom).
--
-- Applied to prod via pg-direct at 2026-07-02 ~04:00 IST. This file is the
-- durable record of that schema fix so any fresh Supabase environment or
-- rebuild will apply the same constraints automatically.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bespoke_projects_commercial_lead_id_fkey'
      AND table_name      = 'bespoke_projects'
  ) THEN
    ALTER TABLE bespoke_projects
      ADD CONSTRAINT bespoke_projects_commercial_lead_id_fkey
      FOREIGN KEY (commercial_lead_id) REFERENCES staff_members(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bespoke_projects_marketing_lead_id_fkey'
      AND table_name      = 'bespoke_projects'
  ) THEN
    ALTER TABLE bespoke_projects
      ADD CONSTRAINT bespoke_projects_marketing_lead_id_fkey
      FOREIGN KEY (marketing_lead_id) REFERENCES staff_members(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bespoke_projects_delegate_lead_id_fkey'
      AND table_name      = 'bespoke_projects'
  ) THEN
    ALTER TABLE bespoke_projects
      ADD CONSTRAINT bespoke_projects_delegate_lead_id_fkey
      FOREIGN KEY (delegate_lead_id) REFERENCES staff_members(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bespoke_projects_operations_lead_id_fkey'
      AND table_name      = 'bespoke_projects'
  ) THEN
    ALTER TABLE bespoke_projects
      ADD CONSTRAINT bespoke_projects_operations_lead_id_fkey
      FOREIGN KEY (operations_lead_id) REFERENCES staff_members(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bespoke_projects_design_lead_id_fkey'
      AND table_name      = 'bespoke_projects'
  ) THEN
    ALTER TABLE bespoke_projects
      ADD CONSTRAINT bespoke_projects_design_lead_id_fkey
      FOREIGN KEY (design_lead_id) REFERENCES staff_members(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bespoke_projects_production_advisor_id_fkey'
      AND table_name      = 'bespoke_projects'
  ) THEN
    ALTER TABLE bespoke_projects
      ADD CONSTRAINT bespoke_projects_production_advisor_id_fkey
      FOREIGN KEY (production_advisor_id) REFERENCES staff_members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Tell PostgREST to reload its schema cache so the newly-created FKs are
-- visible to the embedded-resource resolver immediately.
NOTIFY pgrst, 'reload schema';
