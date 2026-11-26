-- Cue scan: the worker looks at a frame for every candidate cue moment and asks Gemini who is on screen,
-- so lower thirds land on moments where that speaker is actually visible.
ALTER TABLE video_jobs DROP CONSTRAINT IF EXISTS video_jobs_kind_check;
ALTER TABLE video_jobs ADD CONSTRAINT video_jobs_kind_check
  CHECK (kind IN ('drive_import', 'ingest', 'transcribe', 'identify', 'text_pack', 'render_preview', 'render', 'cue_scan'));
ALTER TABLE session_videos
  ADD COLUMN IF NOT EXISTS cue_candidates JSONB,
  ADD COLUMN IF NOT EXISTS cue_scan_status TEXT,
  ADD COLUMN IF NOT EXISTS cue_scan_error TEXT;
