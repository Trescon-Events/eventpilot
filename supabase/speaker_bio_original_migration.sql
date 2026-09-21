-- Short Bio "Revert to Original" (2026-09-21, Madhu) — a persistent
-- safety net distinct from the existing session-only Undo (which only
-- covers "I just clicked Generate a moment ago" and is lost on reload).
-- bio_original is set ONCE, at speaker-creation time (from-submission and
-- manual Add Speaker), and never touched again afterward — the true
-- as-first-recorded value, so a producer who later overwrites `bio` via
-- Generate from Full Bio (or accidentally deletes it) can always get back
-- to what the speaker actually submitted, not just their last edit.
--
-- Backfill below: any speaker who already has a `bio` today but predates
-- this column (bio_original still null) gets their CURRENT bio treated as
-- the best-available "original" — there's no real historical value to
-- recover for them, but leaving bio_original null would silently hide the
-- Revert button for every speaker processed before this shipped,
-- including ones a producer might still accidentally overwrite today.

alter table event_speakers add column if not exists bio_original text;

update event_speakers
set bio_original = bio
where bio_original is null and bio is not null and trim(bio) <> '';
