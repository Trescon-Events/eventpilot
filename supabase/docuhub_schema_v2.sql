-- DocuHub v2: structured event metadata for the Post-Event Report doc type
-- (Event Type, Start/End dates, City, Country, Series) replacing the single
-- event_date column. Safe to run directly — docuhub_documents has 0 rows
-- at the time this was written, so no backfill is needed.

ALTER TABLE docuhub_documents
  DROP COLUMN IF EXISTS event_date,
  ADD COLUMN IF NOT EXISTS event_type TEXT CHECK (event_type IN ('managed','signature','bespoke')),
  ADD COLUMN IF NOT EXISTS event_start_date DATE,
  ADD COLUMN IF NOT EXISTS event_end_date DATE,
  ADD COLUMN IF NOT EXISTS event_city TEXT,
  ADD COLUMN IF NOT EXISTS event_country TEXT,
  ADD COLUMN IF NOT EXISTS series TEXT;

CREATE INDEX IF NOT EXISTS idx_docuhub_documents_series ON docuhub_documents(series) WHERE series IS NOT NULL;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'docuhub_documents'
ORDER BY ordinal_position;
