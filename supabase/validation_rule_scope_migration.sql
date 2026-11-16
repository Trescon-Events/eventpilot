-- Rule scope (16 Nov 2026): where a rule applies.
--   all        every check (the default: every existing rule keeps behaving exactly as before)
--   social     social posts and announcements only (SAE, short Copy Library items)
--   long_form  long-form copy only (press releases, press release ending, organiser line, long about/recap/figures, YouTube footer, KonfHub description)
-- Additive and safe to run before the new code is deployed: old code ignores the column.
BEGIN;
ALTER TABLE event_validation_rules ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all';
ALTER TABLE event_validation_rules DROP CONSTRAINT IF EXISTS event_validation_rules_scope_check;
ALTER TABLE event_validation_rules ADD CONSTRAINT event_validation_rules_scope_check CHECK (scope IN ('all', 'social', 'long_form'));
COMMIT;
