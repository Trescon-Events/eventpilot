-- Brand & Content, Part 3 (2026-10-16): the Company profile tables, built clean (docs/build_suggestions/brand-and-content-section.md).
-- Replaces the Corporate Marketing statistics and boilerplate tables, which are dropped later in a separate migration (corporate_marketing_drop.sql).
-- Nothing here touches the old tables. Seeds are the values read in Part 0 (archive: docs/archive/corporate-marketing-2026-10-16/).
-- Safe to re-run: every create is IF NOT EXISTS and every seed is ON CONFLICT DO NOTHING.
begin;

CREATE TABLE IF NOT EXISTS public.company_profile_texts (
  key          TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  working_text TEXT NOT NULL DEFAULT '',
  approved_text TEXT,
  approved_by  UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  approved_at  TIMESTAMPTZ,
  figure_keys  TEXT[] NOT NULL DEFAULT '{}',
  needs_review BOOLEAN NOT NULL DEFAULT false,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_by   UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_figures (
  key            TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  value          TEXT NOT NULL DEFAULT '',
  unit           TEXT,
  description    TEXT,
  source         TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved')),
  approved_value TEXT,
  approved_by    UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  updated_by     UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_figure_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  figure_key TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('value', 'approved_value')),
  old_value  TEXT,
  new_value  TEXT,
  changed_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_figure_history_key ON public.company_figure_history (figure_key, changed_at DESC);

-- Only the server (service role) reads and writes these.
ALTER TABLE public.company_profile_texts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_figures         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_figure_history  ENABLE ROW LEVEL SECURITY;

-- One place for the audit trail and for "a figure changed, so every text that quotes it needs a fresh look".
-- A text that has never been approved has nothing to re-review, so only approved texts flip.
CREATE OR REPLACE FUNCTION public.company_figures_after_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.value IS DISTINCT FROM OLD.value THEN
    INSERT INTO public.company_figure_history (figure_key, kind, old_value, new_value, changed_by)
    VALUES (NEW.key, 'value', OLD.value, NEW.value, NEW.updated_by);
  END IF;
  IF NEW.approved_value IS DISTINCT FROM OLD.approved_value THEN
    INSERT INTO public.company_figure_history (figure_key, kind, old_value, new_value, changed_by)
    VALUES (NEW.key, 'approved_value', OLD.approved_value, NEW.approved_value, NEW.approved_by);
    UPDATE public.company_profile_texts SET needs_review = true
     WHERE NEW.key = ANY (figure_keys) AND approved_text IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_figures_after_update_trg ON public.company_figures;
CREATE TRIGGER company_figures_after_update_trg AFTER UPDATE ON public.company_figures
  FOR EACH ROW EXECUTE FUNCTION public.company_figures_after_update();

-- The Word copy of the Trescon-wide style guide (and of any other document): stored and downloadable only. Never extracted, never read
-- by a prompt or a rule check. It belongs to one version; a new version starts without one.
ALTER TABLE public.event_messaging_docs ADD COLUMN IF NOT EXISTS word_file_url  TEXT;
ALTER TABLE public.event_messaging_docs ADD COLUMN IF NOT EXISTS word_file_name TEXT;

-- ── Seed: texts ─────────────────────────────────────────────────────────────
-- approved_text comes only from the old approved_text (approved by Madhu, 16 Oct 2026); a working copy is never promoted. The old
-- 'boilerplate' key becomes about_standard. tagline, mission and vision are carried as unapproved working text.
INSERT INTO public.company_profile_texts (key, label, working_text, approved_text, approved_by, approved_at, figure_keys, sort_order)
VALUES ('about_short', $q$About Trescon: short$q$, $q$Trescon connects businesses with opportunities through high-impact business events. Since 2016, it has delivered more than 500 events for enterprises, governments, investors and innovators, hosting more than 500,000 C-level attendees from more than 120 countries.$q$, $q$Trescon connects businesses with opportunities through high-impact business events. Since 2016, it has delivered more than 500 events for enterprises, governments, investors and innovators, hosting more than 500,000 C-level attendees from more than 120 countries.$q$, $q$323f2caf-7a9b-47e0-b703-02d2d6ecfc95$q$::uuid, $q$2026-10-16T06:48:26.129+00:00$q$::timestamptz, ARRAY['founded','events_delivered','attendees','countries']::text[], 1)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_profile_texts (key, label, working_text, approved_text, approved_by, approved_at, figure_keys, sort_order)
VALUES ('about_standard', $q$About Trescon: standard$q$, $q$Trescon connects businesses with opportunities through high-impact business events. Since 2016, it has delivered more than 500 events for enterprises, governments, investors and innovators across artificial intelligence, financial services, cyber security, cloud, Web3 and sustainability.

Trescon runs its own Signature Events, manages events for governments and institutions and builds bespoke events around a client's business goals. Its events have hosted more than 500,000 C-level attendees from more than 120 countries, supported by more than 50 government and policy partners and more than 500 association and media partners.

Based in Dubai, with offices in Bengaluru, Mangalore, Manipal, Doha and Mauritius, Trescon has a team of more than 250 people. Learn more at tresconglobal.com.$q$, $q$Trescon connects businesses with opportunities through high-impact business events. Since 2016, it has delivered more than 500 events for enterprises, governments, investors and innovators across artificial intelligence, financial services, cyber security, cloud, Web3 and sustainability.

Trescon runs its own Signature Events, manages events for governments and institutions and builds bespoke events around a client's business goals. Its events have hosted more than 500,000 C-level attendees from more than 120 countries, supported by more than 50 government and policy partners and more than 500 association and media partners.

Based in Dubai, with offices in Bengaluru, Mangalore, Manipal, Doha and Mauritius, Trescon has a team of more than 250 people. Learn more at tresconglobal.com.$q$, $q$323f2caf-7a9b-47e0-b703-02d2d6ecfc95$q$::uuid, $q$2026-10-16T06:48:16.076+00:00$q$::timestamptz, ARRAY['founded','events_delivered','attendees','countries','government_partners','association_media_partners','employees']::text[], 2)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_profile_texts (key, label, working_text, approved_text, approved_by, approved_at, figure_keys, sort_order)
VALUES ('about_long', $q$About Trescon: long$q$, $q$Trescon connects businesses with opportunities through high-impact business events. Founded in 2016, it brings together enterprises, governments, investors and innovators to learn, collaborate and lead in fast-evolving markets.

Its work spans three event types:
- Signature Events: Trescon's own summits, conferences and expos across artificial intelligence, Web3, cyber security, cloud, financial services and sustainability.
- Managed Events: end-to-end management for governments, enterprises and institutions, from content and speakers to marketing, partnerships and on-site operations.
- Bespoke Events: custom-built events, roundtables and roadshows designed around a client's sales and marketing goals.

Trescon has delivered more than 500 events, each planned around clear objectives and measurable outcomes, including events of more than 10,000 attendees. Its events have hosted more than 500,000 C-level attendees and connected more than 3,500 investors and more than 3,000 speakers with their audiences, with participants from more than 120 countries. Its network includes more than 50 government and policy partners and more than 500 association and media partners.

Based in Dubai, with offices in Bengaluru, Mangalore, Manipal, Doha and Mauritius, Trescon has a team of more than 250 people. Learn more at tresconglobal.com.$q$, $q$Trescon connects businesses with opportunities through high-impact business events. Founded in 2016, it brings together enterprises, governments, investors and innovators to learn, collaborate and lead in fast-evolving markets.

Its work spans three event types:
- Signature Events: Trescon's own summits, conferences and expos across artificial intelligence, Web3, cyber security, cloud, financial services and sustainability.
- Managed Events: end-to-end management for governments, enterprises and institutions, from content and speakers to marketing, partnerships and on-site operations.
- Bespoke Events: custom-built events, roundtables and roadshows designed around a client's sales and marketing goals.

Trescon has delivered more than 500 events, each planned around clear objectives and measurable outcomes, including events of more than 10,000 attendees. Its events have hosted more than 500,000 C-level attendees and connected more than 3,500 investors and more than 3,000 speakers with their audiences, with participants from more than 120 countries. Its network includes more than 50 government and policy partners and more than 500 association and media partners.

Based in Dubai, with offices in Bengaluru, Mangalore, Manipal, Doha and Mauritius, Trescon has a team of more than 250 people. Learn more at tresconglobal.com.$q$, $q$323f2caf-7a9b-47e0-b703-02d2d6ecfc95$q$::uuid, $q$2026-10-16T06:48:29.565+00:00$q$::timestamptz, ARRAY['founded','events_delivered','attendees','investors_engaged','speakers_featured','countries','government_partners','association_media_partners','employees']::text[], 3)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_profile_texts (key, label, working_text, approved_text, approved_by, approved_at, figure_keys, sort_order)
VALUES ('module_signature', $q$Signature Events module$q$, $q$Trescon's Signature Events bring C-level executives and technology leaders together to share knowledge, build relationships and solve business challenges. The active series are World AI Show, World Cyber Security Show and World FinTech Show. Together, the Signature Events have welcomed more than 5,000 exhibitors.$q$, $q$Trescon's Signature Events bring C-level executives and technology leaders together to share knowledge, build relationships and solve business challenges. The active series are World AI Show, World Cyber Security Show and World FinTech Show. Together, the Signature Events have welcomed more than 5,000 exhibitors.$q$, $q$323f2caf-7a9b-47e0-b703-02d2d6ecfc95$q$::uuid, $q$2026-10-16T06:48:33.943+00:00$q$::timestamptz, ARRAY['exhibitors_showcased']::text[], 4)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_profile_texts (key, label, working_text, approved_text, approved_by, approved_at, figure_keys, sort_order)
VALUES ('module_managed', $q$Managed Events module$q$, $q$Trescon delivers end-to-end event management for governments, enterprises and institutions, from content and speaker acquisition to marketing, partnerships and on-site operations. Its managed events have engaged more than 40,000 delegates, served more than 700 exhibitors and featured more than 1,000 global speakers, and Trescon has experience delivering events of 10,000 attendees and above.$q$, $q$Trescon delivers end-to-end event management for governments, enterprises and institutions, from content and speaker acquisition to marketing, partnerships and on-site operations. Its managed events have engaged more than 40,000 delegates, served more than 700 exhibitors and featured more than 1,000 global speakers, and Trescon has experience delivering events of 10,000 attendees and above.$q$, $q$323f2caf-7a9b-47e0-b703-02d2d6ecfc95$q$::uuid, $q$2026-10-16T06:48:38.269+00:00$q$::timestamptz, '{}'::text[], 5)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_profile_texts (key, label, working_text, approved_text, approved_by, approved_at, figure_keys, sort_order)
VALUES ('tagline', $q$Tagline$q$, $q$Connecting Businesses with Opportunities$q$, NULL, NULL, NULL, '{}'::text[], 6)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_profile_texts (key, label, working_text, approved_text, approved_by, approved_at, figure_keys, sort_order)
VALUES ('mission', $q$Mission$q$, $q$As we look to the future, Trescon remains committed to pushing boundaries, embracing new technologies, and creating exceptional experiences that shape the business landscape.$q$, NULL, NULL, NULL, '{}'::text[], 7)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_profile_texts (key, label, working_text, approved_text, approved_by, approved_at, figure_keys, sort_order)
VALUES ('vision', $q$Vision$q$, $q$To continue pioneering the future of business events through innovation, sustainability, and meaningful connections that drive global economic growth.$q$, NULL, NULL, NULL, '{}'::text[], 8)
ON CONFLICT (key) DO NOTHING;

-- ── Seed: figures (all ten pending review; the six empty drafts from the old table are not carried) ──
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('founded', $q$Founded$q$, $q$2016$q$, $q$year$q$, $q$Year Trescon was founded$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, NULL, 'pending_review', 1)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('events_delivered', $q$Events delivered$q$, $q$500+$q$, $q$events$q$, $q$Total events Trescon has delivered globally$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, NULL, 'pending_review', 2)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('attendees', $q$C-level attendees$q$, $q$500,000+$q$, $q$people$q$, $q$Cumulative C-level attendees across events$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, $q$Corporate deck conflict: impact slide says 250,000+ attendees hosted, Signature Events slide says 500,000+ C-level attendees. Madhu chose 500,000+ on 15 Oct 2026; the deck needs correcting.$q$, 'pending_review', 3)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('countries', $q$Countries$q$, $q$120+$q$, $q$countries$q$, $q$Countries represented by attendees, partners and speakers$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, NULL, 'pending_review', 4)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('employees', $q$Team size$q$, $q$250+$q$, $q$people$q$, $q$Current headcount across all offices$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, NULL, 'pending_review', 5)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('government_partners', $q$Government and policy partners$q$, $q$50+$q$, $q$partners$q$, $q$Distinct government / public-sector partners$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, $q$Corporate deck conflict: impact slide says 100+, ecosystem slide says 50+. Madhu chose 50+ on 15 Oct 2026.$q$, 'pending_review', 6)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('association_media_partners', $q$Association and media partners$q$, $q$500+$q$, $q$partners$q$, $q$Association and media partners across events$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, NULL, 'pending_review', 7)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('investors_engaged', $q$Investors engaged$q$, $q$3,500+$q$, $q$investors$q$, $q$Venture capital, angel investors and HNWIs connected through events$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, NULL, 'pending_review', 8)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('speakers_featured', $q$Speakers featured$q$, $q$3,000+$q$, $q$speakers$q$, $q$Speakers featured across events$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, NULL, 'pending_review', 9)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.company_figures (key, label, value, unit, description, source, notes, status, sort_order)
VALUES ('exhibitors_showcased', $q$Exhibitors showcased$q$, $q$5,000+$q$, $q$exhibitors$q$, $q$Exhibitors showcased across Signature Events$q$, $q$Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026$q$, NULL, 'pending_review', 10)
ON CONFLICT (key) DO NOTHING;

-- ── Verify (paste after running) ────────────────────────────────────────────
-- SELECT key, approved_text IS NOT NULL AS approved, needs_review FROM company_profile_texts ORDER BY sort_order;  -- 8 rows; first 5 approved
-- SELECT key, value, status FROM company_figures ORDER BY sort_order;                                              -- 10 rows, all pending_review

commit;
