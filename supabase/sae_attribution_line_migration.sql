-- SAE fixed attribution line (2026-09-30).
--
-- Why: DIFC portfolio events other than Dubai FinTech Summit require an
-- "Organised by … and part of Dubai Future Finance Week." line on every
-- stakeholder announcement. The engine's five-paragraph shape has no slot
-- for it, so drafts carried it unpredictably and the production pack had
-- to tell producers to add it by hand at review. A step that has to be
-- remembered on every post is not a control — it becomes configuration.
--
-- Gated exactly like announcement_cta_label: NULL (the default, every
-- existing event) means no attribution line and today's behaviour
-- unchanged. Only an event that sets a value gets one.

ALTER TABLE events ADD COLUMN IF NOT EXISTS announcement_attribution_line TEXT;

COMMENT ON COLUMN events.announcement_attribution_line IS
  'assembled mode only. When set, inserted verbatim as its own paragraph immediately after the date/venue line in org_promo announcement copy. NULL = no attribution line (default).';

-- Future Islamic Finance Forum 2026. Matched on hashtag: the event name
-- carried a trailing non-breaking space until it was trimmed, and an
-- exact name match silently updated nothing.
UPDATE events
SET announcement_attribution_line =
    'Organised by Dubai International Financial Centre (DIFC) and part of Dubai Future Finance Week.'
WHERE event_hashtag = '#FutureIslamicFinanceForum2026';

SELECT name, sae_copy_mode, announcement_cta_label, announcement_attribution_line
FROM events WHERE announcement_attribution_line IS NOT NULL;
