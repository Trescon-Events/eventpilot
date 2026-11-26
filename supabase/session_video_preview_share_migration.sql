-- Shareable preview link (2026-11-26): a private link a producer can send to a team member, who can watch and download
-- the preview without an EventPilot login. The token is the key; it expires, and "Stop sharing" clears it.
alter table session_videos add column if not exists preview_share_token text;
alter table session_videos add column if not exists preview_share_expires_at timestamptz;
create unique index if not exists session_videos_preview_share_token_idx on session_videos (preview_share_token) where preview_share_token is not null;
