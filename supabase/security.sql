-- Security Layer: login audit + brute force protection
-- Run this in Supabase SQL Editor before deploying

CREATE TABLE IF NOT EXISTS login_attempts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text        NOT NULL,
  ip           text,
  success      boolean     NOT NULL DEFAULT false,
  reason       text,       -- ok | wrong_password | not_found | account_disabled | rate_limited | ip_blocked | super_admin_ok
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time       ON login_attempts(attempted_at DESC);

-- Auto-purge attempts older than 90 days (keeps table lean)
-- Run as a cron or manually: DELETE FROM login_attempts WHERE attempted_at < now() - interval '90 days';
