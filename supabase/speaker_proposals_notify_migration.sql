-- Speaker Proposals (2026-10-24): who started the research, and when the producer was last told "these speakers need your input" — drives the finished-email and the daily reminder.
ALTER TABLE speaker_proposal_batches
  ADD COLUMN IF NOT EXISTS researcher_sid text,
  ADD COLUMN IF NOT EXISTS needs_input_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_input_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_input_reminders int NOT NULL DEFAULT 0;
