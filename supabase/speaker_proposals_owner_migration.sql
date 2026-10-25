-- Speaker Proposals (2026-10-25): every drop has an OWNER (the producer responsible — sends the client emails from their mailbox, gets the notifications)
-- and optional CO-OWNERS (copied on every outgoing client email and every notification). Both are staff ids (staff_members.id, as text).
ALTER TABLE speaker_proposal_batches
  ADD COLUMN IF NOT EXISTS owner_sid text,
  ADD COLUMN IF NOT EXISTS co_owner_sids text[] NOT NULL DEFAULT '{}';
-- Existing drops: whoever created it, when that was a real staff member (not the shared super-admin login).
UPDATE speaker_proposal_batches SET owner_sid = created_by
  WHERE owner_sid IS NULL AND created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
