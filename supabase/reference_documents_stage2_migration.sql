-- Reference Documents & Content Validation — Stage 2: inheritance and compile
-- (2026-09-10). See docs/build_suggestions/reference-documents-and-validation.md.
-- Materialised, versioned compiled-reference row per event, produced by
-- app/lib/content/compile-reference.ts whenever a source document in that
-- event's effective set (its own live docs + its umbrella's live docs) is
-- approved. Versioned (not overwritten) so an asset generated months ago
-- can still be traced to the exact compiled reference that produced it —
-- see the spec's "materialise rather than compute on read" note.

CREATE TABLE IF NOT EXISTS event_compiled_reference (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  compiled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The live event_messaging_docs rows that fed this compile, in the
  -- order they were merged (authority_rank asc, role, then doc created_at).
  source_doc_ids  UUID[] NOT NULL,
  -- Merged sections array — see compile-reference.ts's CompiledSection type
  -- for the exact shape. Every entry carries source_doc_id, source_doc_title,
  -- role, authority_rank, provenance and diverged_from_source alongside the
  -- section's own id/title/kind/content.
  sections        JSONB NOT NULL,
  -- Flagged rule/fact conflicts between two source documents — see
  -- compile-reference.ts's ConflictFlag type. Never silently resolved:
  -- the higher-rank statement is what "wins" (appears in `sections`), but
  -- every conflict is recorded here for a human to see. Empty array, not
  -- absence, when nothing conflicted.
  conflicts       JSONB NOT NULL DEFAULT '[]',
  UNIQUE (event_id, version)
);

CREATE INDEX IF NOT EXISTS idx_event_compiled_reference_latest ON event_compiled_reference (event_id, version DESC);
