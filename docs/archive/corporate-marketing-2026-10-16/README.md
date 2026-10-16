# Corporate Marketing: Part 0 audit and backup (2026-10-16)

Exports of every table the module owns (CSV and JSON), taken from production on 16 Oct 2026. Stored deck files are listed in `storage-corporate-marketing-files.json` (7 files, 91 MB) but NOT copied here.

## Tables owned by the module (rows at export)
corporate_decks 1, corporate_deck_versions 4, corporate_deck_mappings 13, corporate_company_content 12, corporate_testimonials 1, corporate_assets 2, corporate_leadership_overrides 20, cm_statistics 16, cm_statistic_history 0, cm_statistic_dependencies 10.

Enums: cm_stat_approval_status, cm_stat_scope. Functions and triggers: cm_statistics_touch_updated_at (cm_statistics_touch_updated_at_trg), cm_statistics_flag_dependencies (cm_statistics_flag_deps_trg). Bucket: corporate-marketing (private).

KEPT (Brand book, not part of the scrap): corporate_brand_assets (52 rows), corporate_brand_guidelines (1 row).

## Read by code outside the module
Only app/lib/content/trescon-profile.ts (corporate_company_content.approved_text). The press release generator reaches it through that helper.
