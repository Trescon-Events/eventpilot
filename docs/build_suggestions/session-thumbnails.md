# Session thumbnails: YouTube thumbnails from the agenda

**Date:** 15 Nov 2026. Discussed and agreed with Madhu (14–15 Nov). Proposed build. **Build this before video pipeline Phase 1** (`session-video-pipeline.md`); it replaces that spec's §7.6.
**Builds on:** the announcement compositor (`app/lib/announcements/composite.ts`: image, photo slot and text layers, `show_for`, brand fonts, `planTextLayer`), Website Photo cut-outs and head boxes (`app/lib/media/website-photo-render.ts`, `face-alignment.ts`), Stage Screens (`app/lib/screens/geometry.ts` `layoutFor`, `isModeratorRole`, per-session overrides, fingerprint and Changed state, `render.ts` card mode).

---

## 1. What we are making

One YouTube thumbnail per agenda session, built entirely from the agenda and speaker records. No video footage is needed, so thumbnails can be generated as soon as the agenda is final.

Reference samples (DFS 2026): `/Users/madhu/Desktop/Working_Files/Post-Event/Samples/` (keynote, fireside chat, panel). BSS test assets: `/Users/madhu/Desktop/Working_Files/Post-Event/bss26-session-thumbnail-template/` (background is a DFS one used for testing; `Speaker details/` holds the card layers).

**Thumbnail = layout background + session type tag + session title + speaker cards.**

- **Background (1920×1080):** designed by branding. Header (event logo, "Organised by", "Part of") and footer (dates, venue) are part of the image.
- **Session type tag:** a filled pill with the type in capitals ("KEYNOTE", "FIRESIDE CHAT", "PANEL DISCUSSION").
- **Session title:** **one colour** (Madhu, 15 Nov: the two-colour title in the samples is not required). Large, and shrinks to fit its box as the title gets longer (the keynote "Opening Remarks" sample shows the intended size for a short title).
- **Speaker cards:** each speaker drawn with the event's card template (e.g. BSS: Layer 1 background, Layer 2 speaker photo, Layer 3 frame and name panel, then the name as text).

### Layouts (from the samples)
- **Keynote:** tag and title on the left; one large card on the right.
- **Fireside chat and panel:** tag and title across the top; cards in one row below, starting from the left, all the same size.

---

## 2. Decisions (Madhu, 15 Nov)

1. **Moderator first** in the row (fireside and panel), **labelled as moderator**, the same way Stage Screens and agenda screens do it.
2. **Any number of speakers in one row:** cards shrink automatically to fit the speaker area. No second row.
3. **Title:** one colour; big for short titles; shrinks to fit as it gets longer.
4. **Card text is chosen per event:** name only, or name and company. BSS: name only. DFS: name and company.
5. **Build order:** thumbnails first, then video Phase 1.

---

## 3. Non-negotiables

1. **Additive only.** Stage Screens, website photos, announcements and every existing template render exactly as today.
2. **Speaker records are never edited.** Per-session text changes are overrides stored against the thumbnail, as in Stage Screens (`applyCardOverride`).
3. **Never enlarge a photo past its source resolution** without flagging it (same rule as Stage Screens).
4. **Nothing is published.** This build makes and downloads images; YouTube upload is video Phase 4.
5. Every template and approval change is audited (who, when, before, after).

---

## 4. Templates (built by branding in the existing template editor)

Two new variant categories, both edited in the Admin Console variant editor like existing SAE variants.

### 4.1 `thumbnail_card` (one per event)
An ordinary layer stack, exactly as the BSS `Speaker details` folder: image layers, a `photo_slot` with `source: 'speaker_photo'` and face alignment (from the reference photo, as for Website Photo), and text layers (`name`, `company`).
- **Moderator label:** an image or text layer with `show_for: 'moderator'` (existing field, used today by Table Screen cards). Drawn only on the moderator's card.
- **Card text option** (per event, on the thumbnail settings, §6): `name` or `name_company`. When `name`, layers with `field: 'company'` are skipped and any layer snapped below them closes up (existing snapping).
- Designed square or portrait at any size (BSS layers are 1024×1024); it is scaled to the slot it lands in (§5.2).

### 4.2 `thumbnail_layout` (one per layout: `keynote`, `fireside`, `panel`)
A 1920×1080 variant holding:
- the background image layer;
- a **tag** text layer (`field: 'session_type'`) with the new **pill** option (§4.3);
- a **title** text layer (`field: 'session_title'`), one colour, `allow_shrink: true`, with its own max lines and minimum size (§5.1);
- one new **`speaker_area`** layer: a box (`x, y, width, height`) plus `gap`, `align` (`left` | `center` | `right`) and `max_card_width`. Cards are placed inside it (§5.2).

The keynote layout puts the speaker area on the right and the title box on the left; fireside and panel put the title across the top and the speaker area below. Branding positions all of this in the editor; nothing is hard-coded.

New `TextLayer.field` values: `session_type`, `session_title`. Text layers on these variants resolve from the session, not a speaker.

### 4.3 Pill option on text layers
`pill?: { fill: string; padding_x: number; padding_y: number; radius: number }`. When set, the layer draws a filled rounded rectangle sized to the rendered text (one line, no wrap), with the text inside. Width follows the word; the layer's `x`/`y` is the pill's top-left. Generic, but only these templates use it in this build.

---

## 5. Rendering rules

### 5.1 Title
- Text: the agenda session title (override possible, §7).
- Rendered with the title layer's `font_size` as the ceiling, wrapping within `max_lines` and shrinking (existing `wrapAndFit`) down to the layer's minimum. Short titles stay at full size; long ones get smaller. Never truncated.
- If it still doesn't fit at the minimum size, the thumbnail is marked **Needs attention: title too long** and the producer shortens it with an override.

### 5.2 Speaker cards
- **Who:** the session's speakers from `event_agenda_session_speakers`. **Moderator(s) first** (`isModeratorRole` on the role tag), then the others in agenda order. Override: exclude a speaker, or reorder the non-moderators.
- **Layout:** `layoutFor(format, count)` from Stage Screens decides keynote / fireside / panel, so a "keynote" with two people uses the fireside layout.
- **Size:** for n cards in the speaker area, `card_width = min(max_card_width, (area_width − gap × (n − 1)) / n)`, card height from the card template's aspect ratio, all cards the same size, in one row, aligned per `align`, vertically top-aligned in the area. If the resulting height exceeds the area, shrink to fit the height instead.
- **Drawing:** each card is rendered from the `thumbnail_card` template for that speaker (cut-out + head box placed by the photo slot's alignment, as Website Photo does), then scaled to `card_width`.
- **Readable names:** after scaling, the name must be at least **28 px tall (cap height ~20 px) on the 1920×1080 design**, so it stays legible at YouTube's display sizes. Step 0 decides the method: render the card at its native size and downscale, or render it directly at the target size with font sizes floored at that minimum. If a name would fall below the minimum, mark **Needs attention: names too small** rather than silently shipping it.
- **Missing photo:** a speaker without a cleaned cut-out and confirmed head box blocks that thumbnail with **Needs attention: photo missing for <name>** (link to the speaker). No placeholder card is ever exported.
- **Company check:** when the event shows company and a speaker's company equals their name (e.g. "LAURA BUCKWELL" in the DFS panel sample) or is empty, show a warning on that thumbnail; it can still be generated.

### 5.3 Session type tag
Text = the agenda session's format label in capitals ("Keynote" → "KEYNOTE", "Panel Discussion" → "PANEL DISCUSSION"). Override possible. Sessions with no format fall back to the layout name ("Keynote" / "Fireside chat" / "Panel discussion").

### 5.4 Output
- Design canvas 1920×1080. Downloads: **1280×720 JPG under 2 MB** (YouTube) and the 1920×1080 PNG.
- File name like the samples: `session-<nnn>-id<konfhub_session_id>-<title-slug>` (nnn = position in the agenda by day and time, zero-padded; drop the `id…` part when the session has no KonfHub id).
- All visible text runs through the event's effective rules (`validateText`); findings shown on the thumbnail, errors block approval.

---

## 6. Settings (per event)
`event_thumbnail_settings (event_id PK, card_variant_id, layout_variant_ids JSONB {keynote, fireside, panel}, card_text 'name'|'name_company', updated_by, updated_at)`. Readiness: the Session Thumbnails page shows what's missing (card template, any of the three layouts) and generates nothing until all four exist.

---

## 7. Session Thumbnails page

Event workspace → **Session Thumbnails** (next to Stage Screens; Step 0 confirms the menu location). Permission: the one Stage Screens uses for producers, unless Step 0 finds a better fit.

- One row per agenda session that has speakers (sessions with no speakers, e.g. lunch, are not listed): day and time, title, layout, speaker count, thumbnail preview, status (`new` | `ready` | `changed` | `needs attention` | `approved`), warnings.
- **Generate all** / **Generate** per session. **Download** (JPG/PNG) per session and **Download all approved** as a ZIP.
- **Per-session overrides** (stored on the thumbnail, never on the agenda or speaker): title text, tag text, name and company per card, exclude a speaker, order of non-moderators.
- **Approve** (producer, same permission). Approved thumbnails are what the video pipeline will use later.
- **Changed:** fingerprint everything visible (title, tag, speakers, their names, companies, photos, templates, card text option, overrides), as Stage Screens does. When the agenda, a speaker or a template changes after generation, the row shows Changed; an approved thumbnail that changes goes back to `changed` and needs re-approval.

### Data
`session_thumbnails (id, event_id, agenda_session_id UNIQUE, overrides JSONB, fingerprint, image_png_path, image_jpg_path, status, warnings JSONB, approved_by, approved_at, created_at, updated_at)` plus an audit table. Images in the same storage as Stage Screens PNGs unless Step 0 finds a reason not to.

---

## 8. Out of scope
Two-colour titles or names; video frames on thumbnails; AI-written thumbnail headlines; YouTube upload; client approval of thumbnails (producer approval only for now).

---

## 9. Step 0 (report to Madhu before building)
1. How Stage Screens card mode renders a card from a variant, and how much of `render.ts` / `geometry.ts` can be reused for the row layout.
2. Where new variant categories are registered in the variant editor, and what the editor needs for a `speaker_area` layer and the pill option.
3. The name-size method from §5.2 (downscale vs render at target size) and why.
4. BSS 2026 counts: agenda sessions with speakers, by layout; speakers on those sessions **without** a cleaned cut-out and head box (names); sessions with a moderator.
5. Where Stage Screens sits in the workspace menu and its permission key.

---

## 10. Acceptance (throwaway test event first; then BSS setup is a producer/branding action)
1. Templates: build the BSS card (Layers 1–3 + name) and three layouts on the DFS test background in the editor; Generate Preview shows them.
2. Keynote: one speaker; title "Opening Remarks" at full size on the left, one large card on the right.
3. Long title: a 120-character title shrinks and wraps within the box; a 250-character one shows "title too long".
4. Fireside: two cards, moderator first with the moderator label; cards start from the left at full size.
5. Panel sizes: 4, 5 and 6 speakers each fit on one row with equal cards; names pass the minimum-size check at 6 (or show "names too small" with the size reported).
6. Card text: switch the event between name and name + company; company appears/disappears and the snapped layers close up; a company equal to the name shows the warning.
7. Missing photo blocks that thumbnail with the speaker's name; nothing exported.
8. Overrides: change a title and a card name for one session; the agenda and speaker record are unchanged.
9. Changed: edit a speaker's name in their record; that session's approved thumbnail goes to `changed`; others stay approved.
10. Output: JPG is 1280×720 and under 2 MB; PNG is 1920×1080; file names follow §5.4; ZIP holds approved ones only.
11. Regression: Stage Screens, website photos and an SAE announcement render byte-identical before and after for DFS and BSS.

Report results to Madhu before pushing. Own branch. Madhu runs migrations himself.

---

## 11. Step 0 decisions (Madhu, 15 Nov, after the Step 0 report)

1. **Speaker limit: 6.** Up to 6 speakers on one row, cards shrink to fit. 7 or more: **no second row, no photo-only cards.** The thumbnail is marked **"Needs attention: too many speakers, choose up to 6"** and is not generated until the producer excludes speakers (override) down to 6 or fewer. The moderator stays first and cannot be excluded while they are one of the 6. (BSS: the Inauguration has 18 and "Skill Champions" has 10.)
2. **No format: no tag.** A session with no agenda format gets no tag pill and the warning **"No session format: set it in the agenda or override the tag"**. Producers fix the 6 BSS sessions in the agenda. This replaces the layout-name fallback in §5.3.
3. **`speaker_area` is a new layer type** (not a field on the variant). Regression test: every existing renderer ignores it (announcements, website photo, badges, mementos, stage and table screens, previews).
4. **Cards are rendered at their final size** (a scaled copy of the card template), with the name floored at 28 px on the 1920x1080 design. Below that: "Needs attention: names too small".
5. **Page:** `stakeholders/thumbnails` (link beside Stage Screens), permissions `sae.screens.view` (see) and `sae.screens.manage` (generate, override, approve).
6. **Thumbnail card is its own 1024x1024 template** (`thumbnail_card`), separate from the 1024x1536 Stage Screen card.
7. Sample files for the build: `scripts/thumbnail-samples/` (git-ignored): `Samples/`, `bss26-session-thumbnail-template/` (with `Speaker details/`), `dfs-26-session-thumbnail-template/`.
