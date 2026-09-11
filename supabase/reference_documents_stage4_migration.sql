-- Reference Documents & Content Validation — Stage 4: wire the consumers
-- (2026-09-10). See docs/build_suggestions/reference-documents-and-validation.md.
--
-- requires_client_approval: settable at umbrella or event level. Null on a
-- child inherits the umbrella's value (resolveRequiresClientApproval in
-- app/lib/events/client-approval-gate.ts); an explicit value overrides.
-- Defaults to null everywhere (= effectively false once resolved) — opt-in
-- per event, never derived from `type`, since not all managed-event
-- clients demand approval on every asset.
ALTER TABLE events ADD COLUMN IF NOT EXISTS requires_client_approval BOOLEAN;
