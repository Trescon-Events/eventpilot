-- Session Videos → YouTube tab (2026-11-27): which playlist each session goes into.
-- A "group" is an agenda day (event timezone) + stage (track): group_key = 'YYYY-MM-DD|<track_id or none>'.
-- Resolution: per-session override → its group → the event's fallback (event_youtube_channel.default_playlist_id).
create table if not exists session_video_playlist_map (
  event_id uuid not null references events(id) on delete cascade,
  group_key text not null,
  playlist_id text not null,
  playlist_title text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (event_id, group_key)
);
create table if not exists session_video_session_playlist (
  agenda_session_id uuid primary key references event_agenda_sessions(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  playlist_id text not null,
  playlist_title text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists session_video_session_playlist_event_idx on session_video_session_playlist (event_id);
