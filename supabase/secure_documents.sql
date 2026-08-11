-- ============================================================
-- SECURE DOCUMENT HANDLING (2026-08-11) — Phase D of the HubSpot
-- Forms integration. Passport/national-ID uploads collected via a
-- HubSpot form must never land in EventPilot's own storage — they're
-- copied into a per-event Google Drive or Microsoft OneDrive folder
-- using the CONFIGURING PRODUCER's own delegated OAuth access, never
-- a shared app-level credential ("access to that folder by the app
-- will be same as the producer who is using it").
--
-- staff_oauth_connections stores tokens ENCRYPTED at rest (AES-256-GCM,
-- app/lib/security/token-crypto.ts) — a deliberate uplift beyond the
-- existing canva_tokens table's plaintext storage, justified by the
-- broader write scope and PII proximity here.
--
-- secure_document_transfers is a durable, retry-able queue — this
-- codebase has no background-job worker, so this table + a
-- /api/cron/ sweep (matching the existing kb_intel_runs/cron-job.org
-- pattern) IS the queue.
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_oauth_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id                UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_account_email  TEXT,
  access_token_enc        TEXT NOT NULL,
  refresh_token_enc       TEXT NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  scope                   TEXT,
  connected_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, provider)
);

-- One secure destination per EVENT (not per form_type) — a producer
-- picks one folder for the whole event; documents from any form_type
-- land there, distinguished by filename. configured_by is whose
-- delegated token authorizes writes here.
CREATE TABLE IF NOT EXISTS event_secure_folders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  folder_url     TEXT NOT NULL,
  folder_id      TEXT NOT NULL,
  drive_id       TEXT,
  configured_by  UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  configured_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id)
);

CREATE TABLE IF NOT EXISTS secure_document_transfers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID NOT NULL REFERENCES stakeholder_form_submissions(id) ON DELETE CASCADE,
  event_id              UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  document_role         TEXT NOT NULL CHECK (document_role IN ('passport', 'national_id', 'other_document')),
  source_url            TEXT NOT NULL,
  filename              TEXT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'copied', 'failed')),
  attempts              INT NOT NULL DEFAULT 0,
  last_error            TEXT,
  provider              TEXT,
  destination_file_id   TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_secure_document_transfers_pending
  ON secure_document_transfers(status) WHERE status IN ('pending', 'failed');
