import { createCanvas } from '@napi-rs/canvas'
import sharp from 'sharp'

/* Reading and rasterising single-page vector PDFs (branding's Illustrator exports for badge layers) with
   pdfjs-dist + @napi-rs/canvas — no poppler/Chromium on Railway. Used only for validation + the on-screen
   preview PNG; the print file embeds the PDF itself as vector (app/lib/badges/pdf.ts), never this raster.
   pdfjs-dist and @napi-rs/canvas are serverExternalPackages in next.config.ts. NOTE: the CMYK->screen colour
   conversion here is pdfjs's own, slightly different from Acrobat/poppler (a teal panel renders a touch
   greener) — fine for layout/text-fit review, never used for print colour. */

type PdfJs = { getDocument: (o: Record<string, unknown>) => { promise: Promise<PdfDoc> } }
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> }
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: Record<string, unknown>) => { promise: Promise<void> }
}

async function openPdf(buffer: Buffer): Promise<PdfDoc> {
  const modPath = 'pdfjs-dist/legacy/build/pdf.mjs'
  const pdfjs = (await import(/* webpackIgnore: true */ modPath)) as unknown as PdfJs
  return pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false }).promise
}

export type PdfPageInfo = { pages: number; widthMm: number; heightMm: number }

export async function inspectPdf(buffer: Buffer): Promise<PdfPageInfo> {
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('That file is not a PDF.')
  const doc = await openPdf(buffer)
  const vp = (await doc.getPage(1)).getViewport({ scale: 1 })
  return { pages: doc.numPages, widthMm: (vp.width * 25.4) / 72, heightMm: (vp.height * 25.4) / 72 }
}

/** Page 1 as a PNG with a transparent background, `widthPx` wide (height follows the page's aspect). */
export async function renderPdfPagePng(buffer: Buffer, widthPx: number): Promise<Buffer> {
  const doc = await openPdf(buffer)
  const page = await doc.getPage(1)
  const vp = page.getViewport({ scale: widthPx / page.getViewport({ scale: 1 }).width })
  const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height))
  // background: pdfjs paints an opaque white page by default, which would make every layer preview a white sheet that
  // hides the layers beneath it — keep the canvas transparent so only the artwork is drawn.
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport: vp, canvas, background: 'transparent' }).promise
  // Encode from the raw RGBA pixels with sharp: @napi-rs/canvas's own toBuffer('image/png') came out fully opaque
  // here even though the canvas pixels are transparent (verified via getImageData), which turned every layer
  // preview into a white sheet.
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } }).png().toBuffer()
}
