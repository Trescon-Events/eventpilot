-- Speaker Proposals: a speaker can now sit in the drop WITHOUT research started ('new') until a producer presses Start research.
ALTER TABLE speaker_proposal_candidates DROP CONSTRAINT IF EXISTS speaker_proposal_candidates_status_check;
ALTER TABLE speaker_proposal_candidates ADD CONSTRAINT speaker_proposal_candidates_status_check CHECK (status IN ('new','queued','researching','researched','error'));
ALTER TABLE speaker_proposal_candidates ALTER COLUMN status SET DEFAULT 'new';
