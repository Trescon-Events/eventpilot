-- Step B: video kit, cues, render columns, extended job kinds
-- Run via: supabase db push --linked

CREATE TABLE IF NOT EXISTS event_video_kit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  intro_path TEXT,
  outro_path TEXT,
  music_path TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID,
  UNIQUE(event_id)
);

CREATE TABLE IF NOT EXISTS session_video_cues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_video_id UUID NOT NULL REFERENCES session_videos(id) ON DELETE CASCADE,
  speaker_id UUID NOT NULL REFERENCES event_speakers(id),
  start_s NUMERIC(10,3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

ALTER TABLE session_videos
  ADD COLUMN IF NOT EXISTS render_path TEXT,
  ADD COLUMN IF NOT EXISTS preview_path TEXT,
  ADD COLUMN IF NOT EXISTS render_status TEXT CHECK (render_status IN ('pending', 'preview_rendering', 'preview_done', 'rendering', 'done', 'failed')) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS render_error TEXT,
  ADD COLUMN IF NOT EXISTS cues_fingerprint TEXT;

ALTER TABLE video_jobs DROP CONSTRAINT IF EXISTS video_jobs_kind_check;
ALTER TABLE video_jobs ADD CONSTRAINT video_jobs_kind_check
  CHECK (kind IN ('drive_import', 'ingest', 'transcribe', 'identify', 'text_pack', 'render_preview', 'render'));
