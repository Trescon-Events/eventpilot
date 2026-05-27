-- Social accounts per event
CREATE TABLE IF NOT EXISTS event_social_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('Facebook', 'Instagram', 'LinkedIn')),
  page_name    text,
  page_url     text,
  page_id      text,
  access_token text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (event_id, platform)
);

-- Track publish attempts per post
ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS published_at  timestamptz,
  ADD COLUMN IF NOT EXISTS publish_error text,
  ADD COLUMN IF NOT EXISTS external_post_id text;
