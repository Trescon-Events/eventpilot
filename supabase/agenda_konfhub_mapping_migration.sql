-- Agenda Builder <-> KonfHub: per-event field mapping (2026-10-18). Every event's team used KonfHub differently (DFFW: each stage is a KonfHub TRACK; BSS:
-- one track and the stage is a TAG of the "Stage" filter, plus Theme and Session Type filters). EventPilot keeps fixed fields (stage, room, theme, format) and
-- this per-event setting says where each one lives in KonfHub. Additive only; every default keeps today's behaviour (stage = track).
begin;

-- Where does the EventPilot STAGE live in KonfHub? 'track' (today's behaviour, one KonfHub track per stage per day) or 'tag' (a tag of a filter, e.g. "Stage").
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS agenda_stage_mode text NOT NULL DEFAULT 'track';
ALTER TABLE event_websites DROP CONSTRAINT IF EXISTS event_websites_agenda_stage_mode_check;
ALTER TABLE event_websites ADD CONSTRAINT event_websites_agenda_stage_mode_check CHECK (agenda_stage_mode IN ('track', 'tag'));

-- Should a push send the numeric KonfHub session type (1 session, 2 lunch, 3 refreshment, 4 other)? BSS uses type 1 for everything, so a push must not change it.
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS agenda_push_session_type boolean NOT NULL DEFAULT true;

-- Theme is a first-class agenda field (the BSS website filters on it).
ALTER TABLE event_agenda_sessions ADD COLUMN IF NOT EXISTS theme text;

-- The tag map gains two kinds: 'stage' (tag-mode stages) and 'theme'.
ALTER TABLE event_konfhub_tag_map DROP CONSTRAINT IF EXISTS event_konfhub_tag_map_kind_check;
ALTER TABLE event_konfhub_tag_map ADD CONSTRAINT event_konfhub_tag_map_kind_check CHECK (kind IN ('format', 'room', 'stage', 'theme'));

commit;
