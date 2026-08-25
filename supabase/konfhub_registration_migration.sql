-- KonfHub Attendee Registration push (2026-08-25) — see
-- app/api/events/stakeholders/speakers/[id]/konfhub-registration-push/route.ts.
-- Separate from the Speakers-management API integration (konfhub_client_id/
-- konfhub_client_secret, event_speakers.konfhub_speaker_id) — this one talks
-- to KonfHub's Attendee/ticket registration API (event/capture/v2), reviving
-- event_websites.konfhub_api_key/konfhub_event_id/konfhub_speaker_ticket,
-- which have sat unused since the old, wrongly-scoped auto-push was removed
-- 2026-08-23. event_speakers.konfhub_booking_id (same era, also unused
-- since then) is reused as-is as this push's booking-id store — no rename.
--
-- konfhub_registration_field_map: maps our own field keys (schema keys like
-- 'email', 'industry_sector', consent checkbox keys, assistant_* keys) to
-- KonfHub's custom_forms form_id for this event's Speaker Registration
-- ticket. Defaults to '{}' — the push route only sends a custom_forms entry
-- for keys present in this map, so it's a safe no-op until the real
-- form_ids are known (blocked on confirming with KonfHub whether/how a
-- hidden ticket's custom questions are read via their API) and populated
-- here directly, no code change needed.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_registration_field_map JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_registration_synced_at TIMESTAMPTZ;

COMMIT;
