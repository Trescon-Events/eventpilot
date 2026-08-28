-- Head detection for the global placeholder photo (2026-08-29) — real bug,
-- caught live by Madhu: Generate Preview picked up the global default
-- photo correctly, but the head-alignment circle landed off-place and
-- oversized, because the global default photo (unlike a real speaker's
-- photo, which gets photo_head_box detected once via the Photo Cleaning
-- module) never had its own head position detected at all — alignAndCropPhoto
-- was cropping it with an undefined head_box. Fixed the same way real
-- speaker photos already work: detect the head once, on upload, and store
-- it, reused on every future crop instead of re-detecting live.
--
-- Only meaningful for the SPEAKER default (a headshot) — the partner
-- default's photo fills a logo slot, which has no face-alignment concept
-- at all (see derive-alignment/route.ts's own detect_face=false handling
-- for non-speaker_photo sources); stays NULL for partner rows.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE template_placeholder_defaults ADD COLUMN IF NOT EXISTS photo_head_box JSONB;

COMMIT;
