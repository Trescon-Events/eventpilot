-- Cleanup: the "producer connects their own Google Drive/OneDrive" secure
-- document approach (built 2026-08-11) was superseded 2026-09-04 by the
-- Sensitive Documents module (speaker_sensitive_documents, private Supabase
-- Storage bucket + signed URLs). Verified before dropping: 0 rows in
-- event_secure_folders and secure_document_transfers (never actually used
-- to transfer a document), 3 rows in staff_oauth_connections (only ever a
-- one-time connection test on 2026-08-11/08-20, no other feature reads
-- this table). See docs/EventPilot-SiteOps-Build-Spec-v1.1.md's session
-- notes for the investigation that confirmed this.

drop table if exists secure_document_transfers cascade;
drop table if exists event_secure_folders cascade;
drop table if exists staff_oauth_connections cascade;
