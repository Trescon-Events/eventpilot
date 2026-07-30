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

  const pngBuffer = await sharp(imageBuffer).png().toBuffer()
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
  target_head_center_x: number // ratio 0-1, relative to the layer's box width
  target_head_center_y: number // ratio 0-1, relative to the layer's box height
  target_head_height: number   // ratio 0-1, relative to the layer's box height
  shot_type: ShotType
}

export type AlignmentTarget = PhotoAlignmentMeta & {
  box: { x: number; y: number; width: number; height: number } // where the photo_slot layer sits on the canvas
}

// Run once, when the branding team uploads a reference layer (a transparent
// PNG with a dummy photo already correctly positioned) for a photo_slot
// layer in the Creative Templates editor.
export async function deriveAlignmentTarget(referenceImageBuffer: Buffer): Promise<AlignmentTarget> {
  const { info } = await sharp(referenceImageBuffer).trim().toBuffer({ resolveWithObject: true })
  // Sharp reports trimOffsetLeft/Top as negative — the offset needed to
  // restore the trimmed region to its original position — so the box's
  // actual x/y is the negation (confirmed empirically: for a photo bleeding
  // to the canvas's right/bottom edges, -trimOffsetLeft/Top + width/height
  // landed exactly on the original canvas dimensions).
  const box = { x: Math.max(0, -(info.trimOffsetLeft ?? 0)), y: Math.max(0, -(info.trimOffsetTop ?? 0)), width: info.width, height: info.height }

  const trimmedBuffer = await sharp(referenceImageBuffer)
    .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .toBuffer()

  const head = await detectHeadBox(trimmedBuffer)
  if (!head) {
    // No face detected in the reference — fall back to a centered default;
    // the MM can still see this doesn't look right in the preview and swap
    // the reference image.
    return { box, target_head_center_x: 0.5, target_head_center_y: 0.35, target_head_height: 0.3, shot_type: 'shoulders' }
  }

  return {
    box,
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

    const realHeadHeightPx = head.heightRatio * realHeight
    const targetHeadHeightPx = target.target_head_height * target.box.height
    const scale = targetHeadHeightPx / realHeadHeightPx

    const scaledWidth = Math.round(realWidth * scale)
    const scaledHeight = Math.round(realHeight * scale)
    const scaled = await sharp(realPhotoBuffer).resize(scaledWidth, scaledHeight).toBuffer()

    const realHeadCenterXPx = head.centerXRatio * realWidth * scale
    const realHeadCenterYPx = head.centerYRatio * realHeight * scale
    const targetHeadCenterXPx = target.target_head_center_x * target.box.width
    const targetHeadCenterYPx = target.target_head_center_y * target.box.height

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

    return sharp(padded)
      .extract({ left: desiredLeft + padLeft, top: desiredTop + padTop, width: target.box.width, height: target.box.height })
      .toBuffer()
  } catch (e) {
    console.error('Face alignment failed, falling back to contain-centered fit:', e)
    return fallbackContainCenter(realPhotoBuffer, target.box)
  }
}

async function fallbackContainCenter(buffer: Buffer, box: { width: number; height: number }): Promise<Buffer> {
  return sharp(buffer).resize(box.width, box.height, { fit: 'cover' }).toBuffer()
}
