-- Brand & Content, Part 6 (2026-10-17): drops the retired Corporate Marketing module's data. DO NOT RUN until Madhu has seen the report.
-- Replaced by: company_profile_texts / company_figures / company_figure_history (supabase/company_profile_migration.sql) and the
-- Brand & Content pages. Backup of every table: docs/archive/corporate-marketing-2026-10-16/ (CSV + JSON). Deck files: copied to
-- ~/Desktop/Working_Files/corporate-marketing-archive/ and removed by supabase/corporate_marketing_delete_files.ts (run that separately; it is
-- NOT done here because deleting storage rows from SQL leaves the files behind in storage).
--
-- KEPT, not touched: corporate_brand_assets, corporate_brand_guidelines (the Brand book).
-- No CASCADE anywhere: if something outside the module still depends on an object, this fails and changes nothing (one transaction).
begin;

-- Safety: the replacements must be live with the approved texts before anything is dropped.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.company_profile_texts WHERE approved_text IS NOT NULL) < 5 THEN
    RAISE EXCEPTION 'company_profile_texts does not hold the five approved texts; refusing to drop the old tables';
  END IF;
  IF (SELECT count(*) FROM public.company_figures) < 10 THEN
    RAISE EXCEPTION 'company_figures is not seeded; refusing to drop the old tables';
  END IF;
END $$;

-- Trigger and functions (cm_statistics_repository.sql)
DROP TRIGGER IF EXISTS cm_statistics_flag_deps_trg ON public.cm_statistics;
DROP TRIGGER IF EXISTS cm_statistics_touch_updated_at_trg ON public.cm_statistics;
DROP FUNCTION IF EXISTS public.cm_statistics_flag_dependencies();
DROP FUNCTION IF EXISTS public.cm_statistics_touch_updated_at();

-- Tables, children first (corporate_marketing.sql, cm_statistics_repository.sql)
DROP TABLE IF EXISTS public.cm_statistic_dependencies;
DROP TABLE IF EXISTS public.cm_statistic_history;
DROP TABLE IF EXISTS public.cm_statistics;
DROP TABLE IF EXISTS public.corporate_deck_mappings;
DROP TABLE IF EXISTS public.corporate_deck_versions;
DROP TABLE IF EXISTS public.corporate_decks;
DROP TABLE IF EXISTS public.corporate_company_content;
DROP TABLE IF EXISTS public.corporate_testimonials;
DROP TABLE IF EXISTS public.corporate_assets;
DROP TABLE IF EXISTS public.corporate_leadership_overrides;

-- Enums
DROP TYPE IF EXISTS public.cm_stat_approval_status;
DROP TYPE IF EXISTS public.cm_stat_scope;

-- The retired tool grant on staff records (four people held it). Access-request history rows are left as they are.
UPDATE public.staff_members SET tool_grants = tool_grants - 'corporate_marketing' WHERE tool_grants ? 'corporate_marketing';

-- Verify (paste after running):
-- SELECT to_regclass('public.cm_statistics'), to_regclass('public.corporate_company_content'), to_regclass('public.corporate_decks');   -- all NULL
-- SELECT to_regclass('public.corporate_brand_assets'), to_regclass('public.corporate_brand_guidelines');                                -- both still present
-- SELECT count(*) FROM public.staff_members WHERE tool_grants ? 'corporate_marketing';                                                  -- 0

commit;
