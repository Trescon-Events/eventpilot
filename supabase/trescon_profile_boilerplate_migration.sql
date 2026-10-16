-- ============================================================================
-- Trescon profile: approved boilerplate + approved company statistics
-- Date: 2026-10-15. Build note: docs/build_suggestions/trescon-profile-boilerplate.md
--
-- Reuses the existing Corporate Marketing tables (corporate_company_content,
-- cm_statistics, cm_statistic_dependencies). No new tables.
--
-- Idempotent and non-destructive:
--   * never overwrites a non-empty value_text (except the one deliberate 'boilerplate' replacement in section 2, old text recorded there) or a non-empty statistic value;
--   * statistics are written as 'pending_review', never 'approved' (Madhu approves
--     them in Corporate Marketing > Statistics);
--   * boilerplate text is written to value_text (the working copy) only. approved_text
--     stays NULL until Madhu clicks Approve on the Company Content tab.
-- Run in the EventPilot Supabase project (not Smart Data).
-- ============================================================================

BEGIN;

-- 1. Approval columns on company content ------------------------------------
ALTER TABLE public.corporate_company_content
  ADD COLUMN IF NOT EXISTS approved_text TEXT,
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ;

-- 2. Boilerplate working copies (Madhu approved the wording 15 Oct 2026) ----
-- 'boilerplate' is the existing key the deck mapping already uses; it holds the standard version.
CREATE TEMP TABLE _bp (key TEXT, label TEXT, txt TEXT) ON COMMIT DROP;
INSERT INTO _bp (key, label, txt)
VALUES
  ('boilerplate_short', 'Boilerplate: short', $t$Trescon connects businesses with opportunities through high-impact business events. Since 2016, it has delivered more than 500 events for enterprises, governments, investors and innovators, hosting more than 500,000 C-level attendees from more than 120 countries.$t$),

  ('boilerplate', 'Corporate Boilerplate (standard)', $t$Trescon connects businesses with opportunities through high-impact business events. Since 2016, it has delivered more than 500 events for enterprises, governments, investors and innovators across artificial intelligence, financial services, cyber security, cloud, Web3 and sustainability.

Trescon runs its own Signature Events, manages events for governments and institutions and builds bespoke events around a client's business goals. Its events have hosted more than 500,000 C-level attendees from more than 120 countries, supported by more than 50 government and policy partners and more than 500 association and media partners.

Based in Dubai, with offices in Bengaluru, Mangalore, Manipal, Doha and Mauritius, Trescon has a team of more than 250 people. Learn more at tresconglobal.com.$t$),

  ('boilerplate_long', 'Boilerplate: long', $t$Trescon connects businesses with opportunities through high-impact business events. Founded in 2016, it brings together enterprises, governments, investors and innovators to learn, collaborate and lead in fast-evolving markets.

Its work spans three event types:
- Signature Events: Trescon's own summits, conferences and expos across artificial intelligence, Web3, cyber security, cloud, financial services and sustainability.
- Managed Events: end-to-end management for governments, enterprises and institutions, from content and speakers to marketing, partnerships and on-site operations.
- Bespoke Events: custom-built events, roundtables and roadshows designed around a client's sales and marketing goals.

Trescon has delivered more than 500 events, each planned around clear objectives and measurable outcomes, including events of more than 10,000 attendees. Its events have hosted more than 500,000 C-level attendees and connected more than 3,500 investors and more than 3,000 speakers with their audiences, with participants from more than 120 countries. Its network includes more than 50 government and policy partners and more than 500 association and media partners.

Based in Dubai, with offices in Bengaluru, Mangalore, Manipal, Doha and Mauritius, Trescon has a team of more than 250 people. Learn more at tresconglobal.com.$t$),

  ('boilerplate_signature_module', 'Boilerplate module: Signature Events', $t$Trescon's Signature Events bring C-level executives and technology leaders together to share knowledge, build relationships and solve business challenges. The active series are World AI Show, World Cyber Security Show and World FinTech Show. Together, the Signature Events have welcomed more than 5,000 exhibitors.$t$),

  ('boilerplate_managed_module', 'Boilerplate module: Managed Events', $t$Trescon delivers end-to-end event management for governments, enterprises and institutions, from content and speaker acquisition to marketing, partnerships and on-site operations. Its managed events have engaged more than 40,000 delegates, served more than 700 exhibitors and featured more than 1,000 global speakers, and Trescon has experience delivering events of 10,000 attendees and above.$t$)
;

INSERT INTO public.corporate_company_content (key, label, value_text)
SELECT key, label, txt FROM _bp
ON CONFLICT (key) DO NOTHING;

-- Fill an existing row only when it is empty (never overwrite someone's text).
UPDATE public.corporate_company_content c
   SET value_text = t.txt, updated_at = NOW()
  FROM _bp t
 WHERE c.key = t.key AND COALESCE(BTRIM(c.value_text), '') = '';

-- Replace the existing 'boilerplate' working copy with the approved STANDARD wording (Madhu, 16 Oct 2026).
-- The live row was NOT empty: the Corporate deck mapping had written the text below (last updated 2026-08-13). It is recorded here so
-- it stays on record; to restore it, set value_text back to this text (or confirm the deck mapping again).
--
-- OLD 'boilerplate' value_text (416 characters):
--   Trescon is a global business catalyst and events firm that builds influential forums connecting governments, business leaders, investors, and innovators across FinTech, AI, sustainability, and emerging technologies. With a portfolio of flagship events like DATE, CARE, HODL, and the World FinTech Show, Trescon is known for catalysing bold ideas, strategic alliances, and real-world outcomes in high-growth markets. 
--
UPDATE public.corporate_company_content c
   SET value_text = t.txt, updated_at = NOW()
  FROM _bp t
 WHERE c.key = 'boilerplate' AND t.key = 'boilerplate';

-- 3. Company statistics the boilerplate quotes ------------------------------
-- New statistic names (existing names are only filled when empty, below).
WITH v(name, val, unit, descr) AS (
  VALUES
  ('Founded',                        '2016',     'year',      'Year Trescon was founded'),
  ('Association and Media Partners', '500+',     'partners',  'Association and media partners across events'),
  ('Investors Engaged',              '3,500+',   'investors', 'Venture capital, angel investors and HNWIs connected through events'),
  ('Speakers Featured',              '3,000+',   'speakers',  'Speakers featured across events'),
  ('Exhibitors Showcased',           '5,000+',   'exhibitors','Exhibitors showcased across Signature Events')
)
INSERT INTO public.cm_statistics (scope, name, current_value, unit, description, source, approval_status)
SELECT 'company'::cm_stat_scope, name, val, unit, descr,
       'Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026', 'pending_review'::cm_stat_approval_status
FROM v
ON CONFLICT DO NOTHING;

-- Existing company rows: fill only when empty.
WITH v(name, val, descr, note) AS (
  VALUES
  ('Events Delivered',    '500+',     NULL::text, NULL::text),
  ('Attendees',           '500,000+', 'Cumulative C-level attendees across events',
     'Corporate deck conflict: impact slide says 250,000+ attendees hosted, Signature Events slide says 500,000+ C-level attendees. Madhu chose 500,000+ on 15 Oct 2026; the deck needs correcting.'),
  ('Countries',           '120+',     'Countries represented by attendees, partners and speakers', NULL),
  ('Employees',           '250+',     NULL, NULL),
  ('Government Partners', '50+',      NULL,
     'Corporate deck conflict: impact slide says 100+, ecosystem slide says 50+. Madhu chose 50+ on 15 Oct 2026.')
)
UPDATE public.cm_statistics s
   SET current_value   = v.val,
       description     = COALESCE(v.descr, s.description),
       notes           = COALESCE(v.note, s.notes),
       source          = 'Corporate profile deck 2026; confirmed by Madhu 15 Oct 2026',
       approval_status = 'pending_review'::cm_stat_approval_status
  FROM v
 WHERE s.scope = 'company'
   AND LOWER(s.name) = LOWER(v.name)
   AND COALESCE(BTRIM(s.current_value), '') = '';

-- 4. Register the boilerplate as a consumer of these statistics -------------
-- When Marketing changes a statistic, the existing trigger flips these to 'needs_review'.
INSERT INTO public.cm_statistic_dependencies (statistic_id, module, asset_name, asset_reference, status)
SELECT id, 'content', 'About Trescon boilerplate', 'corporate_company_content:boilerplate', 'active'
  FROM public.cm_statistics
 WHERE scope = 'company'
   AND LOWER(name) IN ('founded', 'events delivered', 'attendees', 'countries', 'employees',
                       'government partners', 'association and media partners',
                       'investors engaged', 'speakers featured', 'exhibitors showcased')
ON CONFLICT (statistic_id, module, asset_reference) DO NOTHING;

COMMIT;

-- ─── verification (run manually after apply) ───────────────────────────────
-- SELECT key, LENGTH(value_text) AS chars, approved_at FROM public.corporate_company_content WHERE key LIKE 'boilerplate%' ORDER BY key;   -- expect 5 rows, approved_at NULL
-- SELECT name, current_value, approval_status FROM public.cm_statistics WHERE scope='company' ORDER BY name;                                   -- the ten quoted stats filled, pending_review
-- SELECT COUNT(*) FROM public.cm_statistic_dependencies WHERE module='content';                                                                -- expect 10
