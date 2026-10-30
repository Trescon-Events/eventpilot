-- When a badge batch is deleted, its approval links die with it. This keeps a small note per link so a client who opens it later is told what happened instead of "invalid".
CREATE TABLE IF NOT EXISTS badge_approval_closed_links (
  token        text PRIMARY KEY,
  batch_name   text,
  event_name   text,
  sent_by_name text,
  reason       text NOT NULL DEFAULT 'batch_deleted',
  closed_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE badge_approval_closed_links ENABLE ROW LEVEL SECURITY;
