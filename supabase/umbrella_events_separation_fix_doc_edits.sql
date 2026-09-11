-- Follow-up to umbrella_events_separation_migration.sql (2026-09-11) —
-- event_messaging_doc_edits.event_id was NOT NULL with a real FK to
-- events(id), missed in the first pass. Editing a section on an
-- umbrella-owned document (e.g. the DIFC style guide) would fail this
-- constraint outright. Same dual-ownership treatment as
-- event_messaging_docs/event_validation_rules.
ALTER TABLE event_messaging_doc_edits ADD COLUMN IF NOT EXISTS umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE;
ALTER TABLE event_messaging_doc_edits ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE event_messaging_doc_edits ADD CONSTRAINT event_messaging_doc_edits_owner_check
  CHECK ((event_id IS NOT NULL) <> (umbrella_id IS NOT NULL));
