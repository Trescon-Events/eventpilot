import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { deriveAlignmentTarget } from '@/app/lib/media/face-alignment'
import { detectTextStyle } from '@/app/lib/media/text-style-detection'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/templates/derive-alignment
   multipart/form-data: file (a transparent PNG reference layer, showing a
   dummy photo/logo/graphic/text already correctly positioned — same shape
   as what the target layer's real asset will look like), event_id,
   detect_face ('true'|'false'), detect_text_style ('true'|'false')

   Run once, when the branding team uploads a reference layer for ANY layer
   type (image/text/photo_slot — generalized 2026-08-01, was photo_slot-only)
   in the Creative Templates editor — combines alpha-trim box detection
   (works identically for every layer type: text, graphic art, a photo, all
   just "find the non-transparent content's bounding box") with, ONLY for a
   real speaker photo, Gemini face detection to also derive the target head
   position/size within it. See app/lib/media/face-alignment.ts.
   `detect_face=false` (sent for image/text layers, and for photo_slot
   layers whose source isn't speaker_photo — see PhotoSlotLayerFields'
   isPhoto) skips that Gemini call entirely: it's wasted cost against a
   text/graphic reference, and would produce meaningless alignment data
   composite.ts already ignores for anything but speaker_photo.

   `detect_text_style=true` (2026-08-02, text layers only) runs a SEPARATE
   Gemini call (text-style-detection.ts) to guess font color/weight/
   alignment/line-count from the same trimmed reference image — Madhu asked
   whether text-layer auto-position could also guess styling, not just
   position, so the branding team isn't re-typing values visible in their
   own Canva mockup. Deliberately does NOT attempt font family (no reliable
   way to match a flat raster image to one of this event's actual brand
   fonts) or a precise font size (font_size is only ever a ceiling anyway —
   see composite.ts's TextLayer.font_size comment — the caller derives a
   reasonable one from the already-known box height and the returned
   line_count instead of asking Gemini to measure pixels directly).

   Also uploads the reference file itself and returns its URL (2026-07-31,
   was previously analyzed and discarded) — real bug found live: Madhu
   uploaded a real cleaned headshot exactly this way and it never showed up
   anywhere, because nothing about the file persisted past this one
   request. The caller saves the returned reference_url onto the layer
   (PhotoSlotLayer.reference_url) so it can stand in for the real photo/logo
   when previewing with no real stakeholder selected.

   Uploads the TRIMMED buffer, not the raw upload — a real bug found live
   right after the above fix shipped: the raw upload is the FULL reference
   canvas (e.g. 1080×1350, matching the whole variant), with the actual
   photo/logo occupying only a small sub-region and the rest transparent.
   Using that full canvas as an asset elsewhere (resized into a tiny logo
   box, or fed through alignAndCropPhoto() which expects something shaped
   like an actual photo) either shrinks the real content to invisibility or
   feeds Gemini's face detection a huge mostly-empty image to search — non-
   deterministically, producing a visibly different (and increasingly
   distorted) crop on every single regenerate. `deriveAlignmentTarget`
   already computes this exact trim internally (that's what `box` IS) but
   discards the trimmed pixels; trimming again here is a second cheap,
   deterministic sharp() operation, not a second guess.

   Also caches a head-box detection against the trimmed buffer
   (`reference_head_box`) so a photo reference behaves exactly like a real
   speaker's cached `photo_head_box` — detected once here, never re-detected
   live on every future preview.

   `reference_head_box` is built directly from `target`'s own
   target_head_center_x/y/height — NOT a second, independent `detectHeadBox`
   call (2026-08-01, real bug found live, and it took three rounds of
   Madhu's testing to isolate cleanly): a second Gemini call against the
   same image doesn't reliably agree with the first pixel-for-pixel, and
   `alignAndCropPhoto()`'s scale/position math amplifies even a small
   disagreement between "where alignment says the head should end up" and
   "where the cached head-box says the head currently is" into a visibly
   wrong crop (here: a consistently, deterministically cut-off head — not
   the non-determinism the caching itself already fixed, a DIFFERENT bug
   layered on top of it). Since a reference layer's box already exactly
   matches its own trimmed pixel dimensions (confirmed empirically), using
   the SAME detection for both is mathematically a no-op — the resulting
   crop is just the reference image untouched, exactly matching what the
   ghost overlay's plain CSS already shows for it. */
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  const detectFace = form.get('detect_face') === 'true'
  // Independent of detectFace (2026-08-16 — see deriveAlignmentTarget's own
  // doc comment for the full reasoning) — defaults to the historical
  // trim-unless-detecting-a-face behavior when a caller doesn't send it
  // explicitly, so older callers (none currently) wouldn't silently break.
  const trimToContentRaw = form.get('trim_to_content')
  const trimToContent = trimToContentRaw === null ? !detectFace : trimToContentRaw === 'true'
  // Text-layer-only (2026-08-02) — see text-style-detection.ts for what's
  // actually feasible to guess from a flat reference image (color/weight/
  // align/line-count) versus what stays manual (font family, precise size).
  const detectTextStyleFlag = form.get('detect_text_style') === 'true'
  if (!file || !eventId) return NextResponse.json({ error: 'file, event_id required' }, { status: 400 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    // Stored reference asset mirrors the SAME trim decision as the box
    // itself — an untrimmed box paired with a trimmed reference_url would
    // leave the ghost preview pointing at a smaller image than the box
    // it's meant to fill, stretching it to cover the gap.
    const referenceBuffer = trimToContent ? await sharp(buffer).trim().toBuffer() : buffer
    const [target, reference_url, text_style] = await Promise.all([
      deriveAlignmentTarget(buffer, { detectFace, trimToContent }),
      uploadPublicAsset(`events/${eventId}/templates/reference-${Date.now()}.png`, referenceBuffer, 'image/png'),
      detectTextStyleFlag ? detectTextStyle(referenceBuffer) : Promise.resolve(null),
    ])
    // Only meaningful when a real detection ran — the fallback/default
    // values deriveAlignmentTarget() returns with detectFace:false aren't a
    // real head position, so don't hand them back as if they were one.
    const reference_head_box = detectFace ? {
      centerXRatio: target.target_head_center_x,
      centerYRatio: target.target_head_center_y,
      heightRatio: target.target_head_height,
    } : null
    return NextResponse.json({ ...target, reference_url, reference_head_box, text_style })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not analyze the reference layer'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
