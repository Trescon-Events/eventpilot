-- ============================================================
-- ACCESS REQUESTS — dashboard-backed inbox for tool grants
-- Persists every "Request access" click from /no-access so admins
-- can see, grant, or deny them in-app instead of only via email.
-- Supports time-boxed grants that auto-revoke on expiry.
-- ============================================================

CREATE TABLE IF NOT EXISTS access_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  tool_key       TEXT NOT NULL,           -- 'bespoke', 'finance', 'admin', 'corporate_marketing', etc.
  from_path      TEXT,                    -- the URL they tried to reach
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','granted','denied','expired','revoked')),
  handled_by     UUID REFERENCES staff_members(id),
  handled_at     TIMESTAMPTZ,
  note           TEXT,                     -- optional reason / task context

  -- Time-boxed access
  granted_until  TIMESTAMPTZ,              -- NULL = permanent grant; otherwise auto-revokes at this time
  revoked_at     TIMESTAMPTZ,              -- when the tool_grant / access_role was actually reversed
  revoked_reason TEXT                       -- 'expired' | 'manual' | 'denied_after_grant'
);

-- Fast lookups by status (dashboard filter) + by staff (history per person)
CREATE INDEX IF NOT EXISTS idx_access_requests_status
  ON access_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_staff
  ON access_requests(staff_id, requested_at DESC);

-- Cron-friendly index: find all grants that need to expire
CREATE INDEX IF NOT EXISTS idx_access_requests_expiring
  ON access_requests(granted_until)
  WHERE status = 'granted' AND granted_until IS NOT NULL;

-- Only one pending request per (staff_id, tool_key) so repeated clicks
-- from /no-access don't spam the dashboard. Grant/deny/expire history
-- rows stay distinct.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_access_requests_pending
  ON access_requests(staff_id, tool_key)
  WHERE status = 'pending';
