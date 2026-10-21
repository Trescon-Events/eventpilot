-- Client approval for speaker badges (2026-10-21, Madhu): for chosen events (all DFFW events) the producer reviews the badge artwork, then SENDS THE
-- BATCH TO THE CLIENT; the client opens a private link (no login), looks through a gallery of every badge, comments on or rejects individual badges
-- and approves. ANY ONE of the client's approvers is enough (first responder settles it; the others then see who acted and a read-only summary).
-- A rejected speaker is left out of the print file. Settings and contacts live once per UMBRELLA, with an optional per-event override.
-- Additive only.

BEGIN;

-- Setting. Umbrella: on/off. Event: NULL = follow the umbrella, true/false = this event decides for itself.
ALTER TABLE event_umbrellas ADD COLUMN IF NOT EXISTS badge_client_approval BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE events          ADD COLUMN IF NOT EXISTS badge_client_approval BOOLEAN;

-- Who approves (client side). Owner is an umbrella (shared by its events) or, for a standalone / overriding event, the event itself.
CREATE TABLE IF NOT EXISTS badge_approval_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT badge_approval_contacts_one_owner CHECK ((event_id IS NOT NULL) <> (umbrella_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_approval_contacts_event    ON badge_approval_contacts(event_id, lower(email))    WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_approval_contacts_umbrella ON badge_approval_contacts(umbrella_id, lower(email)) WHERE umbrella_id IS NOT NULL;

-- One approval round per send of a batch. At most one pending round per batch; a resolved or withdrawn round stays as the record.
CREATE TABLE IF NOT EXISTS badge_approval_rounds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID NOT NULL REFERENCES badge_batches(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'approved_with_comments', 'withdrawn')),
  message             TEXT,                                   -- the producer's note to the client
  badges              INTEGER NOT NULL,                       -- how many badges were sent
  sent_by             UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  sent_by_name        TEXT,
  sent_by_email       TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ,
  resolved_by_name    TEXT,                                   -- whoever acted first
  resolved_by_email   TEXT,
  rejected_count      INTEGER NOT NULL DEFAULT 0,
  comment_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_badge_approval_rounds_batch ON badge_approval_rounds(batch_id, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_approval_rounds_one_pending ON badge_approval_rounds(batch_id) WHERE status = 'pending';

-- One row per person the round went to, each with their own private link.
CREATE TABLE IF NOT EXISTS badge_approval_recipients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         UUID NOT NULL REFERENCES badge_approval_rounds(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  token            TEXT NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  notified_at      TIMESTAMPTZ,
  reminder_count   INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  last_opened_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_badge_approval_recipients_round ON badge_approval_recipients(round_id);

-- A recipient's per-badge comment / rejection, saved as they go (so closing the tab loses nothing). Only the person who acts first settles the round;
-- their decisions are copied onto the batch items at that moment.
CREATE TABLE IF NOT EXISTS badge_approval_decisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     UUID NOT NULL REFERENCES badge_approval_rounds(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES badge_approval_recipients(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES badge_batch_items(id) ON DELETE CASCADE,
  comment      TEXT,
  rejected     BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT badge_approval_decisions_unique UNIQUE (recipient_id, item_id)
);

-- What the client decided, on the badge itself, once the round is settled (a rejected badge also gets removed = true, so every existing
-- screen and the print file already leave it out).
ALTER TABLE badge_batch_items ADD COLUMN IF NOT EXISTS client_rejected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE badge_batch_items ADD COLUMN IF NOT EXISTS client_comment  TEXT;

COMMIT;
