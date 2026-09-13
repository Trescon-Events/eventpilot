// Composite a cropped speaker photo onto a background image (2026-08-19) —
// the entire Website Photo pipeline: crop + position (alignAndCropPhoto)
// + this. An AI lighting/style step was tried (PhotoRoom, then Stability
// AI) and abandoned after real testing showed neither could be trusted to
// leave the subject's scale/position untouched, so this is deliberately
// just a plain, always-identical placement — see composite.ts's
// Variant.category doc comment for the full record.
import sharp from 'sharp'

export async function compositeOnBackground(
  subjectBuffer: Buffer,
  backgroundBuffer: Buffer,
  // format defaults to 'png' so the template editor's own on-demand preview
  // (app/api/events/templates/preview/route.ts, which hardcodes a
  // data:image/png;base64 URL — nothing persisted, format doesn't matter
  // there) keeps working unchanged. The real Website Photo generate route
  // (the one that persists to storage and feeds KonfHub) passes 'webp'
  // explicitly (2026-09-12, per Madhu — KonfHub-published photos were
  // pushing full-size PNGs straight through to the public site).
  opts: { canvasWidth: number; canvasHeight: number; format?: 'png' | 'webp'; quality?: number }
): Promise<Buffer> {
  const bgResized = await sharp(backgroundBuffer).resize(opts.canvasWidth, opts.canvasHeight, { fit: 'cover' }).toBuffer()
  const composited = sharp(bgResized).composite([{ input: subjectBuffer, blend: 'over' }])
  // The composite is always fully opaque (subject is placed over an opaque
  // background here, unlike the mid-pipeline crop/pad steps in
  // face-alignment.ts that intentionally stay PNG to dodge sharp's
  // JPEG-alpha black-band re-encode bug) — safe to use lossy WebP with no
  // transparency concerns.
  return opts.format === 'webp' ? composited.webp({ quality: opts.quality ?? 85 }).toBuffer() : composited.png().toBuffer()
}
