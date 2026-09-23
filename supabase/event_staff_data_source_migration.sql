-- event_staff data_source tag (2026-09-23) — distinguishes rows created by
-- the Staff Portal sync from rows added manually via EventPilot's own
-- "Staff" panel (app/admin/page.tsx, POST /api/events/staff), so the sync
-- can safely reconcile (remove) rows that fell out of Staff Portal's
-- current assignments/allocations snapshot without ever touching a manual
-- entry. Mirrors the same auto_granted-flag pattern already used for
-- event_access_assignments in app/lib/hrms/apply-role-access-map.ts.
--
-- Existing rows are left NULL (unknown origin) rather than backfilled —
-- the next sync run will correctly re-tag every row it touches as
-- 'staff_portal' on its own; rows it doesn't touch stay untouched and are
-- never considered for reconciliation deletion.

alter table event_staff
  add column if not exists data_source text;
