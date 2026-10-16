# Brand & Content: new sidebar section, first build

Date: 2026-10-16. Decided by Madhu in chat. Supersedes docs/build_suggestions/house-style-view-and-download.md (fold its requirements into Part 3 below).

## Decisions (do not reopen)
1. A new top-level sidebar section, **Brand & Content**, for standards: what Trescon follows, the single source of truth.
2. Finished documents (what Trescon sends) live in **DocuHub**. The corporate deck becomes a DocuHub document type. Checking uploads against the standards is a later phase.
3. **Full scrap of the Corporate Marketing module, including its data and stored files.** Its content that is still wanted (the approved About Trescon texts and the company figures) is carried into new, clean tables as starting data.
4. Content Hub, Pilot Projects, Knowledge Base and the SAE admin console are not touched.
5. The Standards API (read-only feed of approved texts, figures and style guide) is the NEXT build, not this one.

## Target structure
```
Brand & Content
├── Brand
│   ├── Brand book            (move: /admin/branding/corporate)
│   ├── Font library          (move: /admin/branding/fonts)
│   └── Creative standards    (one page, three tabs)
│         ├── Logo handling            (the rule every logo goes through; app/lib/media/logo-engine.ts)
│         ├── Speaker photo handling   (move: /admin/branding/cleaning-cycle-template)
│         └── Creative placeholders    (move: /admin/branding/placeholder-defaults; by creative type)
└── Content
    ├── Content style guide   (move + extend: /admin/content/house-style)
    └── Company profile       (new: About Trescon texts + company figures)
```
Suggested routes: /brand-content/brand/{book,fonts,creative-standards} and /brand-content/content/{style-guide,company-profile}. Old URLs redirect to the new ones.

## Non-negotiables
- Press releases for Trescon-owned events keep using the approved boilerplate at every point in this build. There must be no window where they fall back to model-written boilerplate because a table moved. Managed events stay exactly as they are.
- Moves are moves. Brand book, fonts, photo cleaning standard, placeholder defaults and logo handling behave exactly as before. SAE output must be identical before and after. Font LIST reads stay open, as today (the SAE editor reads them).
- `corporate_brand_assets` and `corporate_brand_guidelines` belong to the Brand book and are KEPT. They are not part of the Corporate Marketing scrap despite the similar names.
- Nothing is dropped until the replacements are live and a backup exists. Table drops and storage deletes go in a separate migration that Madhu runs after he has seen the report.
- One commit per part. Report before pushing.

## Part 0: audit and backup (report before Part 1)
1. List every reference to the Corporate Marketing module: routes (app/admin/toolkit/corporate-marketing, app/api/corporate-marketing), app/lib/corporate-marketing, the registry entry and Toolkit tile and icon, the `corporate_marketing` tool grant, app/lib/content/trescon-profile.ts, the press release generator, the speaker route comment, and anything else you find.
2. List every table, enum, trigger and storage bucket the module owns (corporate_decks, corporate_deck_versions, corporate_deck_mappings, corporate_company_content, corporate_testimonials, any leadership or asset tables, cm_statistics, cm_statistic_history, cm_statistic_dependencies, their enums and the dependency trigger). Confirm none is read by anything outside the module except trescon-profile.ts and the press release generator.
3. Export every one of those tables to docs/archive/corporate-marketing-2026-10-16/ (CSV or SQL inserts) and list the stored deck files with their sizes.
4. Read the current values to carry forward: for the five boilerplate keys, value_text, approved_text, approved_by, approved_at. For the ten company statistics, current_value, approval status and approver.

## Part 1: sidebar section and access
- Add `brand` to the SidebarSection union and render it in the sidebar (app/components/nav/AppSidebar.tsx and friends). Registry entries for the five pages with `sidebar: { section: 'brand', ... }`, Brand and Content as the two parent nodes.
- View: every signed-in staff member can open every page in the section (read, copy, download).
- Edit, Brand pages: the existing `platform.branding.manage` permission (as fonts today) or super admin.
- Edit, Content pages: a new `platform.content.manage` permission or super admin.
- Approve (company profile texts and figures, style guide versions): super admin only.

## Part 2: Brand pages
- Brand book and Font library: move the pages as they are, under the new routes and layout.
- Creative standards: one page with three tabs.
  - Speaker photo handling: the existing cleaning cycle standard, unchanged.
  - Creative placeholders: the existing placeholder defaults, grouped by creative type (speaker announcement, self-promo, speaker badge), unchanged. New types get added here later.
  - Logo handling: find where the logo rule's settings live. If they are code-only in logo-engine.ts, show the rule read-only in plain words for now and report it. Do not make it editable in this build.

## Part 3: Content pages
### Content style guide
- Move the house style page here. Keep the Trescon-wide rules panel (admin edits only) as a second tab, "Rules EventPilot checks".
- Keep the existing upload, extract, draft review and approve flow for the guide exactly as it is, so the guide still reaches the tools.
- Add: the live guide readable in the page, and two buttons, Download PDF and Download Word. The PDF is the uploaded original. The Word file is a convenience copy attached to the same live version: stored and downloadable only, never extracted, never in any prompt or rule check, replaced when a new version goes live.
- Files to upload once this is live: docs/house-style/Trescon content style guide.pdf and .docx.

### Company profile (new tables, built from scratch)
- `company_profile_texts`: key, label, working_text, approved_text, approved_by (staff), approved_at, figure_keys (text[] of the figures it quotes), needs_review (bool), updated_by, updated_at. Keys: about_short, about_standard, about_long, module_signature, module_managed.
- `company_figures`: key, label, value, unit, description, source, notes, status (draft, pending_review, approved), approved_value, approved_by, approved_at, updated_by, updated_at. Plus `company_figure_history` (figure, old value, new value, who, when) for the audit trail.
- When a figure's approved value changes, every text whose figure_keys contains it gets needs_review = true. Same idea as the old dependency trigger, in one place.
- Seed both tables from the values read in Part 0, carrying approved state, approver and time where they exist. The old 'boilerplate' key maps to about_standard. Seed approved_text only from the old approved_text; never promote a working copy to approved.
- Page: each text in its versions with a copy button and a state chip (Approved, Edited since approval, Needs review, Not approved). Figures as a table with status. Edit for content.manage; Approve for super admin. Approving a text runs it through the Trescon-wide rules first (errors block with the finding, warnings do not), as the current approve action does.

## Part 4: rewire the consumers
- app/lib/content/trescon-profile.ts reads company_profile_texts (approved_text only). Same function names and behaviour: Trescon-owned events get about_standard, plus module_signature for Signature Events; managed events get nothing and keep the original prompt.
- The press release generator needs no other change. Verify it end to end (check 2).

## Part 5: DocuHub
- Add a doc type "Corporate deck" (slug prefix `deck`). Default visibility internal until Madhu says otherwise. No check-on-upload in this build.

## Part 6: the scrap (code now, data last)
- Code: delete the Corporate Marketing pages, API routes, lib folder, registry entry, Toolkit tile and icon, and the `corporate_marketing` grant key (and its option in any grant pickers). Add redirects from /admin/toolkit/corporate-marketing/* to /brand-content.
- Data: a separate migration, supabase/corporate_marketing_drop.sql, that drops the tables, enums and trigger listed in Part 0 and deletes the stored deck files. Do not run it. Madhu runs it after the report.

## Checks
1. The sidebar shows Brand & Content with Brand (three pages) and Content (two pages). A non-admin staff member can open all five and cannot edit or approve anything.
2. A press release generated for a Trescon-owned test event uses about_standard word for word; a Signature test event also gets module_signature; a managed test event is unchanged. Run this before AND after the drop migration.
3. Changing an approved figure flips every text that quotes it to Needs review.
4. Approving a text containing an em dash is blocked with the finding (temporary test rule, removed afterwards).
5. The SAE produces the same output as before for one speaker announcement, one self-promo and one badge on a test event (fonts, placeholders, photo cleaning, logo handling).
6. The style guide shows in the page; Download PDF and Download Word return the right files; the Word file reaches no prompt or check.
7. Every old URL (Corporate Marketing, /admin/content/house-style, /admin/branding/*) redirects to its new page.
8. DocuHub accepts a test upload of type Corporate deck and gives it a permanent link; delete the test document afterwards.
9. Nothing in Content Hub, Pilot Projects, Knowledge Base or the SAE admin console changed.

## Open for Madhu (ask, do not assume)
- Who gets `platform.content.manage`?
- Corporate deck visibility in DocuHub: internal or public?
