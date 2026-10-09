-- Upload problems the speaker's own browser reported from the public submission form (2026-10-09).
-- Append-only JSON array of { at, kind, status, content_type, total_bytes, ping_ok, user_agent } — shown to the
-- producer in the Communications tab so a blocked upload is visible instead of silent. Apply by hand via psql.
ALTER TABLE speaker_communication_requests ADD COLUMN IF NOT EXISTS upload_issues JSONB NOT NULL DEFAULT '[]'::jsonb;
