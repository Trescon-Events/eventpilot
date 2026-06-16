-- Internal Messaging System for Event Pilot
-- Run in Supabase SQL Editor (yuyxfxoevztugtfgduks)

CREATE TABLE IF NOT EXISTS messages (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id     TEXT        NOT NULL,
  from_name   TEXT        NOT NULL,
  to_id       TEXT        NOT NULL,
  to_name     TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  read        BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Fast queries: inbox (all messages for a user), thread (between two users)
CREATE INDEX IF NOT EXISTS messages_to_idx     ON messages (to_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_from_idx   ON messages (from_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (LEAST(from_id, to_id), GREATEST(from_id, to_id), created_at ASC);

-- Add from_staff_id to notifications so the bell can link to the message thread
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS from_staff_id TEXT;
