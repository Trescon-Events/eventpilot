-- DocuHub v3: event delivery format (Virtual/In-person/Hybrid) + region,
-- for events without a single physical city (virtual/pan-regional editions).
-- Named event_format (not "format") to avoid colliding with the existing
-- docuhub_documents.format column (file vs link storage format).

ALTER TABLE docuhub_documents
  ADD COLUMN IF NOT EXISTS event_format TEXT CHECK (event_format IN ('virtual', 'in_person', 'hybrid')),
  ADD COLUMN IF NOT EXISTS event_region TEXT;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'docuhub_documents'
ORDER BY ordinal_position;
