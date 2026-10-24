-- Speaker memento PRINT file (2026-10-24). Additive only.
-- A memento batch made with a print-memento template (background vector PDF + speaker photo) gets a printable multi-page PDF for the engraving vendor.
-- Same idea as the badge print file; state lives on the batch (one file per batch, regenerated on demand while it is a draft).
ALTER TABLE memento_batches
  ADD COLUMN IF NOT EXISTS print_status        text,          -- null | processing | done | error
  ADD COLUMN IF NOT EXISTS print_started_at    timestamptz,
  ADD COLUMN IF NOT EXISTS print_done          int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS print_total         int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS print_error         text,
  ADD COLUMN IF NOT EXISTS print_pdf_key       text,          -- private R2 key of the finished PDF
  ADD COLUMN IF NOT EXISTS print_generated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS print_pdf_bytes     bigint,
  ADD COLUMN IF NOT EXISTS print_sources       jsonb;         -- { speaker_id: cleaned photo url used } so a later re-clean shows the file is out of date
