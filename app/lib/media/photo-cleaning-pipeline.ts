// Cleaning Cycle pipeline (2026-08-21, renamed from website-photo-pipeline.ts
// — this no longer has anything to do with website photos specifically).
// Runs once per speaker, standardizing their photo_processed_url itself
// (see clean-photo/generate + finalize routes) rather than being invoked
// per-creative. Every downstream consumer (SAE's own creative generation,
// the Website Photo generator) then reads an already-clean photo — neither
// makes its own AI decision anymore. See composite.ts's CleaningCycleTemplate
// doc comment for how this fits into the broader pipeline.
//
// The design, in one sentence: the deterministic crop (alignAndCropPhoto,
// unchanged) ALWAYS does the real positioning work using a HUMAN-CONFIRMED
// head box — never a blind automated detection, which is proven unreliable
// (real incident: repeated detection on the same unchanged photo swung
// from 0.15 to 0.68 for the same head-height ratio), and — as of 2026-08-22
// — never GPT's own visual/numeric judgment of "correct" proportions
// either (two prior AI-steering techniques were tried and replaced after
// real testing showed neither was precise enough — see
// generateAIFilledPhoto's own doc comment for what was tried and why).
// AI is only invoked when the PRODUCER explicitly chooses "AI Fill +
// Enhance" in the wizard's Compose step (2026-08-22 — was an automated
// padding-heuristic gate, checkQualityGate, removed after repeated real
// false positives/negatives; a human looking at the actual composed canvas
// replaces a prediction of what that canvas would look like), and even then
// it's only ever asked to fill already-correctly-placed transparent gaps
// (generateAIFilledPhoto) — positioning/scaling is 100% deterministic math
// in every code path, with no exception.
import sharp from 'sharp'
import { alignAndCropPhoto, type AlignmentTarget, type CropPadding, type HeadBox } from './face-alignment'

export { CLEANING_CYCLE_CANVAS_SIZE } from './cleaning-cycle-constants'

// Shared by finalizeCleaningCycle (what counts as a real per-edge gap
// worth flagging) and generateAIFilledPhoto (which edges' prompt
// instructions actually apply to a given photo) — a few px of rounding/
// sub-pixel noise, not a real missing-content gap.
const PADDING_WARNING_THRESHOLD_PX = 3

// Deterministic-placement + masked-fill (2026-08-22) — the AI-fill
// technique, after two prior approaches were tried and replaced on real
// evidence:
//   1. Two annotated reference images (a red circle on the source photo, a
//      red circle on the branding team's template photo), asking GPT to
//      match the circles by eye. Real problem: on a real generation,
//      comparing the actual output against the template showed the head
//      rendered meaningfully larger/higher than the template specifies —
//      pure visual circle-matching wasn't precise enough.
//   2. The same two images, PLUS the exact target numbers (percentages,
//      pixel coordinates, plain English) stated explicitly in the prompt.
//      Real problem: measured on a real generation, the head STILL landed
//      at the wrong position (hairline at 3.6% down vs. a 17.2% target) —
//      explicit numbers alone didn't fix it either. Even precise text
//      instructions couldn't make the model reliably solve "infer the
//      right scale and position" as a side effect of image generation.
// Both got replaced, not layered on top of — a generative model asked to
// simultaneously (a) figure out the right scale/position AND (b) invent
// missing content was being asked to do the one thing (precise spatial
// compliance) it's genuinely not reliable at, on top of the thing it's
// actually good at (plausible content generation).
//
// This splits those two jobs: use the SAME deterministic math the
// "already good enough" fast path already trusts (alignAndCropPhoto, via
// finalizeCleaningCycle) to place the person's head at the EXACT target
// ratios FIRST — free, instant, perfectly precise by construction, no AI
// involved. Whatever the source photo doesn't reach stays transparent
// (exactly what hasRealContentGap already measures). ONLY THEN is GPT
// asked to do the one job it's suited for: fill the transparent gaps with
// plausible extended body content, told explicitly not to move/resize
// what's already there.
//
// Caveat, confirmed via OpenAI's own developer community (2026-08-22,
// before building this): gpt-image-2's mask parameter is NOT a hard
// pixel-preservation guarantee — "the entire image must be regenerated as
// a new output... you cannot have perfect preservation" (official OpenAI
// staff reply, reports of gpt-image-2 specifically). So this is not a
// magic fix — but starting from an already-correct layout should still
// anchor the result far closer to it than generating from a totally
// different reference photo's proportions ever could, and the mandatory
// human confirm step (Confirm Cleaned Photo) still catches it either way
// if it drifts too far (2026-08-22: the automated hasRealContentGap
// ground-truth check that used to back this up was removed after a
// second real false-positive incident — see .../clean-photo/finalize's
// own doc comment).
//
// Hair extension (2026-08-22, added per Madhu, after a real case: a
// source photo's own raw crop cut into the hairline, and our earlier
// prompt only ever told GPT what to do with a gap below the shoulders or
// out in empty background — never one directly above the head, so it was
// silently filled with plain green instead of hair). No new mask logic
// was needed: finalizeCleaningCycle already leaves that area transparent
// whenever the source photo doesn't reach it, exactly like the
// below-the-shoulders case — the fix is a third prompt case telling GPT
// what THAT specific transparent region means. Deliberately scoped far
// more narrowly than the body-extension case: explicitly forbidden from
// touching the face, changing hairstyle, or changing hair color, on top
// of the prompt's own opening face-preservation rule — hair is
// structurally harder for any generative model to continue seamlessly
// than a plain garment, and an inaccurate hairline is a much more
// consequential kind of error than an imperfect shoulder, so this leans
// on redundant, explicit constraints rather than trusting one line of
// instruction. The mandatory human confirm step is still the real
// backstop if it goes wrong regardless.
//
// Conditional per-edge instructions (2026-08-22, second real incident —
// Raunak Mehta: raw photo already had generous margin above a fully
// visible head, needing only a small torso extension at the bottom, but
// the AI invented/altered hair anyway, unprompted, and a second
// "Regenerate at Higher Quality" run made it worse). Root cause: the
// prompt told GPT to "extend hair upward" UNCONDITIONALLY on every
// generation, regardless of whether finalizeCleaningCycle's own padding
// math found a real gap there to fill — and per this file's own
// documented OpenAI caveat, the mask isn't a hard pixel-preservation
// guarantee, so an instruction describing a case that doesn't apply can
// still nudge the model into touching a region the mask marks opaque
// (real content, preserve). The fix: read finalizeCleaningCycle's own
// cropWarning (the exact per-edge padding it already computes — no new
// detection logic) and only include the "extend hair"/"extend body"
// instructions when that specific edge actually has a real gap; every
// other edge gets an explicit "already complete, do not touch it at all"
// instruction instead of silence, since an unstated case is exactly what
// let the model improvise last time.
//
// REGRESSION CHECKLIST (2026-08-22, per Madhu: "each and every fix we did
// for previous speakers should still work even after implementing the new
// fix" — real generations are too costly to re-run as an automated test
// suite, so this is the durable record instead. Before changing anything
// in hairInstruction/bottomInstruction/leftInstruction/rightInstruction,
// re-read these — a change that fixes a new case but silently breaks one
// of these is not a fix). Every case below was confirmed with the
// [generateAIFilledPhoto] diagnostic log AND by visually inspecting the
// actual generated result:
//   - Raunak Mehta: top padding ~0px (hair already fully visible with
//     margin) → hair must NOT be touched at all. This is what the
//     needsTopFill=false branch (below) exists for.
//   - Keeratpal Singh: top padding ~150-155px, a REAL, large,
//     zoom-unclosable gap (this event's template wants a small head on a
//     spacious canvas; the raw photo's own framing can't close it without
//     violating head-size matching) → hair fill is necessary, but must be
//     conservative — exactly enough to reach the edge, no added volume/
//     height/thickness. This is what "do NOT overshoot" in the
//     needsTopFill=true branch exists for (the ORIGINAL bug here was
//     telling GPT to overshoot "like the torso case," which is safe for
//     torso — invisible, cropped — but reads as invented extra hair when
//     applied to hair).
//   - Ganeshbabu Nagarajan: top padding ~8px after the producer followed
//     the Compose "zoom in closer" hint (was 70-160px before zooming) →
//     a TINY real gap must ALSO be filled precisely, not skipped (it's
//     still real, needsTopFill is still true) and not overshot — same
//     conservative instruction as the large-gap case handles this
//     correctly, confirming the "exactly enough, no more" wording scales
//     down as well as it constrains the large-gap case.
export async function generateAIFilledPhoto(
  sourceBuffer: Buffer,
  headBox: HeadBox,
  target: AlignmentTarget,
  customNotes?: string,
  // 'medium' by default for every run — 'high' costs meaningfully more per
  // generation (2026-08-22, per Madhu: don't apply the costlier tier to
  // everyone by default; offer it as an opt-in re-run once a producer has
  // actually looked at the medium-quality result and judged it needs a
  // sharper pass, not before). See PhotoCleaningWizard's "Regenerate at
  // Higher Quality" button on Confirm Cleaned Photo for where this comes
  // from.
  quality: 'medium' | 'high' = 'medium',
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  // Person placed at the EXACT target ratios, real content opaque,
  // everything else transparent — same crop the good-fit fast path itself
  // trusts, just not yet knowing if it'll have real gaps. cropWarning
  // carries the exact per-edge padding this same math already computed —
  // reused below to decide which prompt cases actually apply, rather than
  // describing a case (e.g. "extend hair") on every single generation
  // regardless of whether this particular photo has that gap at all.
  //
  // Split into FOUR independent edges, not two (2026-08-22, second real
  // incident — Keeratpal Singh: raw photo had full hair margin AND needed
  // arm filling at the sides, and the hair still got altered). Root cause
  // of what the top/bottom-only split missed: the original single "body"
  // instruction bundled the BOTTOM edge (torso) together with the LEFT/
  // RIGHT edges (arms/shoulders) as one case — a real gap on the sides
  // alone still triggered the full bundled "extend body" wording even
  // when the bottom was already complete, and vice versa. Each edge now
  // gets its own independent check and its own explicit instruction.
  const { buffer: placed, cropWarning } = await finalizeCleaningCycle(sourceBuffer, headBox, target)
  const needsTopFill = (cropWarning?.top ?? 0) > PADDING_WARNING_THRESHOLD_PX
  const needsBottomFill = (cropWarning?.bottom ?? 0) > PADDING_WARNING_THRESHOLD_PX
  const needsLeftFill = (cropWarning?.left ?? 0) > PADDING_WARNING_THRESHOLD_PX
  const needsRightFill = (cropWarning?.right ?? 0) > PADDING_WARNING_THRESHOLD_PX
  // Diagnostic only — this exact failure mode (AI touching a region the
  // deterministic math says is already complete) has recurred more than
  // once; kept as a permanent log, not a throwaway, so a future report
  // can be checked against what this run actually measured rather than
  // guessed at.
  console.log('[generateAIFilledPhoto] edge padding (px):', cropWarning, '→ fill top/bottom/left/right:', needsTopFill, needsBottomFill, needsLeftFill, needsRightFill)

  // `image`: what GPT edits — needs a real (non-transparent) background to
  // generate against, same reason the old prompt asked for a green-screen
  // OUTPUT (GPT Image 2 can't output transparency for this model either).
  const imageBuffer = await sharp(placed).flatten({ background: { r: 0, g: 255, b: 0 } }).png().toBuffer()
  // `mask`: transparent = edit, opaque = preserve (OpenAI's own documented
  // semantics) — `placed` already has exactly this shape by construction:
  // opaque wherever the deterministic crop found real pixels, transparent
  // wherever it didn't. No separate mask-building step needed.
  const maskBuffer = placed

  const hairInstruction = needsTopFill
    ? `- Where a masked area is directly adjacent to the TOP of their head (above their existing visible hair), extend their hair upward by EXACTLY enough to reach the top edge of the canvas — same hair color, texture, and style as what's already visible immediately below it, tapering naturally. This is the ONE exception to "generate more than needed" elsewhere in these instructions: for hair specifically, do NOT overshoot, do NOT add extra volume, height, or thickness beyond precisely what's needed to reach the edge — any excess reads as a visibly different, larger hairstyle than the person actually has, which is a mistake, not a safe margin. If you are unsure how much hair to add, add LESS rather than more. Do not invent a different hairstyle, do not change hair color or length, and do not let the extended hair touch or alter any part of the face — the preservation rule above still applies without exception.`
    : `- Their head and hair are already fully visible with real content reaching the top of the canvas — there is NO missing area above their head. Do not modify, retouch, extend, or alter their hair or head in ANY way, not even slightly; leave that entire region exactly as shown, pixel for pixel.`
  const leftInstruction = needsLeftFill
    ? `- Where a masked area is directly adjacent to the LEFT edge of the frame (their arm, shoulder, or sleeve on that side), extend it naturally — more of the same arm and clothing already visible there (same color, pattern, fabric). Do not invent a different garment or change their pose.`
    : `- The left edge of the frame already has real content reaching it — there is NO missing area on that side. Do not modify, retouch, extend, or alter anything along the left edge in ANY way; leave it exactly as shown, pixel for pixel.`
  const rightInstruction = needsRightFill
    ? `- Where a masked area is directly adjacent to the RIGHT edge of the frame (their arm, shoulder, or sleeve on that side), extend it naturally — more of the same arm and clothing already visible there (same color, pattern, fabric). Do not invent a different garment or change their pose.`
    : `- The right edge of the frame already has real content reaching it — there is NO missing area on that side. Do not modify, retouch, extend, or alter anything along the right edge in ANY way; leave it exactly as shown, pixel for pixel.`
  const bottomInstruction = needsBottomFill
    ? `- Where a masked area is directly adjacent to the BOTTOM of their visible torso (below the shoulders), extend their torso naturally downward — more of the same shoulders, torso, clothing, in the SAME color/pattern/fabric already visible. Do not invent a different garment. Generate MORE than you think is needed: it should reach visibly past the bottom edge of the canvas, not stop exactly at it — err on the side of filling more of the frame, never leaving a gap.`
    : `- Their torso already reaches the bottom of the canvas with real content — there is NO missing area below their shoulders/torso. Do not modify, retouch, extend, or alter their torso or clothing in ANY way; leave that entire region exactly as shown, pixel for pixel.`

  const prompt = `The person in this image is already correctly sized and positioned — do NOT move, resize, rescale, or otherwise alter them in any way. Their face — eyes, nose, mouth, ears, skin, expression — must stay pixel-for-pixel exactly as shown, no exceptions.

Fill ONLY the transparent/masked areas — everywhere else, per-region instructions below take priority over any general impulse to "improve" or "complete" the image:
${hairInstruction}
${leftInstruction}
${rightInstruction}
${bottomInstruction}
- Where a masked area is empty space away from their body (not adjacent to them), fill it with the same solid, evenly-lit chroma-key green background already shown elsewhere in the image — flat and uniform, no gradients, no shadows, no texture, no vignetting.
- While filling, also apply a light overall enhancement to the whole image — subtly improve exposure, contrast, and sharpness — but keep it minimal: the person's existing pixels, position, scale, and clothing color/pattern must stay exactly as instructed above.${customNotes ? `\n\nAdditional notes from the branding team: ${customNotes}` : ''}`

  const form = new FormData()
  form.append('model', 'gpt-image-2')
  form.append('prompt', prompt)
  form.append('size', '1024x1024')
  form.append('quality', quality)
  form.append('image[]', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), 'source.png')
  form.append('mask', new Blob([new Uint8Array(maskBuffer)], { type: 'image/png' }), 'mask.png')

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GPT Image 2 edit failed (${res.status}): ${text.slice(0, 300)}`)
  }
  const json = await res.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('GPT Image 2 returned no image')
  return Buffer.from(b64, 'base64')
}

// Strips GPT Image 2's baked-in green-screen backdrop via PhotoRoom's own
// dedicated green-screen mode (2026-08-21). History: this went through
// three failed attempts at a hand-rolled color-key first (bare brightness
// threshold, then +decontamination, then +flood-fill-from-border) — each
// fixed a real bug the last one had (a white halo, then edge color spill,
// then a highlight-on-the-face smudge) but STILL left visible artifacts on
// real photos despite passing every synthetic test thrown at it. Per Madhu,
// rightly: three rounds of custom patches that keep finding new failure
// modes on real data is a sign to stop guessing and check what the
// dedicated tool actually supports, not tune a fourth threshold.
//
// It supports exactly this: PhotoRoom's /v1/segment (the SAME endpoint
// already used for real photo uploads elsewhere in this app) takes a
// `despill=true` parameter specifically for green-screen input —
// documented at docs.photoroom.com/remove-background-api-basic-plan/
// green-screen-despill.md — "automatically removes colored reflections
// that have been left on the main subject by a green background," which is
// the professional version of the decontamination this file's abandoned
// custom key was trying to hand-roll. The earlier "PhotoRoom fails on
// AI-generated images" finding (see git history) was only ever tested
// against the OLD white backdrop, before DEFAULT_FILL_PROMPT switched to
// green — never actually tested against green input until now.
export async function removeGreenScreenBackground(buffer: Buffer): Promise<Buffer> {
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (!photoRoomKey) throw new Error('PHOTOROOM_API_KEY not configured')

  const form = new FormData()
  form.append('image_file', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), 'ai-extended.png')
  form.append('output_type', 'rgba')
  form.append('despill', 'true')

  const res = await fetch('https://sdk.photoroom.com/v1/segment', {
    method: 'POST',
    headers: { 'x-api-key': photoRoomKey },
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PhotoRoom green-screen removal failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

export type FinalizeResult = { buffer: Buffer; cropWarning: CropPadding | null }

// The deterministic tail every path (good-fit fast path, and the needs-fix
// confirm path) shares: crop to the Cleaning Cycle template's target head
// position/size. Deliberately does NOT composite onto any background —
// unlike a single creative's own generation, this result is the shared,
// background-agnostic cleaned photo every consumer (SAE, Website Photo)
// composites for itself afterward, same as photo_processed_url always was.
// Only ever fed a HUMAN-CONFIRMED head box.
export async function finalizeCleaningCycle(
  workingPhotoBuffer: Buffer,
  headBox: HeadBox,
  target: AlignmentTarget,
): Promise<FinalizeResult> {
  const { buffer: cropped, padding } = await alignAndCropPhoto(workingPhotoBuffer, target, headBox)

  const cropWarning = Math.max(padding.left, padding.top, padding.right, padding.bottom) > PADDING_WARNING_THRESHOLD_PX
    ? padding
    : null

  return { buffer: cropped, cropWarning }
}

// Ground-truth check on the ACTUAL cropped result's pixels — not a
// prediction from head-box/target ratios (checkQualityGate), which goes
// blind exactly when it matters most: once a photo has been through the
// Cleaning Cycle even once, its photo_head_box is set to EXACTLY match the
// template's own target ratios (that's what "cleaned" means — see
// finalizeCleaningCycle callers). Comparing the target against itself
// always predicts zero padding by construction, regardless of what's
// actually in the pixels — real bug found live, 2026-08-21: a speaker's
// Cleaned Photo had a genuine gap at the bottom, and re-running Clean
// Photo against it kept reporting a perfect fit every time, because the
// ratio math had no way to know the target's own promise wasn't kept.
// Sampling actual alpha values at the crop's own edges is immune to that —
// it can't be fooled by any upstream ratio bookkeeping, only by what's
// really there.
//
// Only the BOTTOM edge is checked, and only its center band — a second
// real incident, 2026-08-21 (Alex P'ng): a full perimeter check flagged a
// perfectly good photo as gapped, because it also checked the top/left/
// right edges and the bottom corners. Pulled up the Cleaning Cycle
// template's OWN reference photo (the human-approved "correct" example) to
// settle it — its top/left/right edges are 100% transparent along their
// ENTIRE length, and even its bottom edge is only opaque in the center
// (roughly the middle 60%, tapering to nothing at the corners). That's not
// a defect, it's just what a shoulders-width person's silhouette looks like
// inside a rectangular frame — the shoulders taper before they reach the
// corners, and a headshot's hair/face never reaches the top or sides at
// all. Every real gap incident so far (this one included) has been the
// SAME failure: the AI-extended torso stopping short of the bottom edge —
// never a missing top/side. Checking only the bottom-center band catches
// that failure mode without flagging the template's own legitimate shape.
//
// Requires a CONTIGUOUS run of gap pixels, not any single one — a third
// real incident, same day, same speaker: PhotoRoom's segmentation left a
// 1-2px sliver of transparency along a jacket lapel fold (a dark crease
// shadow it partly mistook for background), invisible to the eye against
// navy fabric, and the previous version flagged it as if it were a missing
// content region. A minimum run WIDTH tells those apart: a stray 1-2px
// notch from segmentation noise can't reach it, but an actual unfilled
// patch of torso always will.
//
// Also requires the run to sit at least MIN_GAP_DEPTH_PX inward from the
// true edge, not just past a few px of anti-aliasing — a fourth real
// incident, same day, same speaker again: a hand-corrected head box (the
// auto-suggested circle had visibly missed the hairline, so a real
// correction was unavoidable) produced a crop with a dead-straight,
// fully-opaque-to-fully-transparent cliff exactly 10px deep at the very
// bottom edge — real, but a hairline at 1024px canvas height, invisible
// once this gets composited into an actual creative, nothing like Alex's
// original ~200px cutoff that was plainly visible cutting through text.
// Checking only a few px inward (the previous EDGE_STRIP_PX = 6) landed
// INSIDE that harmless sliver and blocked a perfectly usable photo.
// MIN_GAP_DEPTH_PX is deliberately generous — comfortably past what any
// legitimate crop-boundary/registration artifact has produced so far,
// while still catching anything a human would actually perceive as the
// torso not reaching the bottom.
const GAP_ALPHA_THRESHOLD = 200
const BOTTOM_CENTER_FRACTION = 0.5
const MIN_GAP_RUN_PX = 24
const MIN_GAP_DEPTH_PX = 40
export async function hasRealContentGap(buffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const alphaAt = (x: number, y: number) => data[(y * width + x) * channels + 3]
  const xStart = Math.round(width * (0.5 - BOTTOM_CENTER_FRACTION / 2))
  const xEnd = Math.round(width * (0.5 + BOTTOM_CENTER_FRACTION / 2))
  const checkY = height - MIN_GAP_DEPTH_PX
  let runLength = 0
  for (let x = xStart; x < xEnd; x++) {
    if (alphaAt(x, checkY) < GAP_ALPHA_THRESHOLD) {
      runLength++
      if (runLength >= MIN_GAP_RUN_PX) return true
    } else {
      runLength = 0
    }
  }
  return false
}
