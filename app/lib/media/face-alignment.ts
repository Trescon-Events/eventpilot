// Face-aware photo alignment (SAE Phase C v4) — matches a real speaker's
// photo to a reference layer's head position/size so different shot types
// (headshot vs. shoulder vs. waist-level) line up consistently across
// variants. Uses Gemini (gemini-2.5-flash, structured output) for face
// detection — confirmed via a real test against a reference photo that it
// returns an accurate bounding box. Reuses the existing GEMINI_API_KEY;
// no new vendor (Google Cloud Vision was the original idea, dropped once
// this tested out reliable).
import sharp from 'sharp'
import { GoogleGenerativeAI, SchemaType, type ObjectSchema } from '@google/generative-ai'

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

export type HeadBox = {
  centerXRatio: number  // 0-1, relative to the input image's own width
  centerYRatio: number  // 0-1, relative to the input image's own height
  heightRatio: number   // 0-1, relative to the input image's own height
}

// Shot-type heuristic — informational only, used to flag a likely mismatch
// in the approval screen, not a hard gate (per-decision: let approval catch
// mismatches rather than blocking uploads). A rough v1 to refine against
// real samples, as expected going in.
export type ShotType = 'headshot' | 'shoulders' | 'waist' | 'full_body'

export function classifyShotType(heightRatio: number): ShotType {
  if (heightRatio > 0.45) return 'headshot'
  if (heightRatio > 0.25) return 'shoulders'
  if (heightRatio > 0.12) return 'waist'
  return 'full_body'
}

export async function detectHeadBox(imageBuffer: Buffer): Promise<HeadBox | null> {
  const schema: ObjectSchema = {
    type: SchemaType.OBJECT,
    properties: {
      face_detected: { type: SchemaType.BOOLEAN },
      box_2d: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.NUMBER },
        description: '[y0, x0, y1, x1] normalized 0-1000, bounding box of just the head/face (not the whole body)',
      },
    },
    required: ['face_detected', 'box_2d'],
  }

  const model = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
  })

  // Downscale before sending — detectHeadBox only ever returns normalized
  // 0-1 RATIOS (relative to whatever size Gemini sees), never pixels, so a
  // smaller image produces an IDENTICAL result, just with a much smaller
  // upload/inference payload (2026-08-04 perf pass: real speaker photos
  // this session have been as large as 2015x3583 — sent at full resolution,
  // base64-inflated ~33% on top, for a task that only needs coarse
  // localization). withoutEnlargement means a photo already smaller than
  // this never gets upscaled first.
  const pngBuffer = await sharp(imageBuffer).resize(768, 768, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/png', data: pngBuffer.toString('base64') } },
    { text: 'Detect the bounding box of the person\'s HEAD/FACE only (not their whole body or shoulders) in this image. Return box_2d as [y0, x0, y1, x1] normalized to a 0-1000 scale relative to image width/height.' },
  ])

  const parsed = JSON.parse(result.response.text()) as { face_detected: boolean; box_2d: [number, number, number, number] }
  if (!parsed.face_detected || !Array.isArray(parsed.box_2d) || parsed.box_2d.length !== 4) return null

  const [y0, x0, y1, x1] = parsed.box_2d
  return {
    centerXRatio: (x0 + x1) / 2 / 1000,
    centerYRatio: (y0 + y1) / 2 / 1000,
    heightRatio: (y1 - y0) / 1000,
  }
}

// What actually gets persisted on a PhotoSlotLayer (app/lib/announcements/
// composite.ts) — the box itself is just the layer's own x/y/width/height,
// no need to duplicate it here.
export type PhotoAlignmentMeta = {
  target_head_center_x: number // ratio 0-1, relative to reference_box_width (NOT the layer's live box width — see below)
  target_head_center_y: number // ratio 0-1, relative to reference_box_height
  target_head_height: number   // ratio 0-1, relative to reference_box_height
  shot_type: ShotType
  // The box dimensions these ratios were measured against — frozen at the
  // moment they were last set (either from the uploaded reference layer's
  // own trimmed size, or from a manual head-marker drag in the Template
  // Maker), NOT read live from the layer's current x/y/width/height.
  //
  // 2026-08-16 fix, per Madhu: a real speaker photo with more visible body
  // below the head (e.g. an arm) was getting hard-cropped, because the
  // layer's box was originally auto-sized via alpha-trim() to whatever the
  // ONE reference photo happened to show — tight in that specific case —
  // and target_head_height/center were ratios of THAT box. Before this fix,
  // dragging the box's own resize handles bigger (the obvious way to add
  // footroom) also silently rescaled/repositioned the head, because
  // alignAndCropPhoto() computed the head's target size/position as a
  // fraction of the box's LIVE width/height — so the box and the alignment
  // math were coupled with no way to change one without the other.
  // Freezing the reference dimensions here decouples them: the box
  // (layer.width/height) can be resized freely to add crop room around an
  // already-correctly-scaled-and-positioned head, since the head's target
  // pixel size/position no longer depends on the box's current size at all.
  //
  // Optional — legacy layers saved before this fix won't have these; every
  // read site falls back to the box's live dimensions, which reproduces
  // the exact old (coupled) behavior for those until they're next touched
  // (box resized, or the head marker dragged), at which point they get
  // frozen and become safe to resize going forward.
  reference_box_width?: number
  reference_box_height?: number
}

export type AlignmentTarget = PhotoAlignmentMeta & {
  box: { x: number; y: number; width: number; height: number } // where the photo_slot layer sits on the canvas
}

// Run once, when the branding team uploads a reference layer for a layer in
// the Creative Templates editor. `detectFace` and `trimToContent` are
// independent (2026-08-16, split apart after Madhu confirmed EVERY
// reference file — photo, logo, background, design element, text mockup —
// is always exported at the template's own full canvas size, same
// convention as a real Canva layer export, with the actual content
// positioned wherever it should visually sit and everything else
// transparent):
//
// - trimToContent: false — the box is simply the reference's own full
//   pixel dimensions, untouched. Correct whenever the reference file
//   itself (or something standing in its place) becomes the rendered
//   asset at generation time, so its own internal composition — where the
//   real content sits within the transparent canvas — already IS the
//   layout; trimming would only throw that away. Used for:
//     - Image layers (backgrounds, foreground overlays, design elements)
//       — the reference PNG stays the literal rendered asset forever
//       (composite.ts just resizes-to-box then composites at layer.x/y —
//       a full-canvas box at (0,0) is a no-op resize, and the file's own
//       alpha channel does the rest).
//     - photo_slot/speaker_photo — the reference gets REPLACED by a real
//       speaker's photo at generation time, scaled/positioned to match
//       the SAME head ratio the reference showed within its own full
//       frame (see alignAndCropPhoto). A whole session of "box too tight"
//       bugs traced back to trimming this down to the visible silhouette,
//       discarding the deliberate headroom/footroom around the person.
// - trimToContent: true — alpha-trim to the visible content's own
//   bounding box, same as before. Still correct for:
//     - Text layers — no asset ever gets composited here (live text
//       renders via wrapAndFit instead, the reference is analyzed and
//       discarded), so the box's job is "roughly where does the text sit
//       and how big an area does it need to wrap within" — a full-canvas
//       box would break wrapping/positioning/font-size-from-box-height
//       entirely, unlike a photo/image box which just gets bigger.
//     - photo_slot/speaker_logo & partner_logo — a REAL logo (always
//       standardized to Logo Engine's fixed-aspect Clean Logo Base)
//       replaces the reference too, but unlike a photo there's no "show
//       more if available" — the box just needs to be "how big and where
//       the logo sits," a small region, not the full canvas.
export async function deriveAlignmentTarget(referenceImageBuffer: Buffer, opts?: { detectFace?: boolean; trimToContent?: boolean }): Promise<AlignmentTarget> {
  const detectFace = opts?.detectFace ?? true
  // Historical default (before trimToContent existed as its own flag):
  // trim unless detecting a face. Callers added after 2026-08-16 should
  // pass trimToContent explicitly rather than lean on this.
  const trimToContent = opts?.trimToContent ?? !detectFace

  let box: { x: number; y: number; width: number; height: number }
  let detectionSourceBuffer = referenceImageBuffer
  if (trimToContent) {
    const { info } = await sharp(referenceImageBuffer).trim().toBuffer({ resolveWithObject: true })
    // Sharp reports trimOffsetLeft/Top as negative — the offset needed to
    // restore the trimmed region to its original position — so the box's
    // actual x/y is the negation (confirmed empirically: for a photo
    // bleeding to the canvas's right/bottom edges, -trimOffsetLeft/Top +
    // width/height landed exactly on the original canvas dimensions).
    box = { x: Math.max(0, -(info.trimOffsetLeft ?? 0)), y: Math.max(0, -(info.trimOffsetTop ?? 0)), width: info.width, height: info.height }
    if (detectFace) {
      detectionSourceBuffer = await sharp(referenceImageBuffer)
        .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
        .toBuffer()
    }
  } else {
    const metadata = await sharp(referenceImageBuffer).metadata()
    box = { x: 0, y: 0, width: metadata.width!, height: metadata.height! }
  }

  if (!detectFace) {
    return { box, reference_box_width: box.width, reference_box_height: box.height, target_head_center_x: 0.5, target_head_center_y: 0.35, target_head_height: 0.3, shot_type: 'shoulders' }
  }

  const head = await detectHeadBox(detectionSourceBuffer)
  if (!head) {
    // No face detected in the reference — fall back to a centered default;
    // the MM can still see this doesn't look right in the preview and swap
    // the reference image.
    return { box, reference_box_width: box.width, reference_box_height: box.height, target_head_center_x: 0.5, target_head_center_y: 0.35, target_head_height: 0.3, shot_type: 'shoulders' }
  }
  return {
    box,
    reference_box_width: box.width,
    reference_box_height: box.height,
    target_head_center_x: head.centerXRatio,
    target_head_center_y: head.centerYRatio,
    target_head_height: head.heightRatio,
    shot_type: classifyShotType(head.heightRatio),
  }
}

// At generation time: detect the real speaker's head, scale/position to
// match the target, crop-to-fill (cover — real content gets cropped rather
// than leaving gaps, per the confirmed decision). Falls back to a simple
// contain-centered fit if no face is detected or the alignment math fails
// for any reason — never throws.
//
// `cachedHeadBox`: pass the speaker's stored `photo_head_box` (detected
// once, at upload/crop time — see the upload-asset and crop-photo routes)
// to skip a fresh Gemini call here. Real bug found live (2026-07-30):
// without this, every single generate/regenerate re-ran detection from
// scratch, and LLM-based detection isn't perfectly deterministic call-to-
// call — the exact same unchanged photo could crop slightly differently
// each time, with no code or data actually changing. `undefined`/`null`
// (legacy speakers uploaded before photo_head_box existed) falls back to
// the original live-detection behavior.
export async function alignAndCropPhoto(realPhotoBuffer: Buffer, target: AlignmentTarget, cachedHeadBox?: HeadBox | null): Promise<Buffer> {
  try {
    const metadata = await sharp(realPhotoBuffer).metadata()
    const realWidth = metadata.width!
    const realHeight = metadata.height!

    const head = cachedHeadBox ?? await detectHeadBox(realPhotoBuffer)
    if (!head) return fallbackContainCenter(realPhotoBuffer, target.box)

    // Scale/position the head against the FROZEN reference dimensions, not
    // the box's live width/height — see PhotoAlignmentMeta's doc comment.
    // Falls back to the live box for legacy layers saved before that field
    // existed, reproducing the old (coupled) behavior unchanged for those.
    const referenceWidth = target.reference_box_width ?? target.box.width
    const referenceHeight = target.reference_box_height ?? target.box.height

    const realHeadHeightPx = head.heightRatio * realHeight
    const targetHeadHeightPx = target.target_head_height * referenceHeight
    const scale = targetHeadHeightPx / realHeadHeightPx

    const scaledWidth = Math.round(realWidth * scale)
    const scaledHeight = Math.round(realHeight * scale)
    const scaled = await sharp(realPhotoBuffer).resize(scaledWidth, scaledHeight).toBuffer()

    const realHeadCenterXPx = head.centerXRatio * realWidth * scale
    const realHeadCenterYPx = head.centerYRatio * realHeight * scale
    const targetHeadCenterXPx = target.target_head_center_x * referenceWidth
    const targetHeadCenterYPx = target.target_head_center_y * referenceHeight

    // Desired crop rectangle in the SCALED image's coordinate space — may be
    // negative or extend past the scaled image's edges if the source photo
    // doesn't have enough peripheral content around the head to fill the
    // whole box at this scale (a genuine shot-type mismatch — a tight
    // headshot scaled to match a waist-level target, for instance). Padding
    // with transparency preserves the deliberately computed head scale
    // (re-fitting the whole box would silently re-scale the head, defeating
    // the alignment entirely) and leaves any gap visible in the approval
    // preview, exactly where this is meant to be caught.
    const desiredLeft = Math.round(realHeadCenterXPx - targetHeadCenterXPx)
    const desiredTop = Math.round(realHeadCenterYPx - targetHeadCenterYPx)

    const padLeft = Math.max(0, -desiredLeft)
    const padTop = Math.max(0, -desiredTop)
    const padRight = Math.max(0, (desiredLeft + target.box.width) - scaledWidth)
    const padBottom = Math.max(0, (desiredTop + target.box.height) - scaledHeight)

    const padded = padLeft || padTop || padRight || padBottom
      ? await sharp(scaled).extend({ left: padLeft, top: padTop, right: padRight, bottom: padBottom, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
      : scaled

    const cropped = await sharp(padded)
      .extract({ left: desiredLeft + padLeft, top: desiredTop + padTop, width: target.box.width, height: target.box.height })
      .toBuffer()

    // Sanity-check the actual pixel content before trusting it — a cached
    // head_box can point at empty background (bad detection, or a manual
    // entry error) while still landing fully in-bounds, so extract() above
    // never throws and this silently produces a fully transparent crop that
    // composites as an invisible photo with zero signal anything went wrong
    // (real incident, 2026-08-03). alpha max === 0 means not a single pixel
    // in this crop is opaque — the person isn't in it at all.
    const { channels } = await sharp(cropped).stats()
    if (channels.length > 3 && channels[3].max === 0) {
      console.error('Face alignment produced a fully transparent crop (head_box points at empty background) — falling back to contain-centered fit')
      return fallbackContainCenter(realPhotoBuffer, target.box)
    }

    return cropped
  } catch (e) {
    console.error('Face alignment failed, falling back to contain-centered fit:', e)
    return fallbackContainCenter(realPhotoBuffer, target.box)
  }
}

async function fallbackContainCenter(buffer: Buffer, box: { width: number; height: number }): Promise<Buffer> {
  return sharp(buffer).resize(box.width, box.height, { fit: 'cover' }).toBuffer()
}
