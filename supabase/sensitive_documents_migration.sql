-- Sensitive Documents module: Passport / National ID storage (2026-09-04)
--
-- Isolated from the general speaker record and its public-bucket assets
-- (photo/company logo — app/lib/events/storage.ts's event-stakeholder-assets,
-- which is deliberately PUBLIC). Passport/National ID files live in their
-- own PRIVATE bucket, accessed only via short-lived signed URLs minted
-- server-side after an explicit RBAC permission check — see
-- app/lib/events/sensitive-storage.ts and the sae.sensitive_documents.*
-- permission keys (granted the same way as every other Event Workspace
-- Access Role, e.g. "Producer" — admins assign it today, a future Project
-- Director/Coordinator delegate can once that role exists; no new UI needed,
-- the existing Roles + Assign People screen already covers it).
--
-- One active row per (speaker, document_type) — a re-upload soft-deletes
-- the previous row (storage object removed, deleted_at/deleted_by stamped)
-- rather than accumulating versions, keeping "what's the current passport
-- on file" unambiguous.
--
-- Retention: retention_expires_at is stamped at upload time from the
-- event's own end_date (falls back to upload time if end_date isn't set
-- yet) + events.sensitive_document_retention_days (default 30). The
-- app/api/cron/purge-sensitive-documents sweep hard-deletes the storage
-- object once past that date, but the ROW stays forever — storage_path
-- goes null, deleted_at/deleted_by/notified_at get stamped — so "this
-- document existed and was purged on X" remains a permanent, queryable
-- audit trail even though the file itself is gone. deleted_by is TEXT, not
-- a staff_members FK: 'system_auto_purge' is a common real value here
-- alongside individual staff ids (a manual correction-delete), so a plain
-- string keeps both cases in one column without a nullable-FK-plus-flag.
--
-- shared_with_vendor_at: forward-compatible only, not wired to anything
-- yet — reserved for the future expiring/tracked vendor share-link flow
-- (reusing the existing no-login public-portal pattern) discussed for how
-- Ops hands these files to external vendors. Left null everywhere today.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

-- Private bucket — public: false, access only via createSignedUrl() from
-- the server routes below (same pattern as the bespoke-briefs bucket, see
-- supabase/bespoke_prd_expansion_2026_07_13.sql).
INSERT INTO storage.buckets (id, name, public)
VALUES ('speaker-sensitive-documents', 'speaker-sensitive-documents', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE events ADD COLUMN IF NOT EXISTS sensitive_document_retention_days INTEGER NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS speaker_sensitive_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id            UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  event_id              UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  document_type         TEXT NOT NULL CHECK (document_type IN ('passport', 'national_id')),
  storage_path          TEXT,              -- null once purged (see deleted_at)
  file_name             TEXT NOT NULL,
  mime_type             TEXT NOT NULL,
  file_size             BIGINT,
  uploaded_by           UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_expires_at  TIMESTAMPTZ NOT NULL,
  deleted_at            TIMESTAMPTZ,
  deleted_by            TEXT,              -- staff id (manual delete) or 'system_auto_purge'
  notified_at           TIMESTAMPTZ,       -- when the speaker was emailed that their doc was purged
  shared_with_vendor_at TIMESTAMPTZ,       -- reserved, not yet wired (see comment above)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sensitive_docs_speaker ON speaker_sensitive_documents(speaker_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_docs_event ON speaker_sensitive_documents(event_id);
-- Partial index — the purge cron and the "one active doc per type" lookup
-- both only ever care about non-deleted rows.
CREATE INDEX IF NOT EXISTS idx_sensitive_docs_active_expiry ON speaker_sensitive_documents(retention_expires_at) WHERE deleted_at IS NULL;

COMMIT;
