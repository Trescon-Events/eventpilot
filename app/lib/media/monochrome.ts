import sharp from 'sharp'

/* Black-and-white speaker photo for templates that ask for it (PhotoSlotLayer.monochrome, 2026-10-01 —
   DFS wants monochrome speaker photos on its announcement creatives). Desaturates the (already aligned/
   cropped) cut-out and lifts contrast slightly so the blacks stay deep like the approved samples.
   sharp's greyscale() leaves the alpha channel alone, so a transparent cut-out keeps its edges. The two
   numbers below are the whole "look" — tune them here if DFS wants it punchier or softer. */
export const MONOCHROME_CONTRAST = 1.1
export const MONOCHROME_OFFSET = -8

export async function toMonochrome(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).greyscale().linear(MONOCHROME_CONTRAST, MONOCHROME_OFFSET).png().toBuffer()
}
