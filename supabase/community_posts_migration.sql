-- Community posts table for Event Pilot
-- Run in Supabase SQL Editor (yuyxfxoevztugtfgduks)

CREATE TABLE IF NOT EXISTS community_posts (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id     TEXT         NOT NULL,
  staff_name   TEXT         NOT NULL,
  department   TEXT,
  category     TEXT         NOT NULL CHECK (category IN ('prompt', 'use_case', 'automation', 'tip')),
  title        TEXT         NOT NULL,
  body         TEXT         NOT NULL,
  tool_name    TEXT,
  likes        INT          DEFAULT 0,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_posts_dept_idx ON community_posts (department);
CREATE INDEX IF NOT EXISTS community_posts_category_idx ON community_posts (category);
CREATE INDEX IF NOT EXISTS community_posts_created_idx ON community_posts (created_at DESC);

-- community_likes to prevent double-liking
CREATE TABLE IF NOT EXISTS community_likes (
  post_id    UUID  NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  staff_id   TEXT  NOT NULL,
  PRIMARY KEY (post_id, staff_id)
);

-- Helper RPCs for atomic like counters
CREATE OR REPLACE FUNCTION increment_community_likes(p_post_id UUID)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE community_posts SET likes = likes + 1 WHERE id = p_post_id;
$$;

CREATE OR REPLACE FUNCTION decrement_community_likes(p_post_id UUID)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE community_posts SET likes = GREATEST(0, likes - 1) WHERE id = p_post_id;
$$;
