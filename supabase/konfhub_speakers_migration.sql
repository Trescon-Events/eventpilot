-- KonfHub Speakers-management API integration (2026-08-23)
--
-- Separate from the old ticket/attendee-registration flow (event_websites.
-- konfhub_api_key / konfhub_event_id / konfhub_speaker_ticket, event_speakers.
-- konfhub_booking_id) — that flow POSTed to KonfHub's capture/v2 endpoint and
-- has been removed from the app (it was registering every approved speaker as
-- a $0 attendee, which Madhu does not want EventPilot touching). Those old
-- columns are left in place, just unused.
--
-- The Speakers-management API (the "Speakers" section a producer maintains
-- directly in the KonfHub dashboard, separate from Attendees — feeds KonfHub's
-- own event page and worldaishow.com/malaysia/speakers/) uses Bearer-token auth
-- via a client_id/client_secret exchange, not the old API key.

ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_client_id text;
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_client_secret text;

-- The Speakers-API entity ID for this speaker's KonfHub "Speakers" record —
-- distinct from konfhub_booking_id (which was the ticket/attendee booking
-- receipt). This is what every future update targets, so an update always
-- lands on the SAME KonfHub record rather than creating a duplicate — critical
-- since KonfHub's Agenda sessions reference speakers by this ID, and
-- deleting/recreating would silently drop them from their assigned sessions.
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_speaker_id text;
