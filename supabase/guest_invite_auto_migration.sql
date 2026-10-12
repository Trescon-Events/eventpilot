-- Auto-create guest-pass codes on KonfHub (2026-10-12). Per-event settings + per-speaker proposal/error. Apply by hand via psql.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS guest_invite_ticket_id INT,
  ADD COLUMN IF NOT EXISTS guest_invite_default_limit INT,
  ADD COLUMN IF NOT EXISTS guest_invite_auto_mode TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS konfhub_event_slug TEXT;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_guest_invite_auto_mode_check;
ALTER TABLE events ADD CONSTRAINT events_guest_invite_auto_mode_check CHECK (guest_invite_auto_mode IN ('off', 'review', 'auto'));
ALTER TABLE event_speakers
  ADD COLUMN IF NOT EXISTS guest_invite_proposed_code TEXT,
  ADD COLUMN IF NOT EXISTS guest_invite_provision_error TEXT;
