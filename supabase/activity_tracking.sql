-- Activity Tracking: active sessions + login history linkage
-- Run in Supabase SQL Editor (yuyxfxoevztugtfgduks)

-- ── Active Sessions ────────────────────────────────────────────────────────
-- One row per logged-in user. Heartbeat updates last_seen_at every 60s.
-- "Online" = last_seen_at within last 5 minutes.
CREATE TABLE IF NOT EXISTS active_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid        NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  ip           text,
  user_agent   text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- One active record per user (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_sessions_staff    ON active_sessions(staff_id);
CREATE        INDEX IF NOT EXISTS idx_active_sessions_last_seen ON active_sessions(last_seen_at DESC);

-- ── Link login_attempts to staff records ───────────────────────────────────
-- Allows per-user login history queries without email joins
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff_members(id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_staff ON login_attempts(staff_id, attempted_at DESC);

-- ── Feature Activity Log ───────────────────────────────────────────────────
-- Lightweight log of which platform modules each staff member accesses.
CREATE TABLE IF NOT EXISTS feature_activity (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid        NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  feature    text        NOT NULL,  -- e.g. 'hr_portal', 'events', 'smart_data', 'dashboard'
  page       text,                  -- optional sub-page
  accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feature_activity_staff ON feature_activity(staff_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_activity_time  ON feature_activity(accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_activity_feat  ON feature_activity(feature, accessed_at DESC);

-- Auto-purge feature activity older than 90 days (keep table lean)
-- Run as a monthly job:
-- DELETE FROM feature_activity WHERE accessed_at < now() - interval '90 days';
