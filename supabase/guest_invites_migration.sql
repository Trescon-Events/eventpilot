-- Speaker guest invites (2026-10-06): each speaker gets a unique KonfHub
-- registration link (a code with a cap, created by the delegate team) to share
-- with their own guests. EventPilot stores the link, sends the invite and a
-- usage-aware reminder as the producer, and counts how many guests have
-- registered by reading KonfHub's attendee list (coupon_code per registration).
-- It never creates or edits codes on KonfHub. Additive only.
BEGIN;

-- Per-event settings (defaults match FIFF 2026; deadline is set per event)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS guest_invite_pass_name text NOT NULL DEFAULT 'Conference Pass',
  ADD COLUMN IF NOT EXISTS guest_invite_cap       integer NOT NULL DEFAULT 5 CHECK (guest_invite_cap >= 0),
  ADD COLUMN IF NOT EXISTS guest_invite_deadline  date;

-- Per-speaker link + tracking
ALTER TABLE event_speakers
  ADD COLUMN IF NOT EXISTS guest_invite_url                 text,
  ADD COLUMN IF NOT EXISTS guest_invite_code                text,   -- upper-cased code parsed from the link (selectedCode)
  ADD COLUMN IF NOT EXISTS guest_invite_cap                 integer CHECK (guest_invite_cap IS NULL OR guest_invite_cap >= 0), -- NULL = the event's default
  ADD COLUMN IF NOT EXISTS guest_invite_used                integer,
  ADD COLUMN IF NOT EXISTS guest_invite_usage_checked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS guest_invite_sent_at             timestamptz,
  ADD COLUMN IF NOT EXISTS guest_invite_sent_count          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guest_invite_reminder_sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS guest_invite_reminder_count      integer NOT NULL DEFAULT 0;
-- one code = one speaker within an event
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_speakers_guest_code ON event_speakers (event_id, guest_invite_code) WHERE guest_invite_code IS NOT NULL;

-- Event-scoped email templates (generated from Event Details + the Messaging Doc)
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS kind     text CHECK (kind IS NULL OR kind IN ('guest_invite', 'guest_invite_reminder'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_templates_event_kind ON email_templates (event_id, kind) WHERE event_id IS NOT NULL;

COMMIT;
