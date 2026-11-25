-- Lower Thirds tab: one config-driven lower-third template per event (background PNG, fonts, text styles, slide/fade timing).
-- When lower_third_config.background_url is set it replaces the older hand-built "Lower Third" variant.
ALTER TABLE event_thumbnail_settings ADD COLUMN IF NOT EXISTS lower_third_config JSONB;
