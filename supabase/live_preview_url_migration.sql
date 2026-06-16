-- Add live_preview_url to site_templates
-- Run in Supabase SQL Editor (yuyxfxoevztugtfgduks)
-- Stores the public URL of the live demo for each template

ALTER TABLE site_templates
  ADD COLUMN IF NOT EXISTS live_preview_url TEXT;
