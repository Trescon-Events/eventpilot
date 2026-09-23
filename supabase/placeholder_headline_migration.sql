-- Speaker creative headline placeholder columns (2026-09-22) — sample
-- lead/emphasis/trail text for the headline_* TextLayer fields, shown by
-- the template admin's ghost overlay / Generate Preview when no real
-- announcement has a generated headline yet. Same table/shape as the
-- existing name/job_title/company_name/country columns — see
-- composite.ts's GlobalPlaceholderDefault type.

alter table template_placeholder_defaults add column if not exists headline_lead text;
alter table template_placeholder_defaults add column if not exists headline_emphasis text;
alter table template_placeholder_defaults add column if not exists headline_trail text;
