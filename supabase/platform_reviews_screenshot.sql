-- Add screenshot_url column to platform_reviews (safe to run multiple times)
ALTER TABLE platform_reviews ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
