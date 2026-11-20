-- Title Card Config v2 (2026-11-21)
-- Replaces title_card_layout_variant_id + title_card_speaker_settings with a
-- single code-driven config column. Old columns left in place but inert.
ALTER TABLE event_thumbnail_settings
  ADD COLUMN IF NOT EXISTS title_card_config JSONB;
