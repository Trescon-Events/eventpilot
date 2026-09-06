-- Client Approval Contacts — multi-person, per-person tracked (2026-09-06)
--
-- Replaces the single flat events.client_contact_name/job_title/email
-- (announcement_client_approval_migration.sql) with a real list: one event
-- can have several client-side contacts, exactly one marked primary.
-- Old columns are left in place, unread by new code — same "don't drop,
-- worry about it later" precedent as this session's other orphaned-column
-- decisions; DFS's existing single contact is migrated into this table
-- below so nothing is lost.
--
-- Primary vs CC, per Madhu (2026-09-06): only the PRIMARY contact's
-- decision gates the announcement pipeline — this is exactly the existing
-- announcement_approvals layer='client' round, UNCHANGED (see
-- announcement_client_approval_migration.sql). CC'd people are additive:
-- each gets sent their OWN individual email with their OWN unique link
-- (never a shared email-CC header, which would give everyone the SAME
-- link/token and make it impossible to know who actually responded — the
-- exact gap found in how External/Client approval works today), and their
-- decision is tracked independently but never blocks or unblocks
-- publishing. This IS the audit trail per Madhu's ask ("record of who
-- approved what and when") — the row itself, never deleted, is the
-- record; no separate log table needed.

BEGIN;

CREATE TABLE IF NOT EXISTS event_client_approval_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_approval_contacts_event ON event_client_approval_contacts(event_id);
-- At most one primary per event — enforced at the DB level, not just the UI.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_approval_contacts_one_primary
  ON event_client_approval_contacts(event_id) WHERE is_primary;

-- One row per CC'd person per approval ROUND (parent_approval_id ties it to
-- the specific announcement_approvals row a "Send for Client Approval"
-- click created — a re-send creates a new parent row and a fresh set of
-- these, same "always look at the most recent round" convention the
-- parent table already uses). Deliberately NOT a child of
-- event_client_approval_contacts — a CC'd person here might not even be in
-- that saved list (the composer allows ad-hoc additions), and this table
-- is about what was actually SENT for one specific round, not the
-- reusable event-level contact list.
CREATE TABLE IF NOT EXISTS announcement_client_approval_cc (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_approval_id UUID NOT NULL REFERENCES announcement_approvals(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'approved_with_comments', 'changes_requested')),
  comments          TEXT,
  actioned_at       TIMESTAMPTZ,
  notified_at       TIMESTAMPTZ,
  approval_token    TEXT UNIQUE NOT NULL,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_approval_cc_parent ON announcement_client_approval_cc(parent_approval_id);

-- Migrate DFS's existing single contact (the only event this was ever set
-- up for, per Madhu — "hasn't been used" in production) into the new
-- table as its primary, so nothing is lost. No-op for every other event
-- (client_contact_email is null everywhere else).
INSERT INTO event_client_approval_contacts (event_id, name, email, is_primary)
SELECT id, COALESCE(NULLIF(TRIM(client_contact_name), ''), client_contact_email), client_contact_email, true
FROM events
WHERE client_contact_email IS NOT NULL AND TRIM(client_contact_email) <> ''
ON CONFLICT DO NOTHING;

COMMIT;
