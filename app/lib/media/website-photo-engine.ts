// Website Photo Engine (2026-08-18, redesigned same day per Madhu) — the
// PhotoRoom lighting step in the speaker-website-photo pipeline.
// speaker-photo-engine.ts's segment call (background removal only)
// produced the stored, reusable `photo_processed_url` cutout every other
// consumer (SAE creatives included) relies on; this is deliberately a
// SEPARATE, on-demand call so a per-event artistic relight never mutates
// that shared asset.
//
// Originally this also asked PhotoRoom to crop/reframe the photo
// (segmentation.prompt + referenceBox + padding, alongside editWithAI) —
// dropped same-day per Madhu: the app already has a proven, human-
// verified head-position system (event_speakers.photo_head_box, set via
// "Fix Head Position" on the speaker's own page, the exact same mechanism
// the Promo/Self Promo variants already trust via alignAndCropPhoto). Two
// AI guesses at framing (PhotoRoom's segmentation AND our own detection)
// was redundant and risked disagreeing with a head position a producer had
// already manually corrected. Now: OUR code crops first (this file's
// caller runs alignAndCropPhoto — see face-alignment.ts — using the
// speaker's known head_box, or the variant layer's own reference_head_box
// when previewing against placeholder/reference data), and this function's
// only job is relighting an already-correctly-framed image.
//
// editWithAI (a free-text prompt — NOT lighting.mode, which only accepts 3
// fixed presets and can't express an arbitrary "cool blue rim light"
// style) does NOT preserve exact input pixel dimensions on its own —
// confirmed empirically (2026-08-18): a 1000x1000 input came back
// 1024x1024 with framing/content otherwise faithfully preserved. `outputSize`
// pins it back to the variant's real canvas size; this is a plain output
// constraint now, not a crop/reframe instruction (that's why
// segmentation.prompt/referenceBox/padding are gone — they'd be fighting
// our own already-decided crop instead of just resizing it back).
export class WebsitePhotoEditError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

export async function applyWebsitePhotoLighting(
  croppedBuffer: Buffer,
  opts: { prompt: string; outputWidth: number; outputHeight: number }
): Promise<Buffer> {
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (!photoRoomKey) throw new WebsitePhotoEditError('PHOTOROOM_API_KEY not configured', 500)

  const form = new FormData()
  form.append('imageFile', new Blob([new Uint8Array(croppedBuffer)], { type: 'image/png' }), 'cropped.png')
  form.append('removeBackground', 'false') // already a transparent cutout — don't re-segment
  form.append('keepExistingAlphaChannel', 'auto')
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
