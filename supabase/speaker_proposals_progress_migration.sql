-- Speaker Proposals: live research progress per speaker (stage + detail), shown in the UI while a job runs. Additive only.
ALTER TABLE speaker_proposal_candidates ADD COLUMN IF NOT EXISTS progress jsonb;
