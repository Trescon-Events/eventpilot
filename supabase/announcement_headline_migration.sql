-- AI-generated speaker announcement headline (2026-09-22) — the bold
-- on-image phrase shown on a speaker creative (e.g. "THE TECHNOLOGY
-- BEHIND MODERN BANKING"), separate from post_copy/post_copy_x. A
-- generation produces a batch of 5 HeadlineVariant options (each
-- {id, segments: {lead?, emphasis, trail?}, edited, compliance}); one is
-- flagged selected via selected_headline_variant_id and gets baked into
-- the composited creative on regenerate-creative. A second Generate click
-- REPLACES the batch (matches every other regenerate in this app — post
-- copy, X copy, short bio — no history kept).
--
-- JSONB-on-row, not a sibling table — same precedent as post_copy/
-- post_copy_x/validation_findings already on this row: the 5 variants
-- have no independent lifecycle, they just need to live together with
-- one flagged selected.

alter table stakeholder_announcements add column if not exists headline_variants jsonb;
alter table stakeholder_announcements add column if not exists selected_headline_variant_id text;
