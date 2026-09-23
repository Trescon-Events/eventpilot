-- Speaker creative headline, moved to the SPEAKER record (2026-09-22,
-- redesigned per Madhu — originally built on stakeholder_announcements,
-- see announcement_headline_migration.sql, reverted below). Generated
-- once on the speaker's own record page (a "Creative Headline" section
-- after Short Bio) and reused by every announcement/creative generated
-- for that speaker afterward — same as name/title/company/photo already
-- work, not a per-announcement thing. A creative Variant with a
-- headline_emphasis text layer is unusable for a speaker until this is
-- set, same "greyed out, requires X" UX as a missing company logo.

alter table event_speakers add column if not exists headline_variants jsonb;
alter table event_speakers add column if not exists selected_headline_variant_id text;

-- Revert the announcement-scoped columns — this session's earlier attempt
-- at this feature, never released, no real data written.
alter table stakeholder_announcements drop column if exists headline_variants;
alter table stakeholder_announcements drop column if exists selected_headline_variant_id;
