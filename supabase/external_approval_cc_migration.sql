-- External Approval per-person CC tracking (2026-09-22, per Madhu) —
-- mirrors announcement_client_approval_cc exactly (see that table's own
-- migration doc comment for the full "own token, own link, own tracked
-- status" rationale). Previously External Approval's CC list was just a
-- plain email cc: header on the one shared main link — this gives each
-- CC'd person (an assistant, office, etc.) their own personalized email
-- and their own review link, same as Client Approval already had.
--
-- Combined with the "first responder wins" change (see
-- app/lib/events/approval-round.ts), this is what actually lets an
-- assistant act on a speaker's behalf: their own link, their own
-- resolvable decision, not just a copy of an email they can't act on.

BEGIN;

CREATE TABLE IF NOT EXISTS announcement_external_approval_cc (
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

CREATE INDEX IF NOT EXISTS idx_external_approval_cc_parent ON announcement_external_approval_cc(parent_approval_id);

COMMIT;
