-- Multi-role KonfHub speaker records (2026-10-04) — generalises the Speaker/
-- Moderator pair + single "Second Role" slot to any number of roles per event.
-- KonfHub's Agenda has no per-session role: whichever tag a speaker RECORD
-- carries shows in every session it's assigned to, so a person with a
-- different role in a different session (Moderator, Roundtable Chair,
-- Roundtable Host, ...) needs one extra KonfHub record per extra role.
-- (Same role in several sessions needs NO extra record — KonfHub allows one
-- speaker in many sessions, verified live 2026-10-04.)
--
--  * event_konfhub_roles      — per-event list of KonfHub tags that count as
--                               roles (picked on Integrations after a fetch).
--  * event_speakers.konfhub_primary_role_tag_id
--                             — tag id carried by the main (Overview) record.
--  * speaker_konfhub_roles    — one row per extra role record on KonfHub.
--
-- Legacy columns (event_websites.konfhub_speaker_tag_id/_moderator_tag_id,
-- event_speakers.konfhub_tag_speaker/_moderator, konfhub_secondary_*) are left
-- in place, no longer read by the app. Additive + backfill only; nothing on
-- KonfHub is touched. Applied by hand via psql.

BEGIN;

CREATE TABLE IF NOT EXISTS event_konfhub_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tag_id      text NOT NULL,
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, tag_id)
);
ALTER TABLE event_konfhub_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_primary_role_tag_id text;

CREATE TABLE IF NOT EXISTS speaker_konfhub_roles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id        uuid NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  tag_id            text NOT NULL,
  konfhub_speaker_id text,
  synced_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (speaker_id, tag_id)
);
ALTER TABLE speaker_konfhub_roles ENABLE ROW LEVEL SECURITY;

-- Seed each event's roles from its existing Speaker / Moderator tag ids.
INSERT INTO event_konfhub_roles (event_id, tag_id, label, sort_order)
SELECT event_id, konfhub_speaker_tag_id, 'Speaker', 0 FROM event_websites WHERE konfhub_speaker_tag_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO event_konfhub_roles (event_id, tag_id, label, sort_order)
SELECT event_id, konfhub_moderator_tag_id, 'Moderator', 1 FROM event_websites WHERE konfhub_moderator_tag_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Primary role: the (mutually exclusive) legacy tag the record carries.
UPDATE event_speakers s
SET konfhub_primary_role_tag_id = CASE WHEN s.konfhub_tag_moderator AND NOT s.konfhub_tag_speaker THEN w.konfhub_moderator_tag_id ELSE w.konfhub_speaker_tag_id END
FROM event_websites w
WHERE w.event_id = s.event_id AND s.konfhub_primary_role_tag_id IS NULL;

-- Existing second-role records: tag = the complement of the primary's.
INSERT INTO speaker_konfhub_roles (speaker_id, tag_id, konfhub_speaker_id, synced_at)
SELECT s.id,
       CASE WHEN s.konfhub_tag_speaker THEN w.konfhub_moderator_tag_id ELSE w.konfhub_speaker_tag_id END,
       s.konfhub_secondary_speaker_id, s.konfhub_secondary_synced_at
FROM event_speakers s JOIN event_websites w ON w.event_id = s.event_id
WHERE s.konfhub_secondary_speaker_id IS NOT NULL
  AND CASE WHEN s.konfhub_tag_speaker THEN w.konfhub_moderator_tag_id ELSE w.konfhub_speaker_tag_id END IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
