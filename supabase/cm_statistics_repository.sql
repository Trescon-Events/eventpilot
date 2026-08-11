-- ============================================================================
-- CM-002.1 · Statistics Repository (Thulasi CMOS 2.1 · 29 Jul 2026)
--
-- Single source of truth for every corporate statistic used across
-- EventPilot (Corporate Deck, Knowledge Hub, Proposal Templates, Sales
-- Decks, and future modules). Prevents duplicate/inconsistent numbers.
--
-- Idempotent: safe to run multiple times.
-- Apply via Supabase Studio SQL Editor. No app-layer code depends on this
-- migration until Slices 2+3 (API + UI) ship in a separate deploy.
-- ============================================================================

BEGIN;

-- ─── enum: approval workflow states ─────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE cm_stat_approval_status AS ENUM ('draft', 'pending_review', 'approved', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── enum: statistic scope ──────────────────────────────────────────────
-- 'company'      → org-wide (Years, Countries, Revenue…)
-- 'event_series' → per-series (World AI Show delegates, Dubai AI Festival editions…)
-- 'event'        → per-event-edition (World AI Show Malaysia 2026 attendance…)
DO $$ BEGIN
  CREATE TYPE cm_stat_scope AS ENUM ('company', 'event_series', 'event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── table: cm_statistics ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cm_statistics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope            cm_stat_scope NOT NULL,
  -- For scope='event_series' → series name (free text, no dedicated series table yet).
  -- For scope='event'        → FK to events.id (do NOT duplicate event records).
  -- For scope='company'      → NULL.
  scope_ref_id     UUID REFERENCES public.events(id) ON DELETE SET NULL,
  scope_ref_label  TEXT,                        -- display name when scope_ref_id is null (series)
  category         TEXT,                        -- optional grouping (e.g. 'growth', 'audience')
  name             TEXT NOT NULL,               -- 'Delegates', 'Revenue', 'Editions'…
  current_value    TEXT NOT NULL DEFAULT '',    -- kept TEXT so '25,000+', '17 years', '$5.2M' all fit
  previous_value   TEXT,                        -- populated on edit (copied from old current_value)
  unit             TEXT,                        -- 'people', 'countries', 'USD', '%'…
  description      TEXT,
  source           TEXT,                        -- e.g. 'FY24 audited report'
  owner_id         UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  approval_status  cm_stat_approval_status NOT NULL DEFAULT 'draft',
  notes            TEXT,
  updated_by       UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cm_statistics_scope_idx           ON public.cm_statistics (scope);
CREATE INDEX IF NOT EXISTS cm_statistics_scope_ref_idx       ON public.cm_statistics (scope_ref_id);
CREATE INDEX IF NOT EXISTS cm_statistics_approval_idx        ON public.cm_statistics (approval_status);
CREATE INDEX IF NOT EXISTS cm_statistics_updated_at_idx      ON public.cm_statistics (updated_at DESC);

-- Uniqueness rule: same statistic NAME can only exist once per scope+scope_ref.
-- (e.g. two "Delegates" rows for the SAME event_series are noise.)
CREATE UNIQUE INDEX IF NOT EXISTS cm_statistics_unique_name
  ON public.cm_statistics (scope, COALESCE(scope_ref_id::text, ''), COALESCE(scope_ref_label, ''), LOWER(name));

-- ─── table: cm_statistic_history (immutable audit trail) ────────────────
CREATE TABLE IF NOT EXISTS public.cm_statistic_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statistic_id   UUID NOT NULL REFERENCES public.cm_statistics(id) ON DELETE CASCADE,
  old_value      TEXT,
  new_value      TEXT,
  changed_by     UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason         TEXT,
  -- Also snapshot the approval_status transition so history reads clean.
  status_before  cm_stat_approval_status,
  status_after   cm_stat_approval_status
);

CREATE INDEX IF NOT EXISTS cm_statistic_history_stat_idx     ON public.cm_statistic_history (statistic_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS cm_statistic_history_changed_at   ON public.cm_statistic_history (changed_at DESC);

-- ─── table: cm_statistic_dependencies (statistic → consuming asset) ─────
-- 'module' + 'asset_reference' is a free-form pointer today; Slice 6 wires
-- Corporate Deck to write these automatically. For now, Marketing links
-- dependencies manually so the impact analysis dashboard has data to show.
CREATE TABLE IF NOT EXISTS public.cm_statistic_dependencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statistic_id    UUID NOT NULL REFERENCES public.cm_statistics(id) ON DELETE CASCADE,
  module          TEXT NOT NULL,        -- 'corporate_deck', 'knowledge_hub', 'proposal_template', 'sales_deck'
  asset_name      TEXT NOT NULL,        -- e.g. 'Corporate Deck', 'Q4 Proposal'
  asset_reference TEXT,                 -- e.g. 'slide-6', 'section-3', or a URL / uuid
  -- Lifecycle: 'active' (currently uses stat), 'needs_review' (stat changed since last review),
  -- 'reviewed' (marketing acknowledged the change), 'obsolete' (asset no longer uses it).
  status          TEXT NOT NULL DEFAULT 'active',
  linked_by       UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ,
  last_reviewed_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  UNIQUE (statistic_id, module, asset_reference)
);

CREATE INDEX IF NOT EXISTS cm_stat_deps_stat_idx    ON public.cm_statistic_dependencies (statistic_id);
CREATE INDEX IF NOT EXISTS cm_stat_deps_module_idx  ON public.cm_statistic_dependencies (module, status);

-- ─── trigger: touch updated_at on cm_statistics UPDATE ──────────────────
CREATE OR REPLACE FUNCTION cm_statistics_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cm_statistics_touch_updated_at_trg ON public.cm_statistics;
CREATE TRIGGER cm_statistics_touch_updated_at_trg
  BEFORE UPDATE ON public.cm_statistics
  FOR EACH ROW EXECUTE FUNCTION cm_statistics_touch_updated_at();

-- ─── trigger: dependencies whose statistic changed → mark needs_review ──
-- When a cm_statistics.current_value changes, every linked dependency
-- with status='reviewed' or 'active' flips to 'needs_review' so the
-- Recent Changes / Impact page surfaces them. Marketing then Mark Reviewed
-- once they've eyeballed each asset. Never touches 'obsolete' rows.
CREATE OR REPLACE FUNCTION cm_statistics_flag_dependencies()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.current_value IS DISTINCT FROM OLD.current_value) THEN
    UPDATE public.cm_statistic_dependencies
       SET status = 'needs_review'
     WHERE statistic_id = NEW.id
       AND status IN ('active', 'reviewed');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cm_statistics_flag_deps_trg ON public.cm_statistics;
CREATE TRIGGER cm_statistics_flag_deps_trg
  AFTER UPDATE ON public.cm_statistics
  FOR EACH ROW EXECUTE FUNCTION cm_statistics_flag_dependencies();

-- ─── seed: 11 default Company statistics (draft rows) ───────────────────
-- Only inserts each name once (ON CONFLICT DO NOTHING via the unique idx).
INSERT INTO public.cm_statistics (scope, name, current_value, unit, description, approval_status)
VALUES
  ('company', 'Years',             '',  'years',      'Years in business',                                    'draft'),
  ('company', 'Countries',         '',  'countries',  'Countries where Trescon has delivered events',         'draft'),
  ('company', 'Events Delivered',  '',  'events',     'Total events Trescon has delivered globally',          'draft'),
  ('company', 'Attendees',         '',  'people',     'Cumulative delegate attendance across all events',     'draft'),
  ('company', 'Sponsors',          '',  'sponsors',   'Total distinct sponsors served',                       'draft'),
  ('company', 'Partners',          '',  'partners',   'Total distinct partners',                              'draft'),
  ('company', 'Revenue',           '',  'USD',        'Cumulative gross revenue (public-facing headline)',    'draft'),
  ('company', 'Employees',         '',  'people',     'Current headcount across all offices',                 'draft'),
  ('company', 'Clients',           '',  'clients',    'Total distinct client organisations',                  'draft'),
  ('company', 'Government Partners','', 'partners',   'Distinct government / public-sector partners',         'draft'),
  ('company', 'Media Reach',       '',  'impressions','Cumulative media impressions across owned + earned',   'draft')
ON CONFLICT DO NOTHING;

COMMIT;

-- ─── verification queries (paste manually after apply) ──────────────────
-- SELECT COUNT(*) FROM public.cm_statistics WHERE scope='company';       -- expect 11
-- SELECT enum_range(NULL::cm_stat_approval_status);                       -- expect {draft, pending_review, approved, archived}
-- SELECT enum_range(NULL::cm_stat_scope);                                 -- expect {company, event_series, event}
