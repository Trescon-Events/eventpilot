# Session video pipeline (trial on BSS 2026)

**Date:** 6 Nov 2026. Discussed and agreed with Madhu (2–6 Nov). Proposed build, phased.
**Trial:** Bengaluru Skill Summit 2026 (`27edfe37-ab45-4656-922d-0503012c75a7`). The editing team is producing the real BSS session videos manually in parallel. **Nothing in this build publishes anything during the trial**; outputs are compared with the manual versions. If Phase 1 output is good, Madhu may use it for the real uploads.

---

## 1. Goal

From one raw session MP4 (already switched program feed, already trimmed to the session, English only), EventPilot produces everything a published session video needs:

- transcript with speakers named,
- title options, SEO description with chapters, speaker list and the event's standard footer,
- thumbnail options,
- lower thirds placed by rule on close-ups of whoever is speaking,
- templated intro and outro,
- the final rendered MP4, previewed and approved by the producer,
- upload to YouTube from EventPilot.

## 2. Phases

| Phase | Delivers | Needs |
|---|---|---|
| **1. Session pack (text + thumbnails)** | Upload → transcript → producer names the voices → titles, description, chapters, thumbnail options | Railway worker with FFmpeg, Gemini, a thumbnail template |
| 2. Faces and lower-third cues | Face grouping + headshot suggestions + producer confirm; shot and close-up detection; lower-third cue list; Premiere XML export for the editor | A face-recognition service (decision below) |
| 3. Intro, outro, full render | Template-driven intro/outro; final MP4 with lower thirds; preview + approve | Branding's intro/outro backgrounds |
| 4. Publish and ingest | YouTube upload with all metadata, playlist; SharePoint folder watching; automatic description updates when Copy Library items change | YouTube channel access; Graph Files permission |

**Build Phase 1 now.** Phases 2–4 are specified here so Phase 1's data model fits them, but each gets its own go-ahead after the previous phase works on real BSS footage.

---

## 3. Non-negotiables

1. **Additive only.** No change to SAE, press releases, agenda, Konfhub, screens or any existing table's behaviour.
2. **Nothing is published or sent automatically** in Phases 1–3.
3. **Original footage is never modified.** Work on copies; the original file in SharePoint or the upload is read-only.
4. **Face data (Phase 2): processed per session, deleted when the video is approved or after 30 days**, whichever comes first. Rejected faces (audience, crew) are never stored beyond the job. Record deletion in the job log.
5. **All generated text passes the event's effective rules** (`validateText`) before the producer sees it; findings shown inline.
6. Heavy work never runs in the Next.js request path: uploads go straight to storage, processing runs in the worker.

---

## 4. Step 0: look before building (report to Madhu first)

1. Hosting: confirm EventPilot runs on Railway (HANDOFF) and whether the repo is moving to Cloudflare (`@opennextjs/cloudflare`, `wrangler` in devDependencies). The worker below assumes Railway; say if that is wrong.
2. Storage: which bucket/service is already used for large files (`@azure/storage-blob`, Supabase storage, R2 via `aws4fetch`)? Pick the cheapest one already configured that handles multi-GB objects and resumable/multipart uploads from the browser.
3. BSS agenda: confirm `event_agenda_sessions` and `event_agenda_session_speakers` (with role, incl. Moderator) are populated for BSS 2026, and how many BSS speakers have a processed headshot.
4. Gemini: confirm the File API is usable with our key for audio and images, and the current per-file size limit.

---

## 5. Architecture (all phases)

- **Worker service on Railway**: a second service from the same repo (Docker image with FFmpeg + Node), polling a jobs table. No new queue infrastructure.
- **Jobs table** `video_jobs (id, session_video_id, kind, status queued|running|done|failed, attempts, error, started_at, finished_at, log JSONB)`. Kinds in Phase 1: `ingest`, `transcribe`, `thumbnails`, `text_pack`.
- **Storage layout** per session video: `original` (or a pointer to SharePoint), `proxy.mp4` (720p, for preview and analysis), `audio.m4a` (mono, for transcription), `frames/` (candidate stills), `thumbnails/`, later `render.mp4`.

---

## 6. Data model (Phase 1, shaped for later phases)

- `session_videos (id, event_id, agenda_session_id NULL, source 'upload'|'sharepoint', source_ref, original_path, proxy_path, audio_path, duration_s, status, created_by, created_at)`. One per uploaded MP4.
- `session_video_transcripts (session_video_id, segments JSONB, voices JSONB, model, created_at)`. `segments` = `[{start, end, voice_id, text}]`; `voices` = `[{voice_id, speaker_id NULL, rejected bool}]`.
- `session_video_text (session_video_id, titles JSONB, description_working TEXT, description_approved TEXT, chapters JSONB, tags JSONB, findings JSONB, approved_by, approved_at)`.
- `session_video_thumbnails (id, session_video_id, frame_path, frame_time_s, headline JSONB, image_path, selected bool, findings JSONB)`.
- Phase 2 will add `session_video_faces`, `session_video_shots`, `session_video_lower_thirds`; Phase 3 `session_video_renders`; Phase 4 `session_video_publications`.

---

## 7. Phase 1 in detail

### 7.1 Upload and session match
- New page **Event Workspace → Session Videos** (`/admin/events/[id]/session-videos`), permission new key `sae.videos.manage` (producers).
- **Upload** an MP4 directly to storage (multipart/resumable, progress bar). SharePoint ingest is Phase 4.
- **Session match**: suggest the agenda session from the file name (fuzzy match on session title, speaker surnames, stage/day); producer confirms or picks from a dropdown of the event's `speaker_session`-type sessions. Loads the session's speakers with roles.

### 7.2 Ingest (worker)
FFmpeg: probe duration, make `proxy.mp4` (720p, ~2 Mbps) and `audio.m4a` (mono, 64 kbps). Extract candidate frames: one at each scene change (FFmpeg scene detection), capped at ~60, plus one every 30 s as a floor.

### 7.3 Transcribe (worker)
Send `audio.m4a` to Gemini with a prompt for a verbatim English transcript as JSON segments with start/end seconds and a consistent voice label per distinct speaker. Give it the session's speaker names and roles as hints for spelling only, **not** to assign names. Validate JSON; retry once on malformed output. Keep the model name in the row so the provider can be swapped (AssemblyAI is the fallback if Gemini's timestamps or voice separation are poor; Phase 2 may need it for precise lower-third timing).

### 7.4 Producer names the voices
Screen: one row per detected voice with three short sample quotes (and a play button using the proxy at that timestamp). Producer picks the speaker from the session's speaker list, or "Not a speaker" (MC, audience question, interpreter). Unassigned voices are labelled "Speaker" in output. Save to `voices`.

### 7.5 Text pack (worker, after voices are named)
One Gemini call grounded in: the transcript (with names), the session's agenda title and speakers (names, titles, companies **from speaker records**, never from the transcript), the compiled reference, effective style notes and rules.

Returns:
- **5 title options**, under 70 characters, session topic first, then event name or speaker where it fits; no clickbait wording that misrepresents the content.
- **Description**: opening line (first ~150 characters: what the session is about, main keywords, event name), 2–3 paragraph summary, "Speakers" block, chapters.
- **Chapters**: `0:00` first, at least 3, each ≥10 s, from topic shifts in the transcript.
- **Tags**: 10–15.

Footer: append the event's approved `youtube_footer` from the Copy Library (`getCopyItem`, built 6 Nov). If none is approved, show "Footer not approved yet" in the review screen and leave it out of the description (do NOT add a temporary column). Record a `copy_library_usages` row (mode `live`) when a description is approved. Fill `{playlist_link}` with a placeholder the producer edits. If the description needs event-level figures, read them only through `getPublicFigures` (`public-figures.md`), never from the messaging doc.

Run `validateText` on title options and description; store findings.

### 7.6 Thumbnails: REPLACED (15 Nov 2026)

Thumbnails are now built from the agenda and speaker records, not video frames, in their own build: `session-thumbnails.md` (built first). Phase 1 only links each session video to the session's **approved** thumbnail and offers its download on the review screen. Ignore the original text below.

#### Original 7.6 (superseded)
1. Score the candidate frames with Gemini vision: prefer a single speaker in close-up, face sharp, eyes open, natural expression, no motion blur. Keep the top 5.
2. Generate **5 on-image headline options** from the transcript (short, specific, true to what was said: a striking claim, number or question from the session; reuse the Creative Headline segment shape lead/emphasis/trail from `generateHeadlines`).
3. Composite with **Sharp** using a new SAE variant category `thumbnail` (1280×720), built by branding in the existing Admin Console variant editor: photo slot = the chosen frame, text layers = headline segments, plus event branding layers. Reuse `compositeAnnouncement`.
4. Run each headline through the event's rules.

Producer sees a grid (frame × headline), can swap frame or headline per option, selects one, downloads the 1280×720 JPG (under 2 MB).

### 7.7 Review screen
Per session video: transcript (searchable, named), titles (pick one or edit), description editor with findings, chapters, tags, thumbnails. **Approve** stores `description_approved` and the selected title and thumbnail. **Copy all** button for the manual team (title, description, tags) and **Download thumbnail**.

### 7.8 Phase 1 acceptance (two real BSS sessions: one keynote, one panel)
1. A 45-minute MP4 uploads through the browser without timing out; the worker produces proxy, audio and frames.
2. Session match suggests the right agenda session from the file name.
3. Transcript: spot-check 3 passages against the video; voices separated well enough that each panel speaker maps to one voice (report how many voices were detected vs actual speakers).
4. Description: opening line works as a search snippet; chapters start at 0:00 and land within ~10 s of real topic changes; speakers' names and titles match their records; footer present; zero error-level rule findings.
5. Thumbnails: at least 3 of 5 options usable as-is by the producer's judgement.
6. Time from upload to text pack ready: report it.
7. Cost per session (Gemini + storage + worker): report it.
8. Regression: nothing else in the app changes.

---

## 8. Phases 2–4 (agreed behaviour, specified later)

### Phase 2: faces and lower thirds
- **Face grouping and suggestions**: detect faces on sampled frames, cluster per person, suggest names by comparing with the session speakers' headshots; producer confirms, re-assigns or rejects each group. **DECISION before Phase 2:** service. Options: AWS Rekognition Video (face search against a per-session collection + shot detection; strongest fit), Google Video Intelligence (face detection + shots, recognition would need our own matching), or self-hosted InsightFace on the worker. Depends on whether Trescon has AWS or Google Cloud accounts.
- **Voice-to-face linking**: a voice is linked to the face most often on screen while that voice speaks; producer can correct.
- **Close-up**: within a shot, one face whose height is at least ~20% of frame height (tunable).
- **Lower-third rules (Madhu, 3 Nov)**:
  - triggered by a close-up of the person who is speaking, held at least 3–4 s;
  - stays 6 s, **only if the same person stays on screen for the whole 6 s**; never overlaps another speaker's shot; if the shot would cut away sooner, wait for the next qualifying close-up;
  - keynote (single speaker): once, at the start; no repeats;
  - panels: every speaker at least once, **moderators included**; **DECISION:** repeat frequency for panels (none, or e.g. at most once per 10 minutes);
  - text = name, title, company from the speaker record.
- Outputs: cue list for review (nudge/remove), and a **Premiere XML** (FCP7 XML) with the clip and lower-third graphics placed, so the editor can open it in Premiere.

### Phase 3: intro, outro, render
- **Template approach (recommended):** branding designs the intro and outro in After Effects as usual and exports **background videos with empty space** for the session title and speaker names; EventPilot animates the text into that space (fonts, positions, colours set in the variant editor). Alternatives noted: rebuild in code (Remotion), or a cloud After Effects render service (e.g. Plainly). **DECISION before Phase 3.**
- One template set per event: intro, outro, lower third, thumbnail.
- Render with FFmpeg on the worker: intro + session + lower thirds + outro → MP4. Producer previews (proxy) and approves. Lower-third edits trigger re-render.

### Phase 4: publish and ingest
- **YouTube**: OAuth to the event's channel; upload the approved MP4 with title, description, chapters, tags, thumbnail; add to the event playlist (create on first publish); visibility public / unlisted / scheduled. Store the video id. **When a Copy Library item used in a published description changes and is re-approved, update the description automatically** (Madhu, 5 Nov), logged in usages.
- **SharePoint**: one folder per event; worker lists new MP4s via Microsoft Graph using the existing app registration (`MICROSOFT_CLIENT_ID/TENANT_ID/CLIENT_SECRET`, see `app/lib/email/graph-mail.ts`) with an added Graph application permission (`Sites.Selected` scoped to the one site preferred over `Files.Read.All`; needs Azure admin consent). File name → session suggestion as in 7.1.
- Review steps beyond the producer may be added after testing (Madhu, 3 Nov).

---

## 9. Prerequisites from Madhu (Phase 1)

1. Approve a Railway worker service (small monthly cost; FFmpeg work is CPU-bound).
2. Two BSS session MP4s for the trial (a keynote and a panel), uploaded through the new page once built.
3. BSS thumbnails approved on the Session Thumbnails page (`session-thumbnails.md`).
4. The BSS `youtube_footer` approved in the Copy Library (it is a draft as of 14 Nov).
