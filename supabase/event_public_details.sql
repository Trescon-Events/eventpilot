-- ============================================================
-- PUBLIC-FACING EVENT DETAILS (2026-08-11) — events are pulled in from the
-- HR portal (hrms_project_id) using internal reference/reporting names —
-- e.g. "Dubai FinTech Summit 2026" or "DFS 2026" — which are NOT what
-- speakers/sponsors/attendees should see in invite emails, announcement
-- copy, or other external content (Madhu, 2026-08-11: "publicly we will
-- call it 'Dubai FinTech Summit'... its important to have a staging
-- area... to define the details of an event that will be used in
-- emailers and other tools").
--
-- All three are nullable free-text overrides, same pattern already
-- proven by event_websites.venue_date_display — every consumer falls
-- back to the internal name/venue/computed-date-range when blank, so
-- existing events need zero migration to keep working exactly as today.
-- Deliberately NOT touching event_websites — that table already solves
-- this same problem specifically for the public event website builder;
-- reconciling the two content models is a separate, larger decision.
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS public_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS public_dates_display TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS public_venue_display TEXT;
