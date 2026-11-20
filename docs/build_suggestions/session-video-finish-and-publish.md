# Session videos: title cards, lower thirds, music, render and YouTube publishing

**Date:** 19 Nov 2026. Discussed and agreed with Madhu (19 Nov). Proposed build. Replaces phases 2–4 of `session-video-pipeline.md` §8 (that section's face-detection and Premiere-XML plans are dropped).
**Builds on:** Session Videos Phase 1 (live: upload / Drive import, ingest, transcript, voice naming and suggestions, text pack, approval), Session Thumbnails (live), the variant editor and compositor, Copy Library usages, the event Integrations page.
**Trial event:** DFS 2026 (`293bde73-22c0-40f0-b621-6306c9266d6a`).

---

## 1. The finished video

```
[intro 5 s] ~ [title card 5 s] ~ [session, with lower thirds] ~ [outro 5 s]
 music in -------- music under ---- music fades out as voice starts ... music back in under outro, fades out
 (~ = 0.5 s crossfade)
```

EventPilot renders it, the producer watches a low-resolution preview, then publishes it to the event's YouTube channel into the playlist mapped to the session's stage. No editor hand-off, no Premiere project.

## Build order (Madhu, 19 Nov: step by step, each tested before the next)

- **Step A (build now): title cards (§5) and the lower-third module (§6: template with layers and animation, per-speaker renders and downloads).**
- Step B: lower-third cues, music, render and preview (§6 cue rules, §7, §8).
- Step C: YouTube connection and publishing (§9).

Step 0 findings (19 Nov) that change the spec: the lower third is no longer an uploaded animation file (§6); the DFS session file is 25 fps, AAC 48 kHz stereo, about −22.7 LUFS with peaks above 0 dBTP (normalise and limit as §7 says); intro/outro confirmed 5 s, 24 fps, no audio, last frame matches the title card background; Drive-link import already exists.

## 2. Decisions (Madhu, 19 Nov)

1. **Source:** editors supply one trimmed file per session. Inputs: browser upload, Google Drive import (both live), plus **paste a Google Drive link** (new, reuses the Drive import).
2. **Title card** (name agreed for the "session detail slide"): generated and approved in the Session Thumbnails module, side by side with the thumbnail, **one approval for both**. About 5 s on screen, crossfade in and out.
3. **Lower thirds:** placed from the transcript (who speaks when), **6 s each**, a few times per speaker, not every time they appear. Producer can adjust.
4. **Music:** one background music file per event, uploaded by the team. Under the intro and title card, fading out as the session voice starts; back in under the outro. No loud start.
5. **Render and publish in EventPilot:** producer previews (low resolution) and publishes from EventPilot.
6. **YouTube:** channels are managed by Trescon Google accounts, including client channels such as DFS's own channel. Connect YouTube directly (Postiz has no playlist support and is not built for full-length uploads; it stays for social posts). Playlists are created by the team on YouTube; in EventPilot each **agenda stage is mapped to one playlist and locked**, and every published video goes into its stage's playlist.

## 3. Non-negotiables

1. **Nothing publishes without a producer clicking Publish** on a rendered, previewed video. No auto-publish.
2. **Originals are never modified.** Renders are new files.
3. **Additive.** Thumbnails, Stage Screens, SAE, Postiz publishing and Phase 1 behave exactly as today when none of the new settings are used.
4. **No event figures in any on-screen or YouTube text** (16 Nov rule) — names, titles, companies, session title, stage only.
5. **YouTube tokens are secrets:** stored encrypted, never sent to the browser, never logged. Disconnect revokes them.
6. Every publish, playlist mapping change, cue edit and approval is audited.

## 4. Video kit (per event, new "Video kit" panel on the Session Videos page)

| Item | Format | Notes |
|---|---|---|
| Intro / outro clip | MP4 or MOV | One file used for both by default (DFS: 5 s, 1920×1080, 24 fps, **no audio track**). Optional separate outro file. |
| Background music | MP3, WAV, AAC/M4A | One per event. Optional: if missing, render without music and show a warning. |
| Lower-third template | variant `lower_third` | Layers and animation built in the variant editor (§6). No animation file to upload. |
| YouTube channel | from the connected channels (§9) | |
| Stage → playlist map | table | Locked once saved; changing it needs an unlock with a reason (audited). |
| Publishing defaults | | Visibility (public / unlisted / private / scheduled), category, "made for kids" = no, language. |

Files live in the private video R2 bucket under `video-kit/<event>/…`. Readiness check on the panel lists what's missing; Render is blocked until the intro clip and lower-third pair exist (music optional).

## 5. Title cards (in the Session Thumbnails module)

Reference previews (DFS): `Working_Files/Post-Event/DFS-26-session-detail-slide/` (background, panel with 6, fireside with moderator, keynote).

**Templates (variant editor, like thumbnails):**
- `title_card_layout` (1920×1080): background; tag pill (`session_type`, existing pill option); **stage label** (new field `session_stage` = the agenda track/stage name, e.g. "Plenary - 1", printed as recorded); session title (`session_title`, shrink-to-fit with minimum); a new **`speaker_grid`** area: columns, max rows, gap, card size range. One layout for all session types (the DFS previews use the same layout for keynote, fireside and panel).
- `title_card_card` (horizontal): photo slot on the left; name (upper case), job title and company as text to the right, stacked with snap-below; a "Moderator" label layer with `show_for: moderator` placed above the card.

**Rules:**
- Same speakers and order as the session's thumbnail (moderator first, same exclusions), so one decision covers both. More than 6 → the existing "choose up to 6" applies to both.
- Grid: 1–3 speakers one row; 4–6 two rows of up to 3 (5 = 3 + 2, left-aligned, as the previews). Cards larger when fewer speakers (keynote and fireside use the large size).
- Names and titles never shortened: wrap, then shrink to fit, shared size across cards (same rule as thumbnails); job title up to 3 lines.
- Rule check on all text (long-form surface).

**UI:** each session row shows **Thumbnail | Title card** side by side, one status, **Approve both**. Any change to either (data, template, override) sets the pair back to Changed. Downloads: thumbnail JPG/PNG and title card PNG.

## 6. Lower thirds

**Cue generation** (after the voices are named, from the transcript):
- Each named speaker (moderators included) gets up to **3** cues; keynote (single speaker): **2** (at the start, and once around the midpoint).
- A cue starts **2 s into** a turn where that speaker talks continuously for **at least 8 s**, so the 6 s sit inside their own turn.
- Cues for the same speaker at least **8 minutes** apart; the first cue on that speaker's first qualifying turn.
- Never two lower thirds overlapping; at least 2 s between any two.
- Text = name, title, company from the speaker **record** (same source as the title card); voices marked "not a speaker" never get one.

**Cue editor** (on the review screen): list of cues (time, speaker); play the proxy at that time; move ±1 s / ±5 s; delete; add at the playhead for any session speaker. Any change marks the render out of date.

### 6a. The lower-third template (Step A) — built from layers, animated by EventPilot

Decision (Madhu, 19 Nov): branding builds the lower third in the same variant editor as thumbnails and badges; EventPilot animates it per speaker. No animation file. Designs stay simple.

**Variant `lower_third`** (canvas 1920×1080, transparent; the layers sit where they appear on screen):
- **Text layers** with fields `name`, `title`, `company` (from the speaker record, same as the title card) and the existing options: font, weight, size, colour, upper case, max lines, snap below, shrink to fit. Names and titles are never shortened.
- **Text with a background bar:** the existing `pill` option with a corner radius of 0 gives the cyan bar behind the job title in the DFS design; the bar's width follows the text (padding set on the layer).
- **Image layers** (PNG or SVG): optional lines, shapes, a logo.
- DFS reference (screenshot, 19 Nov): name in white bold capitals; job title in dark text on a cyan bar; company in white; lower left of the frame.

**Animation (simple presets):**
- Template timing: **total 6.0 s** (default), with **in** (default 1.5 s) and **out** (default 1.2 s); the hold is what remains.
- Per layer: an **entrance** and an **exit**, each one of: none, fade, slide up, slide from left, slide to right (exit), wipe (reveals left to right; meant for bars); plus a **start delay** (stagger) and easing (ease-out in, ease-in out).
- Defaults reproduce the DFS sample: layers fade and slide up from the bottom, staggered (bar first, then name, then title and company), and slide out to the right.
- Layers fully settled during the hold; nothing animates during the hold.

**Rendering:** each layer is drawn once as a transparent PNG at its final size for that speaker (text through the existing text planner, bars sized to the text); the motion is applied when compositing (position, opacity and crop over time), at the session's frame rate. Output for Step A:
- a **6 s transparent MOV per speaker** (ProRes 4444 with alpha, 1920×1080, 25 fps default or the session's rate) — editors can drop it straight into Premiere while the full render (Step B) isn't built yet;
- a **preview MP4** of the same animation over a frame from the session's video if one is uploaded, else over a neutral dark background.

**Editor preview:** the variant editor plays the animation with a sample speaker (name, title, company typed in the preview panel, like the thumbnail layout sample), including a long title to check the bar grows and wraps correctly.

**Where producers see it (Step A):** on the Session Thumbnails page, each session row shows its speakers' lower thirds (play preview, download MOV) next to the thumbnail and title card. They are approved with the pair ("Approve all three"), because they use the same speaker records. A change to a speaker's name, title or company marks them Changed with the thumbnail and title card.

Later (not now): an optional uploaded, text-free animated background layer for events that want a designed animation.

## 7. Music and audio

- **Loudness:** session audio normalised to about −16 LUFS integrated, final mix limited (true peak −1 dB) so nothing starts with a bang; music normalised so it sits below the voice wherever the two overlap during the fades.
- **Opening:** music fades in over 1.5 s at 0:00, plays under intro and title card, then **fades out over 3 s** starting 1 s before the session's first audio; session audio fades in over 1 s.
- **Closing:** session audio fades out over 1 s; music fades in over 2 s under the outro and fades out over its last 1.5 s.
- Music shorter than the music section: loop with a crossfade; longer: trim with the fade.
- The intro/outro clip has no audio track (DFS): the render supplies the music/silence track so every segment has audio (required for a clean join).

## 8. Render and preview (worker)

- New job kinds: `render` (final) and `render_preview`. Inputs: approved text pack, approved thumbnail + title card for the session, cues, video kit.
- **Output:** 1920×1080, the session's own frame rate (intro/outro and title card conformed to it), H.264 High, AAC 48 kHz stereo 192 kbps, `+faststart`. Encoder settings chosen in Step 0 for a good quality/time balance on the worker.
- **Crossfades:** 0.5 s video crossfade intro → title card, title card → session, session → outro.
- **Preview:** a 540p/720p low-bitrate copy of the final render, played in the browser, with the cue markers on the timeline.
- **Chapters:** the description's chapter times are shifted by the length of the intro + title card (minus the crossfade), and a first chapter "Introduction" at 0:00 is added (YouTube requires 0:00). Recomputed on every render from the actual offset.
- **Status:** text approved → cues ready → rendering → rendered (preview) → approved for publishing → publishing → published / failed (with the reason). A changed cue, kit file, title card or text pack marks the render out of date.
- **Storage:** final render kept until 30 days after publishing, then deleted (the YouTube copy is the master); preview deleted at the same time. Recorded in the job log.

## 9. YouTube connection and publishing

**Connect (event Integrations page, a new "YouTube channels" section beside the Postiz channels):**
- Google OAuth (scope `https://www.googleapis.com/auth/youtube`), offline access; the signed-in Trescon account picks the channel (brand channels included). Store channel id, title, thumbnail, encrypted refresh token, who connected it and when. A channel can be connected once and reused across events.
- Google Cloud project: **Internal** user type if all connecting accounts are in Trescon's Google Workspace (no Google review needed). Step 0 confirms.
- Admin-only connect/disconnect; producers only pick from connected channels.

**Stage → playlist mapping (Video kit):** list the event's agenda stages; for each, a dropdown of the channel's existing playlists (`playlists.list mine=true`, refreshable); Save and lock. A session with no mapped stage can still be published without a playlist, with a warning.

**Publish (per session video, producer, `sae.videos.manage`):**
1. Confirm screen: channel, playlist, visibility (public / unlisted / private / scheduled date-time in the event timezone), final title, the start of the description, thumbnail.
2. Worker uploads the final render directly from R2 with a **resumable** upload (`videos.insert`), sets title, description (with shifted chapters), tags, category, language, made-for-kids = no, visibility / `publishAt`.
3. `thumbnails.set` with the approved thumbnail (1280×720 JPG under 2 MB).
4. `playlistItems.insert` into the stage's playlist.
5. Store the YouTube video id and URL; record a Copy Library usage (live) for the footer.
- **Quota:** per Google's current quota page (checked 19 Nov), `videos.insert` has its own allowance of 100 calls a day per project at 1 unit each; `thumbnails.set` and `playlistItems.insert` use 50 units each from the 10,000-unit daily quota. So about 100 videos a day fit within defaults; **no quota increase is needed** (Step 0's "1,600 units per upload" is outdated). Show remaining capacity if a batch would exceed it.
- **Afterwards:** when the event's `youtube_footer` is re-approved, update the descriptions of that event's published videos automatically (`videos.update`), logged in usages (decided 5 Nov). Fill `{playlist_link}` with the stage playlist URL.
- **Bulk:** "Publish selected" queues several approved renders, one at a time.

## 10. Out of scope
Face or close-up detection for lower thirds; Premiere export; social clips; Shorts; captions/subtitles upload (later: the transcript could become YouTube captions); live streams.

## 11. Step 0 (report to Madhu before building)
1. **Lower-third sample** `/Users/madhu/Desktop/Working_Files/Post-Event/DFS Lower third Sample.mov`: codec, transparency, size, frame rate, length; when the in-animation settles and the out-animation starts; whether it contains placeholder text; a screenshot of the settled frame. Proposal for text timing.
2. **Intro/outro** `/Users/madhu/Desktop/Working_Files/Post-Event/DFS26-Intro-Outro.mp4`: confirmed 5 s, 1920×1080, 24 fps, H.264, no audio; check the last frame matches the title card background.
3. **A real DFS session file:** frame rate, audio format, loudness; render time on the worker for a 45-minute session at the proposed settings, and the worker's disk and CPU needs.
4. **Google Cloud:** is there a Trescon project; can the OAuth consent screen be Internal; YouTube Data API enabled; where the OAuth client id/secret go (Keys page).
5. **Agenda stages:** which field holds "Plenary - 1" and whether every DFS speaker session has one.
6. **Integrations page** and Session Thumbnails structure: where the YouTube section and the title card fit; reuse of `drawThumbnail` for title cards.
7. **Paste a Drive link:** whether the existing Drive import can take a shared link directly.

## 12. Acceptance (DFS; publishing tests to a private test channel or as Private, then deleted)
1. Video kit: upload intro, music, lower-third MOV, text template; readiness shows complete; a missing music file renders with a warning.
2. Title cards: keynote, fireside with moderator, 4-, 5- and 6-speaker panels match the DFS previews' structure; the pair approves with one click; editing a speaker's title sets both back to Changed.
3. Cues: a panel gets up to 3 cues per speaker, 8 min apart, none overlapping, all inside the speaker's turn; a keynote gets 2; editor move/delete/add works and marks the render out of date.
4. Render: intro → title card → session → outro with 0.5 s crossfades; music fades in from silence, out under the first words, back in under the outro; no clipping (true peak ≤ −1 dB); lower thirds 6 s with readable text; chapters shifted with "Introduction" at 0:00.
5. Preview plays in the browser; render time and cost per session reported.
6. YouTube: connect a channel; map two stages to playlists and lock; publish one video as Private: title, description with chapters, tags, thumbnail, playlist and visibility correct on YouTube; video id stored.
7. Footer re-approval updates the published description.
8. Regression: thumbnails, Stage Screens, SAE, Postiz posts and Phase 1 unchanged.

Report results before pushing. Own branch. Madhu runs migrations.
