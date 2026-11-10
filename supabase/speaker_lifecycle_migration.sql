-- Speaker lifecycle (2026-11-10)
--
-- Why: when a speaker backed off, the only option was Delete, which archives the record with no reason, so we cannot tell a withdrawal from a
-- test record or a duplicate, and nothing records who spoke. This adds the lifecycle the post-event analysis needs, without removing anything.
--
--  * confirmation_status gains No-show and Spoke; 'Cancelled' is renamed 'Withdrew' (existing rows are migrated).
--  * withdrawal_reason / withdrawal_note / withdrawn_at say why and when a speaker withdrew.
--  * delete_reason says why a record was deleted (test / duplicate / mistake). A deleted record with no reason has not been classified yet.
--  * planned_roles: what the speaker was invited to do (keynote, panelist, moderator, ...), set at invite time, used for the role statistics.
--  * speaker_lifecycle_changes: an audit trail of every status change (who, when, from, to, why), so we can report when people withdrew.
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

ALTER TABLE event_speakers DROP CONSTRAINT IF EXISTS event_speakers_confirmation_status_check;
UPDATE event_speakers SET confirmation_status = 'Withdrew' WHERE confirmation_status = 'Cancelled';
ALTER TABLE event_speakers ADD CONSTRAINT event_speakers_confirmation_status_check
  CHECK (confirmation_status IS NULL OR confirmation_status = ANY (ARRAY[
    'New Confirmed', 'Reconfirmed', 'Confirmed', 'On Hold', 'Withdrew', 'No-show', 'Spoke'
  ]));

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS withdrawal_note   TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS withdrawn_at      TIMESTAMPTZ;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS delete_reason     TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS planned_roles     TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE event_speakers DROP CONSTRAINT IF EXISTS event_speakers_withdrawal_reason_check;
ALTER TABLE event_speakers ADD CONSTRAINT event_speakers_withdrawal_reason_check
  CHECK (withdrawal_reason IS NULL OR withdrawal_reason = ANY (ARRAY['schedule_clash', 'company_decision', 'replaced', 'no_response', 'other']));
ALTER TABLE event_speakers DROP CONSTRAINT IF EXISTS event_speakers_delete_reason_check;
ALTER TABLE event_speakers ADD CONSTRAINT event_speakers_delete_reason_check
  CHECK (delete_reason IS NULL OR delete_reason = ANY (ARRAY['test', 'duplicate', 'mistake']));

CREATE TABLE IF NOT EXISTS speaker_lifecycle_changes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id   UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT,
  reason       TEXT,
  note         TEXT,
  source       TEXT NOT NULL DEFAULT 'manual',   -- manual | post_event_bulk | cleanup | delete
  changed_by   TEXT,                              -- staff id, or 'super-admin'
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_speaker_lifecycle_changes_event   ON speaker_lifecycle_changes(event_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_speaker_lifecycle_changes_speaker ON speaker_lifecycle_changes(speaker_id, changed_at);

COMMIT;
