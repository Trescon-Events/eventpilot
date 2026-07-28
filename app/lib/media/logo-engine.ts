// Company Logo Engine (SAE Phase C v4, extended 2026-07-28 with the "clean
// logo base" standard) — lives outside the Announcement Engine deliberately:
// a processed logo is a reusable asset (Website Builder, future consumers),
// not something specific to one creative.
//
// processLogo() takes a raw upload in ANY format and returns a logo that's
// fully ready to use as-is: background removed (except a logo's own
// deliberate colored plate/badge — see isNearNeutral() below), then placed
// onto a standardized 600x300px SOLID WHITE canvas per Madhu's exact spec
// (2026-07-28) — centered, maximally enlarged within a safe area, with
// either 40px padding on all sides or an 80px-sides "special case" for
// moderately-wide logos (see determineSafeArea()). This used to stop at
// "background removed, transparent PNG" and defer safe-area fitting to
// consumers (composite.ts) — that's no longer the case; standardization is
// baked in here. composite.ts's own fit-inside-and-center resize still
// separately applies at creative-generation time (fitting the now-fixed
// 600x300 clean base into whatever arbitrary layer box a template defines)
// — that's a second resize for a different purpose, not replaced by this.
import sharp from 'sharp'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { convertEpsToPng } from '@/app/lib/media/cloudconvert-client'

export type LogoSourceFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf' | 'ai' | 'psd' | 'eps' | 'unknown'

export function detectLogoFormat(filename: string, mimeType: string): LogoSourceFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  // .ai and .eps both commonly arrive as MIME application/postscript (or
  // application/octet-stream) — extension is the only reliable
  // disambiguator between them. .ai is PDF-compatible under the hood
  // (routed through the same rasterizer as real PDFs); .eps is arbitrary
  // PostScript with no fixed structure, routed through CloudConvert instead
  // (see convertEpsToPng in cloudconvert-client.ts) — check .ai first since
  // it's the more specific/common case.
  if (ext === 'ai') return 'ai'
  if (ext === 'eps') return 'eps'
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (ext === 'psd' || ext === 'psb') return 'psd'
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
  if (format === 'psd') {
    // Deferred — see app/lib/media/logo-engine.psd.ts (added once a real
    // spike against Madhu's own PSD files confirms ag-psd's embedded-
    // composite path is reliable for his actual files; not stubbed here to
    // avoid a silent no-op path).
    throw new Error('PSD logo upload is not yet supported — coming soon.')
  }
  if (format === 'eps') {
    const converted = await convertEpsToPng(buffer)
    if (!converted) throw new Error('EPS conversion failed — CloudConvert did not return a usable PNG (check CLOUDCONVERT_API_KEY, or try re-exporting as PDF/AI/PNG/SVG instead).')
    return converted
  }
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

// Guards against the real failure mode a border-touching flood-fill can't
// tell apart on its own: a raw upload cropped tight to a logo's own
// deliberate colored plate (Lego's red background, Nivea's blue circle,
// Goldman Sachs' blue square — real examples Madhu gave, 2026-07-28) with
// no neutral margin around it. In that case the sampled "border color" IS
// the brand color, and an unguarded flood-fill would strip the whole plate
// — confirmed via a real test: an unguarded run on a tightly-cropped Lego
// mark destroyed 54% of the logo (stripped the entire red background,
// leaving only the white wordmark floating on transparent). A genuine
// incidental export background is always white/black/near-neutral — never
// a deliberate saturated brand color — so only proceed with removal when
// the sampled color is convincingly neutral.
//
// Uses raw channel spread (max-min), NOT the textbook HSL saturation
// formula ((max-min)/(255-|max+min-255|)) — that formula's denominator
// shrinks toward 0 as max+min approaches 255, which is exactly the
// near-white/near-black regime this function needs to classify correctly,
// so it spuriously inflates "saturation" for even faintly-tinted near-white
// pixels (confirmed via a real test: a pale (246,254,255) off-white corner
// scored saturation=1.0, the theoretical maximum, under the HSL formula).
function isNearNeutral(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const spread = max - min
  const lightness = (max + min) / 2
  return (lightness > 230 || lightness < 25) && spread < 40
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

  if (!isNearNeutral(bgR, bgG, bgB)) return pngBuffer // sampled color is a deliberate brand plate, not incidental background — leave untouched

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

// ── Clean logo base — Madhu's exact spec (2026-07-28) ───────────────────
// Every processed logo gets placed onto a standardized 600x300px solid
// white canvas: centered, scaled up to the maximum size that fits within a
// safe area without touching it on more than one axis pair. Padding is
// 40px on all sides normally; a "special case" of 80px left/right (top/
// bottom stays 40px) applies to logos that would otherwise touch the
// left/right edges AND whose height is more than 30% of their width — this
// stops moderately-wide logos from visually dominating next to squarer
// ones, without affecting logos that are naturally height-constrained
// (a tall or square mark never triggers this, no matter how far above 30%
// its own ratio is — confirmed empirically against all 6 of Madhu's real
// reference samples: Ministry/NH-square/Facebook/IGNYTE all measured well
// over 30% yet all use normal 40px padding, because all four are
// height-constrained; only the one genuinely width-constrained sample
// (WIO, ratio≈0.40) triggers the special case).
const BASE_WIDTH = 600
const BASE_HEIGHT = 300
const NORMAL_SAFE_AREA = { width: 520, height: 220, x: 40, y: 40 }
const SPECIAL_SAFE_AREA = { width: 440, height: 220, x: 80, y: 40 }
const SPECIAL_CASE_RATIO_THRESHOLD = 0.30

function determineSafeArea(trimmedWidth: number, trimmedHeight: number) {
  const ratio = trimmedHeight / trimmedWidth
  const isWidthConstrained = (NORMAL_SAFE_AREA.width / trimmedWidth) <= (NORMAL_SAFE_AREA.height / trimmedHeight)
  return (isWidthConstrained && ratio > SPECIAL_CASE_RATIO_THRESHOLD) ? SPECIAL_SAFE_AREA : NORMAL_SAFE_AREA
}

export async function buildCleanLogoBase(transparentPngBuffer: Buffer): Promise<Buffer> {
  // Trim to the logo's tight content bounding box — alpha-keyed (background-
  // removed pixels keep their original RGB under alpha=0, so relying on
  // Sharp's default top-left-pixel-color trim would be noisy/unreliable).
  const { data: trimmed, info: trimInfo } = await sharp(transparentPngBuffer)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer({ resolveWithObject: true })

  const safeArea = determineSafeArea(trimInfo.width, trimInfo.height)

  // `trimmed` is already an encoded PNG buffer (sharp's default toBuffer()
  // output format matches the input's, PNG here) — NOT raw pixel bytes, so
  // it's re-wrapped directly, without a { raw: {...} } reinterpretation.
  const resized = await sharp(trimmed)
    .resize(safeArea.width, safeArea.height, { fit: 'inside', withoutEnlargement: false })
    .toBuffer()
  const resizedMeta = await sharp(resized).metadata()
  const placedWidth = resizedMeta.width ?? safeArea.width
  const placedHeight = resizedMeta.height ?? safeArea.height

  const left = safeArea.x + Math.floor((safeArea.width - placedWidth) / 2)
  const top = safeArea.y + Math.floor((safeArea.height - placedHeight) / 2)

  // Compositing an alpha-carrying PNG onto this base promotes the output to
  // RGBA regardless of the base's declared channels:3 — flatten() blends
  // any translucent edge pixels onto solid white (correctness), but only
  // removeAlpha() actually drops the channel afterward (confirmed via a
  // real test: flatten() alone still reports hasAlpha:true/4 channels).
  return sharp({ create: { width: BASE_WIDTH, height: BASE_HEIGHT, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: resized, left, top }])
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .png()
    .toBuffer()
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
  let transparentBuffer = pngBuffer
  const metadata = await sharp(pngBuffer).metadata()
  const alreadyTransparent = metadata.hasAlpha && (await sharp(pngBuffer).stats()).channels[3]?.min !== 255
  if (!alreadyTransparent) {
    transparentBuffer = await removeLogoBackground(pngBuffer)
  }

  // Standardize onto the clean logo base regardless of which path above was
  // taken — every processed logo gets the same 600x300 solid-white treatment.
  const cleanBase = await buildCleanLogoBase(transparentBuffer)
  return { buffer: cleanBase, format }
}
