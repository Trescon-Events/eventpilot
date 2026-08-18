// Website Photo Engine (2026-08-18) — the second PhotoRoom step in the
// speaker-website-photo pipeline. speaker-photo-engine.ts's segment call
// (background removal only) already produced the stored, reusable
// `photo_processed_url` cutout every other consumer (SAE creatives
// included) relies on; this is deliberately a SEPARATE, on-demand call so a
// per-event artistic relight never mutates that shared asset.
//
// Uses PhotoRoom's /v2/edit endpoint with editWithAI (a free-text prompt —
// NOT lighting.mode, which only accepts 3 fixed presets and can't express
// an arbitrary "cool blue rim light" style) to both relight the subject AND
// reframe/crop it to the variant's canvas size in ONE call — confirmed
// empirically (2026-08-18, real request against a real speaker cutout) that
// editWithAI + outputSize/padding combine in a single call, and that
// transparency survives (checked the actual alpha channel, not just the
// visual — PhotoRoom's response looked black-background but corner alpha
// was 0). The background itself is applied afterward by our own
// compositeAnnouncement() (composite.ts), not by PhotoRoom — we already
// have the exact static background asset as a real image layer, so paying
// for PhotoRoom's AI background generation would be buying something we
// don't need. Per PhotoRoom's own docs, 1 Editing-API call ≈ 5 Remove-
// Background-API credits — worth knowing before regenerate becomes a habit.
export class WebsitePhotoEditError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

export async function applyWebsitePhotoLighting(
  cutoutBuffer: Buffer,
  opts: { prompt: string; outputWidth: number; outputHeight: number; padding: number }
): Promise<Buffer> {
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (!photoRoomKey) throw new WebsitePhotoEditError('PHOTOROOM_API_KEY not configured', 500)

  const form = new FormData()
  form.append('imageFile', new Blob([new Uint8Array(cutoutBuffer)], { type: 'image/png' }), 'cutout.png')
  form.append('removeBackground', 'false') // already a transparent cutout — don't re-segment
  form.append('keepExistingAlphaChannel', 'auto')
  form.append('editWithAI.prompt', opts.prompt)
  form.append('editWithAI.mode', 'ai.auto')
  form.append('outputSize', `${opts.outputWidth}x${opts.outputHeight}`)
  form.append('padding', String(opts.padding))

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
