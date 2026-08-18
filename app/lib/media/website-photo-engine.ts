// Website Photo Engine (2026-08-18, redesigned twice same day per Madhu) —
// the PhotoRoom lighting+background step in the speaker-website-photo
// pipeline. speaker-photo-engine.ts's segment call (background removal
// only) produced the stored, reusable `photo_processed_url` cutout every
// other consumer (SAE creatives included) relies on; this is deliberately a
// SEPARATE, on-demand call so a per-event artistic relight never mutates
// that shared asset.
//
// Originally this also asked PhotoRoom to crop/reframe the photo — dropped
// same-day: the app already has a proven, human-verified head-position
// system (event_speakers.photo_head_box, set via "Fix Head Position",
// same alignAndCropPhoto mechanism the Promo/Self Promo variants already
// trust). OUR code crops first (this file's caller runs alignAndCropPhoto
// — see face-alignment.ts — using the speaker's known head_box, or the
// variant layer's own reference_head_box when previewing against
// placeholder/reference data); this function's job is relighting an
// already-correctly-framed image.
//
// Also originally tried to keep the result transparent (removeBackground:
// false, keepExistingAlphaChannel: auto) and composite our own background
// locally afterward. Dropped a few hours later, same day — real, confirmed
// finding: for a backlight/rim-glow style prompt (what Madhu actually
// wants — see the "website-pic" preset), PhotoRoom does NOT keep the
// background transparent no matter how forcefully the prompt insists on
// it, even rephrased as an explicit standalone instruction. Verified by
// inspecting the actual alpha channel of two separate attempts, not just
// visually — both came back fully opaque (alpha=255) at every corner. This
// makes physical sense: a glow BEHIND the subject is background-area
// content by definition, so "glowing background" and "transparent
// background" are contradictory asks for the same region.
//
// The fix: send the variant's real background image straight to PhotoRoom
// as background.imageFile, in the SAME call as editWithAI. Confirmed
// empirically this combination works (despite PhotoRoom's own docs being
// ambiguous about editWithAI + background.* combining) and produces a
// materially better result than local compositing ever could — PhotoRoom
// blends the rim-light glow INTO the real background pixels, which a
// hard-edged local composite (paste a cutout on top of a flat image) can't
// replicate. This also means compositeAnnouncement() is no longer part of
// this pipeline at all for category: 'website_photo' — PhotoRoom's output
// IS the final image once cropped. See the generate route and preview
// route for where that composite step got removed.
//
// editWithAI does NOT preserve exact input pixel dimensions on its own —
// confirmed empirically: a 1000x1000 input came back 1024x1024 with
// framing/content otherwise faithfully preserved. `outputSize` pins it
// back to the variant's real canvas size.
export class WebsitePhotoEditError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

export async function applyWebsitePhotoLighting(
  croppedBuffer: Buffer,
  opts: { prompt: string; outputWidth: number; outputHeight: number; backgroundBuffer?: Buffer | null }
): Promise<Buffer> {
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (!photoRoomKey) throw new WebsitePhotoEditError('PHOTOROOM_API_KEY not configured', 500)

  const form = new FormData()
  form.append('imageFile', new Blob([new Uint8Array(croppedBuffer)], { type: 'image/png' }), 'cropped.png')
  if (opts.backgroundBuffer) {
    form.append('background.imageFile', new Blob([new Uint8Array(opts.backgroundBuffer)], { type: 'image/png' }), 'background.png')
  } else {
    // No background configured on the variant yet — fall back to trying to
    // preserve transparency. Known to be unreliable for glow/backlight-style
    // prompts (see above); this path exists so generation doesn't hard-fail,
    // not because it's expected to look good.
    form.append('removeBackground', 'false')
    form.append('keepExistingAlphaChannel', 'auto')
  }
  form.append('editWithAI.prompt', opts.prompt)
  form.append('editWithAI.mode', 'ai.auto')
  form.append('outputSize', `${opts.outputWidth}x${opts.outputHeight}`)

  const res = await fetch('https://image-api.photoroom.com/v2/edit', {
    method: 'POST',
    headers: { 'x-api-key': photoRoomKey },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new WebsitePhotoEditError(`PhotoRoom edit failed (${res.status}): ${detail.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
