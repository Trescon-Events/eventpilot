// Speaker Photo Engine (SAE Phase C v4) — lives outside the Announcement
// Engine deliberately: a processed speaker photo is a reusable asset
// (Website Builder, future consumers), not something specific to one
// creative. Generalizes the PhotoRoom call that used to live inline in the
// upload-asset route, and adds the "enhance" step (brightness/contrast
// normalize + sharpen — confirmed sufficient for v1, no new dependency).
import sharp from 'sharp'

// Cap on the STORED processed photo's longest side (2026-08-04, perf pass,
// per Madhu: "a standard HD-like version... should be more than enough").
// Real speaker photos seen in production have been as large as 2015x3583 —
// full original resolution was being stored and then re-decoded/re-resized
// on every single future generate/regenerate, even though no template box
// this photo ever gets composited into exceeds ~1160px. 1920px leaves ample
// headroom above that with no visible quality loss, while meaningfully
// cutting decode time on every future use of this asset. Exported so
// from-submission/route.ts and the Cleaning Cycle routes (the other places
// that finalize a stored photo_processed_url) apply the identical cap.
export const MAX_STORED_PHOTO_DIMENSION = 1920

export async function processSpeakerPhoto(rawBuffer: Buffer, filename: string, mimeType: string): Promise<Buffer | null> {
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (!photoRoomKey) return null // no-ops gracefully if unset, matches existing precedent — doesn't error

  try {
    const form = new FormData()
    form.append('image_file', new Blob([new Uint8Array(rawBuffer)], { type: mimeType }), filename || 'photo.jpg')
    form.append('output_type', 'rgba')

    const res = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: { 'x-api-key': photoRoomKey },
      body: form,
    })
    if (!res.ok) {
      console.error('PhotoRoom request failed:', res.status, await res.text().catch(() => ''))
      return null
    }

    const transparentBuffer = Buffer.from(await res.arrayBuffer())
    return await sharp(transparentBuffer)
      // .rotate() with no args = auto-orient from EXIF, then strip the tag
      // — PhotoRoom's own output has consistently come out already
      // orientation-normalized in testing, but this costs nothing when
      // there's no rotation tag to apply, and removes any dependency on
      // that continuing to hold for every input this ever receives.
      .rotate()
      .resize(MAX_STORED_PHOTO_DIMENSION, MAX_STORED_PHOTO_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .normalize()  // stretches contrast to use the full tonal range
      .sharpen()    // mild sharpen — corrects for slight softness in compressed uploads
      .png()
      .toBuffer()
  } catch (e) {
    console.error('Speaker photo processing errored:', e)
    return null
  }
}
