-- Agenda Structure rebuild (2026-09-15) — replaces the old free-text
-- event_agenda table's role for events that get the new Agenda Builder,
-- starting with DFFW-family events whose KonfHub event already has 164
-- real sessions live across 7 stages for the Nov 2026 event.
--
-- Two categories of event, gated per-event via event_websites.agenda_source:
--   'konfhub_authoritative' — KonfHub owns Track/Stage structure (DFFW-family
--     today). EventPilot only ever discovers structure via a fetch-and-
--     reconcile flow (see app/api/events/konfhub/fetch-agenda-structure),
--     never invents it locally. Deliberately temporary — after the DFFW
--     event, EventPilot becomes sole source of truth for anything new.
--   'eventpilot_native' — every other event, going forward. EventPilot
--     originates structure itself. The actual "create a Track in EventPilot
--     -> push it to KonfHub" wiring is a later phase, not built yet — this
--     migration only adds the column so the Agenda Builder UI can branch on
--     it (no "+ Add Stage" for konfhub_authoritative events).
--
-- event_agenda_tracks.name is EventPilot's own curated label (e.g. "Plenary
-- 1"), deliberately decoupled from whatever verbose/inconsistent title
-- KonfHub happens to use (e.g. "Dubai FinTech Summit Plenary 1") — the
-- KonfHub-side raw title only ever lives in
-- event_agenda_track_konfhub_links.last_seen_title, used for rename-drift
-- detection, never surfaced as the "real" name anywhere.
--
-- KonfHub gives a track a brand-new numeric track_id on every date it
-- recurs (confirmed live: the same real stage had track_id 4532 on one day
-- and 4600 the next) — so one event_agenda_tracks row maps to MANY
-- konfhub_track_id values, one per date, via event_agenda_track_konfhub_links.
-- Tracks carry no updated_at on KonfHub's side, so track renames can only be
-- caught by diffing last_seen_title on refetch; sessions do carry a real
-- updated_at, used for genuine drift detection via
-- event_agenda_sessions.konfhub_last_synced_updated_at.
--
-- event_agenda_track_konfhub_links is dormant for eventpilot_native events —
-- it only exists because KonfHub-first-authored structure needs reconciling
-- against EventPilot's own naming; an event whose tracks EventPilot creates
-- itself never needs this table at all.
--
-- No RLS — matches the existing event_agenda/event_speakers precedent (RLS
-- in this repo is reserved for finance/HR/PII-sensitive tables only, see
-- finance_security_2026_07_13.sql).
--
-- konfhub_session_id/konfhub_track_id are TEXT, not INTEGER, despite the
-- wire format being numeric — matches every other KonfHub-id column in this
-- schema (konfhub_speaker_id, konfhub_booking_id, konfhub_event_id,
-- konfhub_client_id are all TEXT), and konfhub-speakers.ts normalizes every
-- numeric KonfHub id to string at the API boundary for the same reason.
--
-- content_type stores the real KonfHub session tag in use today (Keynote /
-- Panel Discussion / Fireside Chat, confirmed live against DFFW's real
-- sessions) so the Agenda Builder can render the badge without a live
-- KonfHub call on every page load. Free text, not an enum: eventpilot_native
-- sessions have no KonfHub tag source at all, and DFFW's own tag set isn't
-- guaranteed stable.
--
-- The old event_agenda table, its API route (app/api/events/agenda), and
-- the old Agenda Builder tab in app/admin/events/[id]/website/page.tsx are
-- NOT touched by this migration — event_agenda is still read by the public
-- site renderers (app/events/[slug]/page.tsx and friends) for any event
-- still using EventPilot's own Website Builder, so it stays fully
-- functional and untouched. This migration is purely additive.
--
-- Run manually via the Supabase session-pooler psql connection — this repo
-- has no migration runner, all files under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS agenda_source TEXT NOT NULL DEFAULT 'eventpilot_native'
  CHECK (agenda_source IN ('konfhub_authoritative', 'eventpilot_native'));
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_agenda_start_date DATE;
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_agenda_end_date DATE;

CREATE TABLE IF NOT EXISTS event_agenda_tracks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  order_index  INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_agenda_tracks_event_id ON event_agenda_tracks(event_id);

CREATE TABLE IF NOT EXISTS event_agenda_sessions (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                       UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  track_id                       UUID REFERENCES event_agenda_tracks(id) ON DELETE SET NULL,
  title                          TEXT NOT NULL,
  description                    TEXT,
  session_type                   TEXT DEFAULT 'speaker_session'
                                  CHECK (session_type IN ('speaker_session','lunch_break','refreshment_break','custom_session')),
  content_type                   TEXT,   -- 'Keynote' | 'Panel Discussion' | 'Fireside Chat' | null, from KonfHub tags
  start_timestamp                TIMESTAMPTZ,
  end_timestamp                  TIMESTAMPTZ,
  location                       TEXT,
  colour                         TEXT,
  order_index                    INTEGER DEFAULT 0,
  konfhub_session_id             TEXT,
  konfhub_last_synced_updated_at TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ DEFAULT now(),
  updated_at                     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_agenda_sessions_event_id ON event_agenda_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_agenda_sessions_track_id ON event_agenda_sessions(track_id);

CREATE TABLE IF NOT EXISTS event_agenda_session_speakers (
  session_id   UUID REFERENCES event_agenda_sessions(id) ON DELETE CASCADE NOT NULL,
  speaker_id   UUID REFERENCES event_speakers(id) ON DELETE CASCADE NOT NULL,
  order_index  INTEGER DEFAULT 0,
  PRIMARY KEY (session_id, speaker_id)
);

CREATE TABLE IF NOT EXISTS event_agenda_track_konfhub_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id          UUID REFERENCES event_agenda_tracks(id) ON DELETE CASCADE NOT NULL,
  konfhub_track_id  TEXT NOT NULL UNIQUE,
  track_date        DATE NOT NULL,
  last_seen_title   TEXT,
  fetched_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_agenda_track_konfhub_links_track_id ON event_agenda_track_konfhub_links(track_id);

COMMIT;
