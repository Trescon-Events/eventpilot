// Composite a cropped speaker photo onto a background image (2026-08-19,
// replaces deterministic-lighting.ts's rim-light/key-light glow — Madhu's
// call: that was "just one design idea," not the real requirement. The
// real requirement is a branding-team-driven prompt fed into a real AI
// photo-editing tool (see photoroom-relight.ts), with only crop/position/
// canvas-size/background-composite staying deterministic. This file is
// that deterministic step, and nothing else — a plain, always-identical
// placement, no lighting effect of its own.
import sharp from 'sharp'

export async function compositeOnBackground(
  subjectBuffer: Buffer,
  backgroundBuffer: Buffer,
  opts: { canvasWidth: number; canvasHeight: number }
): Promise<Buffer> {
  const bgResized = await sharp(backgroundBuffer).resize(opts.canvasWidth, opts.canvasHeight, { fit: 'cover' }).toBuffer()
  return sharp(bgResized).composite([{ input: subjectBuffer, blend: 'over' }]).png().toBuffer()
}
