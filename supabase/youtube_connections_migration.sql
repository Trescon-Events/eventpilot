-- Session video Step C — YouTube channel connections.
-- One row = one connected YouTube CHANNEL (a Google login can own several channels; connect again and pick another).
-- Refresh tokens are AES-256-GCM encrypted (app/lib/security/token-crypto.ts); never stored in plaintext.
CREATE TABLE IF NOT EXISTS youtube_connections (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id             TEXT NOT NULL UNIQUE,
  channel_title          TEXT NOT NULL,
  channel_handle         TEXT,
  channel_thumbnail_url  TEXT,
  google_email           TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  scopes                 TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect')),
  connected_by           UUID,
  connected_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which connected channel an event's session videos upload to (one per event; many events may share a channel).
CREATE TABLE IF NOT EXISTS event_youtube_channel (
  event_id         UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  connection_id    UUID NOT NULL REFERENCES youtube_connections(id) ON DELETE CASCADE,
  default_privacy  TEXT NOT NULL DEFAULT 'private' CHECK (default_privacy IN ('private', 'unlisted', 'public')),
  updated_by       UUID,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
