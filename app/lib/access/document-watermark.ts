import path from 'path'
import sharp from 'sharp'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'

/* View-only rendering of Passport / National ID documents for STAFF (2026-09-25).

   Staff never receive the original file. Each request renders ONE page of the
   document to a JPEG with the viewer's name, the time and a view id burned
   into the pixels, tiled across the whole image. A saved copy, a right-click
   "save as" or a screenshot all carry it, and the view id ties an image back
   to the audit row that recorded the view.

   It deters and traces; it cannot stop someone photographing a screen.

   The watermark font is Liberation Sans (bundled in pdfjs-dist, so present on
   any server). If it can't be loaded we REFUSE to render — an unwatermarked
   image must never be served. Vendors are unaffected: they still receive the
   original files in their ZIP (they need them). */

const MAX_PAGES = 8
const MAX_EDGE = 1800

let fontReady: boolean | null = null
function ensureFont(): boolean {
  if (fontReady !== null) return fontReady
  try {
    const file = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Bold.ttf')
    fontReady = !!GlobalFonts.registerFromPath(file, 'WatermarkFont')
  } catch {
    fontReady = false
  }
  return fontReady
}

/** Transparent PNG the size of the page, with the label tiled diagonally. */
function watermarkLayer(width: number, height: number, lines: string[]): Buffer {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const size = Math.max(16, Math.round(Math.min(width, height) / 32))
  ctx.font = `bold ${size}px WatermarkFont`
  ctx.textBaseline = 'top'
  ctx.rotate(-Math.PI / 6)
  const stepX = Math.round(size * 20)
  const stepY = Math.round(size * 6)
  const span = Math.hypot(width, height)
  for (let y = -span; y < span; y += stepY) {
    for (let x = -span; x < span; x += stepX) {
      lines.forEach((line, i) => {
        const ly = y + i * (size * 1.3)
        // White outline + dark fill stays readable on both dark and light documents.
        ctx.globalAlpha = 0.5
        ctx.lineWidth = Math.max(2, size / 8)
        ctx.strokeStyle = 'white'
        ctx.strokeText(line, x, ly)
        ctx.globalAlpha = 0.42
        ctx.fillStyle = 'black'
        ctx.fillText(line, x, ly)
      })
    }
  }
  return canvas.toBuffer('image/png')
}

async function rasterizePdfPage(bytes: Uint8Array, pageIndex: number): Promise<{ png: Buffer; pageCount: number } | null> {
  // standardFontDataUrl: PDFs that reference the standard fonts without embedding
  // them (common for generated PDFs) would otherwise render with missing text.
  const standardFontDataUrl = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts') + path.sep
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl }).promise
  const pageCount = Math.min(pdf.numPages, MAX_PAGES)
  if (pageIndex >= pageCount) return null
  const page = await pdf.getPage(pageIndex + 1)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(2, MAX_EDGE / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise
  return { png: canvas.toBuffer('image/png'), pageCount }
}

export type RenderedPage = { jpeg: Buffer; pageCount: number }

/** Returns the watermarked page, null if that page doesn't exist, or throws if it can't be rendered safely. */
export async function renderWatermarkedPage(bytes: Uint8Array, mimeType: string, pageIndex: number, lines: string[]): Promise<RenderedPage | null> {
  if (!ensureFont()) throw new Error('Watermark font unavailable')

  let basePng: Buffer
  let pageCount = 1
  if (mimeType === 'application/pdf') {
    const r = await rasterizePdfPage(bytes, pageIndex)
    if (!r) return null
    basePng = r.png; pageCount = r.pageCount
  } else if (mimeType.startsWith('image/')) {
    if (pageIndex !== 0) return null
    basePng = await sharp(Buffer.from(bytes)).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  } else {
    throw new Error('Unsupported document type')
  }

  const { width, height } = await sharp(basePng).metadata()
  if (!width || !height) throw new Error('Could not read image size')
  const jpeg = await sharp(basePng)
    .flatten({ background: 'white' })
    .composite([{ input: watermarkLayer(width, height, lines) }])
    .jpeg({ quality: 82 })
    .toBuffer()
  return { jpeg, pageCount }
}
