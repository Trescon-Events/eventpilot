-- Messaging-document audit (2026-10-17): who did what to a reference document. Until now most writes carried no user (the pages sent none),
-- and proposed edits (the chat), approvals of style-guide and production-pack documents, deletes and uploads left no record at all.
-- The server now records the signed-in session user for every write. Safe to re-run. Nothing else changes.
begin;

CREATE TABLE IF NOT EXISTS public.messaging_doc_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      UUID,                       -- no FK on purpose: the row must outlive a deleted document
  event_id    UUID,
  umbrella_id UUID,
  org_scope   TEXT,
  action      TEXT NOT NULL,              -- upload | word_upload | patch | delete | propose_edit | apply_edit | approve | clarification_answer | suggested_rule_accept | suggested_rule_dismiss
  staff_id    UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messaging_doc_audit_doc   ON public.messaging_doc_audit (doc_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messaging_doc_audit_staff ON public.messaging_doc_audit (staff_id, created_at DESC);
ALTER TABLE public.messaging_doc_audit ENABLE ROW LEVEL SECURITY;

commit;
