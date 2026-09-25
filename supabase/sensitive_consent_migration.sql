-- Sensitive-document consent + vendor deletion controls (2026-09-26)
--
--  1. speaker_communication_requests — the speaker's recorded consent to upload passport / National ID.
--  2. ops_vendor_terms_acceptances   — a vendor user's acceptance of the data-handling terms (per version).
--  3. ops_license_batches            — the delete-by date the vendor acknowledged before downloading, and the
--                                      vendor's recorded confirmation that every copy was deleted.
-- Idempotent. Additive only (no data is changed or removed).

BEGIN;

ALTER TABLE speaker_communication_requests
  ADD COLUMN IF NOT EXISTS sensitive_consent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sensitive_consent_version TEXT,
  ADD COLUMN IF NOT EXISTS sensitive_consent_ip      TEXT;

CREATE TABLE IF NOT EXISTS ops_vendor_terms_acceptances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_user_id UUID NOT NULL REFERENCES ops_vendor_users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip            TEXT,
  UNIQUE (vendor_user_id, terms_version)
);
ALTER TABLE ops_vendor_terms_acceptances ENABLE ROW LEVEL SECURITY;   -- service role only, like every ops table

ALTER TABLE ops_license_batches
  ADD COLUMN IF NOT EXISTS delete_by              DATE,
  ADD COLUMN IF NOT EXISTS download_ack_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS download_ack_user_id   UUID REFERENCES ops_vendor_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_confirmed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_confirmed_by  UUID REFERENCES ops_vendor_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_confirmed_ip  TEXT;

COMMIT;
