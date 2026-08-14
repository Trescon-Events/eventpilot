-- ============================================================
-- EVENTS.STATUS — add 'on_hold' (2026-08-13)
-- Staff Portal's project Status field has 5 values: Planning, Active, On
-- Hold, Completed, Cancelled. The HRMS sync's STATUS_MAP previously
-- collapsed 'on_hold' into 'planning', silently losing that distinction —
-- fixed in app/api/hrms-sync/route.ts and app/api/cron/hrms-sync/route.ts,
-- which needs this constraint updated to actually allow the value.
-- Preserves every other currently-allowed status (the RACI phase-flow
-- values concept/research/sales/delivery/closed included) — only adding
-- on_hold, not narrowing anything.
-- ============================================================

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status = ANY (ARRAY['concept','research','planning','sales','delivery','completed','closed','active','cancelled','on_hold']));
