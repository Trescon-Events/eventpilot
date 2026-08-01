import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { deriveAlignmentTarget, detectHeadBox } from '@/app/lib/media/face-alignment'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/templates/derive-alignment
   multipart/form-data: file (a transparent PNG reference layer, showing a
   dummy speaker photo already correctly positioned — same shape as a real
   photo_slot layer's asset), event_id

   Run once, when the branding team uploads a reference layer for a
   photo_slot layer in the Creative Templates editor — combines alpha-trim
   box detection with Gemini face detection to derive both the layer's
   box (x/y/width/height) and the target head position/size within it. See
   app/lib/media/face-alignment.ts.

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
   live on every future preview. A second, independent Gemini call from the
   one deriveAlignmentTarget() already ran internally (to keep this route's
   contract simple) — an acceptable one-time cost on upload, unlike a
   redundant call on every render. */
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  if (!file || !eventId) return NextResponse.json({ error: 'file, event_id required' }, { status: 400 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const trimmedBuffer = await sharp(buffer).trim().toBuffer()
    const [target, reference_url, reference_head_box] = await Promise.all([
      deriveAlignmentTarget(buffer),
      uploadPublicAsset(`events/${eventId}/templates/reference-${Date.now()}.png`, trimmedBuffer, 'image/png'),
      detectHeadBox(trimmedBuffer).catch(() => null),
    ])
    return NextResponse.json({ ...target, reference_url, reference_head_box })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not analyze the reference layer'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
