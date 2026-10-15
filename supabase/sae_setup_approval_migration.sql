-- SAE readiness check + setup approval (docs/build_suggestions/sae-readiness-and-setup-approval.md, 2026-10-15).
-- Additive only. New events enforce the approval gate; the six live events are grandfathered (enforce = false, approval recorded
-- for Madhu) so they keep generating without interruption. Their fingerprints are stored by scripts/sae-grandfather-fingerprints.ts
-- right after this migration (the fingerprint is computed in app code).
BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS sae_setup_approved_at  TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sae_setup_approved_by  UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sae_setup_fingerprint  TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sae_setup_enforce      BOOLEAN NOT NULL DEFAULT TRUE;
-- Last reference recompile failure (previously only logged and swallowed); cleared on the next successful compile.
ALTER TABLE events ADD COLUMN IF NOT EXISTS sae_compile_error      TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sae_compile_error_at   TIMESTAMPTZ;

-- Part 4: new events are assembled by default. Existing rows are left alone (DEFAULT only applies to new inserts).
ALTER TABLE events ALTER COLUMN sae_copy_mode SET DEFAULT 'assembled';

-- Grandfather the six live events: DFS, FSF, FIFF, FTF, DFWS, BSS.
UPDATE events
   SET sae_setup_enforce     = FALSE,
       sae_setup_approved_at = NOW(),
       sae_setup_approved_by = '323f2caf-7a9b-47e0-b703-02d2d6ecfc95'
 WHERE id IN (
   '293bde73-22c0-40f0-b621-6306c9266d6a',  -- Dubai FinTech Summit 2026 (DFS, legacy)
   'b470ee7f-77d9-4985-a5e3-f3c1ebb349c8',  -- Future Sustainability Forum Dubai 2026 (FSF)
   '06f62069-37d3-4699-9871-16709fa1540e',  -- Future Islamic Finance Forum 2026 (FIFF)
   '90199234-7e43-498e-88e0-e08223b5fa35',  -- Future Tokenization Forum 2026 (FTF)
   '186a86e4-6842-492d-8070-5507cc6d1023',  -- Dubai Family Wealth Summit 2026 (DFWS)
   '27edfe37-ab45-4656-922d-0503012c75a7'   -- Bengaluru Skill Summit 2026 (BSS)
 );

COMMIT;
