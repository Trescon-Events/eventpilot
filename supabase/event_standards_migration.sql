-- Event Standards column for event_brand_guidelines
-- Run in Supabase SQL Editor (yuyxfxoevztugtfgduks)
-- Adds a JSONB column to store date/venue/tagline formatting rules

ALTER TABLE event_brand_guidelines
  ADD COLUMN IF NOT EXISTS event_standards JSONB;
