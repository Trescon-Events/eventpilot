-- DocuHub v4: BD proposal-specific fields (Client, Owner), distinct from the
-- post-event-report event-attribution fields — proposals are concept-stage,
-- not a real event with dates/city/venue yet.

ALTER TABLE docuhub_documents
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;

-- doc_types needs its own toggle for "show the Client/Owner block", separate
-- from requires_event_attribution (which controls the post-event-report-style
-- date/city/venue/series block) — a proposal needs the former, not the latter.
ALTER TABLE doc_types
  ADD COLUMN IF NOT EXISTS requires_client_attribution BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE doc_types SET requires_client_attribution = TRUE WHERE key = 'bd_proposal';

-- Proposals contain client-facing commercial terms and should default to
-- internal, not public (the original seed had this wrong for a type that
-- didn't have real content yet).
UPDATE doc_types SET default_visibility = 'internal' WHERE key = 'bd_proposal';

SELECT key, default_visibility, requires_event_attribution, requires_client_attribution FROM doc_types ORDER BY sort_order;
