-- Session videos Steps 7 + 8 (2026-11-27): upload to YouTube (unlisted), internal then client approval, publish.
-- Approval rounds follow the badge-approval design (rounds + one token per recipient). Internal: every recipient must approve.
-- Client: the first to answer settles it. Either layer can be exempted by the producer at any time.

-- 1. Event-level YouTube defaults (the channel itself is already chosen in event_youtube_channel).
alter table event_youtube_channel add column if not exists default_playlist_id text;
alter table event_youtube_channel add column if not exists default_playlist_title text;
alter table event_youtube_channel add column if not exists category_id text not null default '28';   -- 28 = Science & Technology

-- 2. Event-level session-video settings: the internal reviewers ticked by default.
create table if not exists session_video_settings (
  event_id uuid primary key references events(id) on delete cascade,
  default_reviewer_ids uuid[] not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- 3. Per-video YouTube state + exemptions.
alter table session_videos add column if not exists youtube_connection_id uuid;
alter table session_videos add column if not exists youtube_video_id text;
alter table session_videos add column if not exists youtube_status text;            -- uploading | uploaded | failed | published | scheduled
alter table session_videos add column if not exists youtube_error text;
alter table session_videos add column if not exists youtube_privacy text;           -- what YouTube reports: private | unlisted | public
alter table session_videos add column if not exists youtube_locked_private boolean not null default false;  -- asked unlisted, YouTube kept it private (API project not yet audited)
alter table session_videos add column if not exists youtube_fingerprint text;       -- what is on YouTube (final render + title + description + tags + thumbnail)
alter table session_videos add column if not exists youtube_render_job_id uuid;     -- which final render was uploaded
alter table session_videos add column if not exists youtube_playlist_id text;
alter table session_videos add column if not exists youtube_uploaded_at timestamptz;
alter table session_videos add column if not exists youtube_published_at timestamptz;
alter table session_videos add column if not exists youtube_publish_at timestamptz; -- scheduled publish time
alter table session_videos add column if not exists internal_exempt_at timestamptz;
alter table session_videos add column if not exists internal_exempt_by uuid;
alter table session_videos add column if not exists internal_exempt_by_name text;
alter table session_videos add column if not exists client_exempt_at timestamptz;
alter table session_videos add column if not exists client_exempt_by uuid;
alter table session_videos add column if not exists client_exempt_by_name text;

alter table video_jobs drop constraint if exists video_jobs_kind_check;
alter table video_jobs add constraint video_jobs_kind_check
  check (kind in ('drive_import', 'ingest', 'transcribe', 'identify', 'text_pack', 'render_preview', 'render', 'cue_scan', 'youtube_upload'));

-- 4. Approval rounds.
create table if not exists session_video_approval_rounds (
  id uuid primary key default gen_random_uuid(),
  session_video_id uuid not null references session_videos(id) on delete cascade,
  layer text not null check (layer in ('internal', 'client')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'approved_with_comments', 'changes_requested', 'withdrawn')),
  fingerprint text not null,          -- the YouTube copy this round was about; a later change voids the approval
  message text,
  sent_by uuid, sent_by_name text, sent_by_email text,
  sent_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by_name text
);
create index if not exists session_video_approval_rounds_video_idx on session_video_approval_rounds (session_video_id, layer, sent_at desc);
create unique index if not exists session_video_approval_rounds_one_pending on session_video_approval_rounds (session_video_id, layer) where status = 'pending';

create table if not exists session_video_approval_recipients (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references session_video_approval_rounds(id) on delete cascade,
  staff_id uuid,                      -- internal reviewers
  name text not null,
  email text not null,
  token text not null unique,
  token_expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'approved_with_comments', 'changes_requested')),
  comment text,
  actioned_at timestamptz,
  notified_at timestamptz,
  last_opened_at timestamptz
);
create index if not exists session_video_approval_recipients_round_idx on session_video_approval_recipients (round_id);
