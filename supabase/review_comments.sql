-- Review comment trail — every admin response and status change logged here
-- Run in Supabase SQL Editor (yuyxfxoevztugtfgduks)

CREATE TABLE IF NOT EXISTS review_comments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id        uuid        NOT NULL REFERENCES platform_reviews(id) ON DELETE CASCADE,
  author_type      text        NOT NULL CHECK (author_type IN ('admin', 'staff')),
  author_name      text        NOT NULL,
  message          text,                        -- null for status-only changes
  is_status_change boolean     NOT NULL DEFAULT false,
  new_status       text,                        -- populated when is_status_change = true
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_comments_review ON review_comments(review_id, created_at ASC);

-- Add review_id to notifications so the dashboard can link back to the review
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS review_id uuid REFERENCES platform_reviews(id) ON DELETE SET NULL;
