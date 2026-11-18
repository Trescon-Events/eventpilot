-- Phase 2: voice clips and face-detection suggestions on the transcript
ALTER TABLE session_video_transcripts
  ADD COLUMN IF NOT EXISTS voice_clips      JSONB DEFAULT '{}',   -- { 'Voice A': 'session-videos/eid/vid/clips/voice_a.mp4', ... }
  ADD COLUMN IF NOT EXISTS voice_suggestions JSONB DEFAULT '[]';  -- [{ voice_id, suggested_speaker_id, confidence }]

-- add 'identify' job kind
ALTER TABLE video_jobs DROP CONSTRAINT IF EXISTS video_jobs_kind_check;
ALTER TABLE video_jobs ADD CONSTRAINT video_jobs_kind_check
  CHECK (kind IN ('drive_import', 'ingest', 'transcribe', 'identify', 'text_pack'));
