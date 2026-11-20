-- Step A: title cards and lower thirds (docs/build_suggestions/session-video-finish-and-publish.md, 19 Nov 2026)
--
--  * Extends event_thumbnail_settings with title card and lower-third variant selection
--  * Extends session_thumbnails with title card columns (image stored alongside the thumbnail; approved together)
--  * session_lower_thirds: one row per agenda session × speaker — still PNG, ProRes 4444 MOV, H.264 preview
--  * creative_render_jobs: worker queue for lower-third MOV generation
--
-- Safe to re-run (all IF NOT EXISTS). Run via psql session-pooler connection. Madhu runs this.

BEGIN;

-- 1. Title-card and lower-third variant selection on the thumbnail settings row
ALTER TABLE event_thumbnail_settings
  ADD COLUMN IF NOT EXISTS title_card_layout_variant_id  TEXT,
  ADD COLUMN IF NOT EXISTS title_card_card_variant_id    TEXT,
  ADD COLUMN IF NOT EXISTS lower_third_variant_id        TEXT;

-- 2. Title-card image stored on the existing session_thumbnails row (one row already exists per session)
ALTER TABLE session_thumbnails
  ADD COLUMN IF NOT EXISTS title_card_png_path           TEXT,
  ADD COLUMN IF NOT EXISTS title_card_fingerprint        TEXT;

-- 3. Lower-thirds: one row per session × speaker
CREATE TABLE IF NOT EXISTS session_lower_thirds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  agenda_session_id UUID NOT NULL REFERENCES event_agenda_sessions(id) ON DELETE CASCADE,
  speaker_id        UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  variant_id        TEXT,
  fingerprint       TEXT,
  still_path        TEXT,     -- R2 key for the hold-frame PNG (private bucket)
  mov_path          TEXT,     -- R2 key for the ProRes 4444 alpha MOV
  preview_path      TEXT,     -- R2 key for the H.264 MP4 preview
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'generated')),
  generated_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agenda_session_id, speaker_id)
);
CREATE INDEX IF NOT EXISTS idx_session_lower_thirds_event ON session_lower_thirds (event_id);
CREATE INDEX IF NOT EXISTS idx_session_lower_thirds_session ON session_lower_thirds (agenda_session_id);

-- 4. Creative render jobs queue (lower_third and future kinds)
CREATE TABLE IF NOT EXISTS creative_render_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  agenda_session_id UUID REFERENCES event_agenda_sessions(id) ON DELETE CASCADE,
  speaker_id        UUID REFERENCES event_speakers(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('lower_third')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  params            JSONB NOT NULL DEFAULT '{}',
  claimed_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creative_render_jobs_pending ON creative_render_jobs (status, created_at) WHERE status = 'pending';

-- RLS: app reads/writes through the service role only
ALTER TABLE session_lower_thirds ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_render_jobs  ENABLE ROW LEVEL SECURITY;

COMMIT;
