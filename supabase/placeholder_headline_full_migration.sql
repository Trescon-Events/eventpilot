-- Speaker creative headline placeholder — continuous-text column (2026-09-27)
-- Companion to placeholder_headline_migration.sql's headline_lead/
-- headline_emphasis/headline_trail — sample text for the headline_full
-- TextLayer field (see HeadlineSegments' own doc comment in
-- announcements.ts). Same table/shape, same purpose: shown by the template
-- admin's ghost overlay / Generate Preview when no real announcement has a
-- generated headline yet.

alter table template_placeholder_defaults add column if not exists headline_full text;
