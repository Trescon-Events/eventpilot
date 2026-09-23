-- Full Bio machine-readable text (2026-09-22, per Madhu) — extracted once
-- at upload/process time (see toStoredBioPdf() in app/lib/events/
-- full-bio-upload.ts, the single shared conversion point for every Full
-- Bio entry point: HubSpot/onboarding form submission, the public
-- speaker-submission portal, and a producer's manual upload/replace on
-- the record page), never re-extracted on demand. The PDF itself
-- (bio_full_url) stays the thing a producer reviews in the UI; this
-- column exists purely so AI generation (Short Bio, Creative Headline,
-- post copy) can read the bio's actual text cheaply, without downloading
-- and re-parsing the PDF on every single call. Best-effort — stays null
-- for a scanned/image-only PDF with no extractable text; that's not a
-- failure, just nothing to extract.

alter table event_speakers add column if not exists bio_full_text text;
