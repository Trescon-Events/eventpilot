-- Operations > Speaker Documents: reminders an ops person sends to a speaker's producer about missing / unreviewed
-- Passport & National ID. One row per speaker per reminder, so the screen can show "last reminded" and avoid nagging.
CREATE TABLE IF NOT EXISTS ops_document_reminders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id         UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  producer_staff_id  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  sent_by_staff_id   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  sent_from          TEXT NOT NULL,            -- the mailbox it went out from (the assigned ops person, or noreply)
  missing            TEXT[] NOT NULL,          -- 'passport' | 'national_id'
  sent_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_doc_reminders_speaker ON ops_document_reminders(speaker_id, sent_at DESC);
ALTER TABLE ops_document_reminders ENABLE ROW LEVEL SECURITY;
