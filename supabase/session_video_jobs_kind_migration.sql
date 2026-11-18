-- Add 'drive_import' to the video_jobs kind check constraint
ALTER TABLE video_jobs DROP CONSTRAINT IF EXISTS video_jobs_kind_check;
ALTER TABLE video_jobs ADD CONSTRAINT video_jobs_kind_check CHECK (kind IN ('drive_import', 'ingest', 'transcribe', 'text_pack'));
