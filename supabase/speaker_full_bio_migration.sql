-- Full Bio (file-upload) on event_speakers (2026-09-04)
--
-- Full Bio is always a file (PDF or Word doc), never pasted text — the
-- existing `bio` column is the SHORT bio (a plain textarea on the
-- onboarding form, unchanged, still what KonfHub's push reads as `about`).
-- A speaker/producer uploads a full-length bio document; if it's a Word
-- doc (.doc/.docx) it's converted to PDF via CloudConvert at upload time
-- (see app/lib/media/cloudconvert-client.ts's convertDocxToPdf()) and only
-- the resulting PDF is ever stored — the original Word bytes are never
-- written to storage, by design (per Madhu, 2026-09-04).
--
-- bio_full_source records which case produced the stored PDF, purely for
-- an honest audit trail (e.g. "this PDF is a conversion, the layout may
-- differ slightly from the original Word doc") — not used for any gating.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS bio_full_url TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS bio_full_source TEXT CHECK (bio_full_source IN ('pdf', 'docx_converted'));

COMMIT;
