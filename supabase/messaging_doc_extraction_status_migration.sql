-- Messaging doc upload background extraction (2026-09-16) — fixes the
-- same class of bug already found and fixed once for the KB Intel
-- pipeline (see app/api/kb/intel/run/route.ts's own comment): the upload
-- route's two sequential Gemini calls (PDF text extraction, then
-- structuring) together can exceed the ~100-125s the Cloudflare Worker
-- proxy in front of this app allows a single request to hang open.
-- Confirmed live 2026-09-16 — a real AI InfraNext upload hit exactly this:
-- HTTP 499 in Railway's logs at 125s, "Upload failed" shown to the user,
-- but the draft had actually saved successfully moments later.
--
-- The POST route now returns immediately after inserting a 'processing'
-- row and runs the actual Gemini work in the background (see
-- app/api/events/stakeholders/messaging/route.ts's runExtraction()) — the
-- frontend polls for this column flipping to 'complete'/'failed' instead
-- of waiting on the original request.

ALTER TABLE event_messaging_docs
  ADD COLUMN IF NOT EXISTS extraction_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (extraction_status IN ('processing', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS extraction_error TEXT;

-- Backfill: every existing row already went through the old synchronous
-- try/catch — one with structured_json IS NULL already failed extraction
-- back then (the old code saved the row anyway with the PDF stored), so
-- 'failed' is the accurate status for it, not the column default
-- ('complete', which would read as "nothing to extract" instead of
-- "extraction didn't produce anything"). Every row with structured_json
-- already set keeps the default 'complete', which is correct as-is.
UPDATE event_messaging_docs SET extraction_status = 'failed' WHERE structured_json IS NULL;
