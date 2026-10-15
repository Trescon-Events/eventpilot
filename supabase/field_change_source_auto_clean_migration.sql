-- 2026-10-15: the setup gate now cleans invisible characters / stray spaces from event text fields itself (lossless) and logs it as
-- change_source 'auto_clean'. Widens the CHECK from event_details_page.sql.
ALTER TABLE event_details_field_changes DROP CONSTRAINT IF EXISTS event_details_field_changes_change_source_check;
ALTER TABLE event_details_field_changes ADD CONSTRAINT event_details_field_changes_change_source_check
  CHECK (change_source IN ('manual', 'ai_extraction', 'auto_clean'));
