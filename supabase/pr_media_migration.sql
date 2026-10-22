-- PR & Media (2026-10-21, Madhu): producers ask chosen speakers whether they will give media bites / interviews at the event and when they are free.
-- The speaker answers on a private link (no login); the event's PR person is notified and works from the PR & Media workspace.
-- Availability is a set of WINDOWS (e.g. 09:00-12:00), not bookings: the on-site media team arranges as many interviews as it can inside them.
-- Additive only.

BEGIN;

-- Who the PR person(s) for an event are (1-2). They get the notification and are introduced to the speaker on the thank-you screen.
CREATE TABLE IF NOT EXISTS event_pr_contacts (
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id    UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, staff_id)
);

-- The days and hours the form offers. Owned by the PR person; times are the event's local wall clock (events.timezone).
CREATE TABLE IF NOT EXISTS event_media_days (
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  open_time  TEXT NOT NULL CHECK (open_time  ~ '^[0-2][0-9]:[0-5][0-9]$'),
  close_time TEXT NOT NULL CHECK (close_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  PRIMARY KEY (event_id, day)
);

-- One row per event: the line shown to speakers about who contacts them, and whether the PR person has confirmed the days (sending waits for that).
CREATE TABLE IF NOT EXISTS event_pr_settings (
  event_id        UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  intro           TEXT,
  days_confirmed_at TIMESTAMPTZ,
  updated_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One request per speaker per event, with its own private link.
CREATE TABLE IF NOT EXISTS media_interest_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id       UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'interested', 'declined')),
  windows          JSONB NOT NULL DEFAULT '[]'::jsonb,       -- [{ "date": "2026-11-02", "from": "09:00", "to": "12:00" }]
  note             TEXT,                                      -- the speaker's note (topics, languages, limits)
  pr_note          TEXT,                                      -- PR's own running note ("interview with X at 11:30")
  sent_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at     TIMESTAMPTZ,
  last_opened_at   TIMESTAMPTZ,
  reminder_count   INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_interest_one_per_speaker ON media_interest_requests(event_id, speaker_id);
CREATE INDEX IF NOT EXISTS idx_media_interest_event ON media_interest_requests(event_id, status);

-- The request email (editable text; the producer sends it as themselves).
INSERT INTO email_templates (slug, name, category, description, subject, body_html, variable_hints, sender_name, sender_email, is_active)
VALUES (
  'media_interest_request',
  'Media Interview Interest Request',
  'sae',
  'Asks a speaker whether they would give media bites or interviews at the event, with a personal link to say when they are free.',
  'Media interviews at {{event_name}} — are you open to it?',
  '<p>Dear {{speaker_name}},</p>
<p>Several media houses and journalists will be attending {{event_name}}, and many of them would be glad to speak with our speakers for short bites or interviews.</p>
<p>If you are open to it, please let us know which days and times suit you. It takes about a minute, and you can change your answer later.</p>
{{extra_note}}
<p><a href="{{link}}">Share your availability &rarr;</a></p>
<p>Our PR team will coordinate with you directly, so you will not need to arrange anything yourself.</p>
<p>Best regards,<br/>{{producer_name}}</p>',
  '[{"key":"speaker_name","label":"Speaker Name"},{"key":"event_name","label":"Event Name"},{"key":"link","label":"Link"},{"key":"extra_note","label":"Extra note"},{"key":"producer_name","label":"Producer/Sender Name"}]'::jsonb,
  'Madhukar Dudda',
  'md@tresconglobal.com',
  true
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
