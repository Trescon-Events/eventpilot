-- Sessions already on YouTube (2026-11-27): the team uploads some session videos by hand. A scan of the event's mapped playlists links each
-- such video to its agenda session (auto when confident, otherwise by the producer), so nobody processes it again in EventPilot.
create table if not exists session_video_youtube_links (
  agenda_session_id uuid primary key references event_agenda_sessions(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  youtube_video_id text not null,
  video_title text,
  privacy text,
  published_at timestamptz,
  thumbnail_url text,
  playlist_id text,
  source text not null check (source in ('auto', 'manual')),
  score numeric,
  linked_by uuid,
  linked_at timestamptz not null default now()
);
create unique index if not exists session_video_youtube_links_video on session_video_youtube_links (event_id, youtube_video_id);
alter table session_video_settings add column if not exists youtube_scan jsonb;   -- { at, videos: [...] } from the last scan
