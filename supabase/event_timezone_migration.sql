-- Event timezone (2026-10-05) — the IANA zone an event's agenda times are
-- shown and entered in (Agenda Builder, public agenda). Same format KonfHub
-- uses for its own event `time_zone` (plain IANA names such as Asia/Dubai,
-- Asia/Jakarta, Asia/Kuala_Lumpur; KonfHub's India value is the legacy alias
-- Asia/Calcutta, which EventPilot normalises to the canonical Asia/Kolkata —
-- see app/lib/events/timezones.ts). Session times themselves stay UTC
-- timestamptz; this column is only used to convert at the edges.
--
-- Backfilled ONLY where KonfHub itself confirmed the zone (read live
-- 2026-10-05); every other event stays NULL until someone sets it on the
-- Event Details page — no guessing for events KonfHub doesn't know.
BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone text;

UPDATE events SET timezone = 'Asia/Kuala_Lumpur' WHERE id = '5e2f89f4-49aa-4358-9791-f7654685246d' AND timezone IS NULL; -- World AI Show Malaysia 2026
UPDATE events SET timezone = 'Asia/Kolkata'      WHERE id = '27edfe37-ab45-4656-922d-0503012c75a7' AND timezone IS NULL; -- Bengaluru Skill Summit 2026 (KonfHub: Asia/Calcutta)
UPDATE events SET timezone = 'Asia/Jakarta'      WHERE id = '0cbcb583-b023-477d-b4c1-264e85d20e57' AND timezone IS NULL; -- AI InfraNext Indonesia 2026
-- Dubai Future Finance Week family: one shared KonfHub event, zone Asia/Dubai
UPDATE events SET timezone = 'Asia/Dubai' WHERE id IN (
  '293bde73-22c0-40f0-b621-6306c9266d6a', -- Dubai FinTech Summit 2026
  '06f62069-37d3-4699-9871-16709fa1540e', -- Future Islamic Finance Forum 2026
  'b470ee7f-77d9-4985-a5e3-f3c1ebb349c8', -- Future Sustainability Forum Dubai 2026
  '90199234-7e43-498e-88e0-e08223b5fa35', -- Future Tokenization Forum 2026
  '186a86e4-6842-492d-8070-5507cc6d1023'  -- Dubai Family Wealth Summit 2026
) AND timezone IS NULL;

COMMIT;
