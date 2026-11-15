-- Session thumbnails (docs/build_suggestions/session-thumbnails.md, 15 Nov 2026): one YouTube thumbnail per agenda session, built from the agenda and speaker records.
--
--  * event_thumbnail_settings   per event: which card template, which three layout templates, and whether cards show the name only or name and company
--  * session_thumbnails         one row per agenda session: the producer's overrides, the generated PNG / JPG, the fingerprint it was drawn from, approval
--  * session_thumbnail_changes  audit of every settings / override / generate / approve change: who, when, before, after
--
-- Additive only: nothing existing is changed. Images live in the same storage as the Stage Screens PNGs; only the URLs are stored here.
-- Run by hand through the session-pooler psql connection. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS event_thumbnail_settings (
  event_id           UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  card_variant_id    TEXT,
  layout_variant_ids JSONB NOT NULL DEFAULT '{}',
  card_text          TEXT NOT NULL DEFAULT 'name' CHECK (card_text IN ('name', 'name_company')),
  updated_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_thumbnails (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  agenda_session_id UUID NOT NULL UNIQUE REFERENCES event_agenda_sessions(id) ON DELETE CASCADE,
  overrides         JSONB NOT NULL DEFAULT '{}',
  fingerprint       TEXT,
  image_png_path    TEXT,
  image_jpg_path    TEXT,
  width             INTEGER,
  height            INTEGER,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'approved')),
  warnings          JSONB NOT NULL DEFAULT '[]',
  generated_by      UUID,
  generated_at      TIMESTAMPTZ,
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_thumbnails_event ON session_thumbnails (event_id);

CREATE TABLE IF NOT EXISTS session_thumbnail_changes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID,
  agenda_session_id UUID,
  action            TEXT NOT NULL,
  before            JSONB,
  after             JSONB,
  changed_by        UUID,
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_thumbnail_changes_event ON session_thumbnail_changes (event_id, changed_at DESC);

-- Row level security: the app reads and writes through the service role only (same as the Copy Library and public figures tables).
ALTER TABLE event_thumbnail_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_thumbnails ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_thumbnail_changes ENABLE ROW LEVEL SECURITY;

COMMIT;
