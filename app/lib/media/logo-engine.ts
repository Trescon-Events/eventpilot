// Company Logo Engine (SAE Phase C v4) — lives outside the Announcement
// Engine deliberately: a processed, transparent logo is a reusable asset
// (Website Builder, future consumers), not something specific to one
// creative. Safe-area fitting happens at USE time via the existing
// photo_slot fit-inside-and-center logic in app/lib/announcements/composite.ts,
// not baked in here — this engine only gets a logo to "background removed,
// correctly oriented, transparent PNG."
import sharp from 'sharp'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'

export type LogoSourceFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf' | 'ai' | 'unknown'

export function detectLogoFormat(filename: string, mimeType: string): LogoSourceFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'ai') return 'ai' // Illustrator files are PDF-compatible under the hood — rasterized via the same PDF path
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (ext === 'svg' || mimeType === 'image/svg+xml') return 'svg'
  if (ext === 'png' || mimeType === 'image/png') return 'png'
  if (ext === 'jpg' || ext === 'jpeg' || mimeType === 'image/jpeg') return 'jpeg'
  if (ext === 'webp' || mimeType === 'image/webp') return 'webp'
  return 'unknown'
}

// PDF/AI rasterization — confirmed via a real test PDF that pdfjs-dist +
// @napi-rs/canvas rasterize correctly. Both are free, already-installed
// npm packages (no system binaries needed on Railway, no new subscription —
// this superseded an earlier plan to use a paid conversion API once this
// tested out reliable).
async function rasterizePdfToPng(buffer: Buffer): Promise<Buffer> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(1)

  const scale = 3 // upscale for print-quality output from what's often a small source PDF
  const viewport = page.getViewport({ scale })
  const canvas = createCanvas(viewport.width, viewport.height)
  const ctx = canvas.getContext('2d')

  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise
  return canvas.toBuffer('image/png')
}

async function toRasterPng(buffer: Buffer, format: LogoSourceFormat): Promise<Buffer> {
  if (format === 'pdf' || format === 'ai') return rasterizePdfToPng(buffer)
  if (format === 'svg') return sharp(buffer).png().toBuffer()
  return sharp(buffer).png().toBuffer() // png/jpeg/webp — sharp reads all natively
}

// Border-touching flood-fill background removal: only removes pixels
// connected to the image border and matching the border's own color
// within a tolerance — a logo's own internal colored badge/shield/shape
// (fully enclosed, not touching the edge) survives untouched. Deterministic,
// no new vendor, safer for logos than a generic subject-segmentation API
// (which is tuned for photos, not vector marks).
const COLOR_TOLERANCE = 24

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

export async function removeLogoBackground(pngBuffer: Buffer): Promise<Buffer> {
  const image = sharp(pngBuffer).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  if (channels < 4) return pngBuffer // shouldn't happen after ensureAlpha(), but stay safe

  const idx = (x: number, y: number) => (y * width + x) * channels

  // Sample the border's dominant color from its four corners (more robust
  // than a single pixel if the source has slight compression noise/gradient).
  const corners = [
    idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1),
  ]
  const bgR = Math.round(corners.reduce((s, i) => s + data[i], 0) / corners.length)
  const bgG = Math.round(corners.reduce((s, i) => s + data[i + 1], 0) / corners.length)
  const bgB = Math.round(corners.reduce((s, i) => s + data[i + 2], 0) / corners.length)

  const visited = new Uint8Array(width * height)
  const queue: number[] = []
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const p = y * width + x
    if (visited[p]) return
    visited[p] = 1
    queue.push(p)
  }

  for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1) }
  for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y) }

  let head = 0
  while (head < queue.length) {
    const p = queue[head++]
    const x = p % width
    const y = Math.floor(p / width)
    const i = p * channels
    if (colorDistance(data[i], data[i + 1], data[i + 2], bgR, bgG, bgB) > COLOR_TOLERANCE) continue
    data[i + 3] = 0 // transparent
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1)
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer()
}

export type ProcessedLogo = { buffer: Buffer; format: LogoSourceFormat }

export async function processLogo(rawBuffer: Buffer, filename: string, mimeType: string): Promise<ProcessedLogo> {
  const format = detectLogoFormat(filename, mimeType)
  if (format === 'unknown') throw new Error(`Unsupported logo file type: ${filename}`)

  const pngBuffer = await toRasterPng(rawBuffer, format)

  // Already-transparent sources (most SVGs, already-processed PNGs) don't
  // need background removal — skip it if the image already has meaningful
  // alpha variance, so we don't risk eating into a legitimately transparent
  // logo's own soft edges.
  const metadata = await sharp(pngBuffer).metadata()
  if (metadata.hasAlpha) {
    const stats = await sharp(pngBuffer).stats()
    const alphaChannel = stats.channels[3]
    if (alphaChannel && alphaChannel.min < 255) {
      return { buffer: pngBuffer, format }
    }
  }

  const transparentBuffer = await removeLogoBackground(pngBuffer)
  return { buffer: transparentBuffer, format }
}
