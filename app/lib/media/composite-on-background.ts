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
  opts: { canvasWidth: number; canvasHeight: number }
): Promise<Buffer> {
  const bgResized = await sharp(backgroundBuffer).resize(opts.canvasWidth, opts.canvasHeight, { fit: 'cover' }).toBuffer()
  return sharp(bgResized).composite([{ input: subjectBuffer, blend: 'over' }]).png().toBuffer()
}
