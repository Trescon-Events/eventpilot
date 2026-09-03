-- Producer / Reference / Confirmation Status on event_speakers (2026-09-03)
--
-- Built for DFS, where — unlike Malaysia's single-producer setup — multiple
-- Trescon producers each own a distinct subset of the speaker roster.
--
-- producer_staff_id: the one Trescon staff member who owns this speaker's
-- coordination going forward (bio/photo/passport chasing, reminders, and —
-- once built — outbound email attribution). Deliberately a plain FK to
-- staff_members, NOT constrained at the DB level to holders of the
-- "Producer" access-role (access_rbac.sql's event_access_assignments) —
-- that constraint is enforced by the picker UI only being populated from
-- Producer-role holders on this event, same as every other role-gated
-- picker in this app (e.g. the Internal Approval approver picker).
--
-- reference: free-text, purely informational (2026-08-31, per Madhu —
-- "just for internal reference and reporting"). Who sourced/introduced this
-- speaker — often an external party (e.g. a client-side contact) who isn't
-- a Trescon staff member at all, so this is deliberately text, not a
-- staff_members FK like producer_staff_id.
--
-- confirmation_status: free-text (2026-08-31, per Madhu: "just a custom
-- field would suffice") — not an enum, since the DFS tracker's own values
-- ("Reconfirmed", "New Confirmed", "Confirmed") are producer shorthand,
-- not a fixed set EventPilot should validate against. Exists to track
-- DFS's May→November reschedule (who from the original May lineup has
-- actually reconfirmed for November), not meant as a permanent workflow
-- status — a plain field that goes away in relevance once everyone's
-- confirmed, not a new lifecycle state alongside announcement_status.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS producer_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS confirmation_status TEXT;

COMMIT;
