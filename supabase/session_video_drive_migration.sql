-- Google Drive import fields for session_videos
-- Run once against the production Supabase project (yuyxfxoevztugtfgduks)

ALTER TABLE session_videos
  ADD COLUMN IF NOT EXISTS drive_file_id      TEXT,          -- Google Drive file ID; set during Drive import, null for browser uploads
  ADD COLUMN IF NOT EXISTS drive_access_token TEXT,          -- ephemeral OAuth token; cleared by worker after import completes
  ADD COLUMN IF NOT EXISTS bytes_transferred  BIGINT;        -- worker updates this as each chunk lands; used for progress display
