-- event_speakers.dial_code must only hold a value someone (or a form
-- submission) supplied; the old '+971' column default silently filled it.
-- Existing rows are left as they are.
ALTER TABLE event_speakers ALTER COLUMN dial_code DROP DEFAULT;
