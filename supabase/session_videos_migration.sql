-- Session video pipeline, Phase 1 (docs/build_suggestions/session-video-pipeline.md, trial on DFS 2026): upload -> transcript -> name the voices -> titles, description, chapters, tags.
--
--  * session_videos             one per uploaded MP4: where the original and the proxy / audio copies are, the matched agenda session, and how far it has got
--  * video_jobs                 the worker's queue (ingest, transcribe, text_pack): status, attempts, error, log
--  * session_video_transcripts  the transcript segments and the voices (which speaker each voice is)
--  * session_video_text         titles, working and approved description, chapters, tags and the rule findings
--
-- Additive only: nothing existing is changed. Nothing here publishes anything. Original footage is never modified (the original object is only ever read).
-- Run by hand through the session-pooler psql connection. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS session_videos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  agenda_session_id   UUID REFERENCES event_agenda_sessions(id) ON DELETE SET NULL,
  source              TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'sharepoint')),
  source_ref          TEXT,                 -- the original file name (or the SharePoint item, later)
  content_type        TEXT,
  size_bytes          BIGINT,
  original_path       TEXT,                 -- object key of the original (read-only)
  proxy_path          TEXT,                 -- 720p copy for preview and analysis
  audio_path          TEXT,                 -- mono audio for transcription
  duration_s          NUMERIC,
  upload_id           TEXT,                 -- the multipart upload id while the browser is still sending parts
  status              TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'uploaded', 'ingesting', 'ingested', 'transcribing', 'transcribed', 'text_pending', 'ready', 'approved', 'failed')),
  error               TEXT,
  match_suggestions   JSONB,                -- [{ session_id, title, score }] from the file name
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_videos_event ON session_videos (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_video_id  UUID NOT NULL REFERENCES session_videos(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('ingest', 'transcribe', 'text_pack')),
  status            TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  log               JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_jobs_queue ON video_jobs (status, created_at) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_video_jobs_video ON video_jobs (session_video_id, created_at DESC);

CREATE TABLE IF NOT EXISTS session_video_transcripts (
  session_video_id  UUID PRIMARY KEY REFERENCES session_videos(id) ON DELETE CASCADE,
  segments          JSONB NOT NULL DEFAULT '[]',   -- [{ start, end, voice_id, text }]
  voices            JSONB NOT NULL DEFAULT '[]',   -- [{ voice_id, speaker_id, rejected }]
  model             TEXT,
  voices_named_at   TIMESTAMPTZ,
  voices_named_by   UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_video_text (
  session_video_id      UUID PRIMARY KEY REFERENCES session_videos(id) ON DELETE CASCADE,
  titles                JSONB NOT NULL DEFAULT '[]',
  selected_title        TEXT,
  description_working   TEXT,
  description_approved  TEXT,
  chapters              JSONB NOT NULL DEFAULT '[]',   -- [{ start_s, title }]
  tags                  JSONB NOT NULL DEFAULT '[]',
  findings              JSONB NOT NULL DEFAULT '{}',   -- { titles: [...], description: [...], event_figures: [...] }
  footer_item_id        UUID,
  footer_version        INTEGER,
  model                 TEXT,
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
