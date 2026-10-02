// Speaker-badge print PDF: instruction page first, then one page per badge, then the common back once at the end.
// Page = trim + bleed (TrimBox inset by the bleed, BleedBox = MediaBox) — the format the badge vendor expects.
//   - layer art uploaded as PDF is embedded as TRUE VECTOR (once per file, re-drawn on every badge page)
//   - raster art + the speaker photo go in as DeviceCMYK with a soft mask for transparency
//   - all text is outlined to vector paths (no fonts in the file), laid out by planTextLayer() — the same wrap /
//     shrink / align / position the on-screen preview uses
// Recipe proven in .scratch/badge-spike*.ts; this version is driven by the template's own layers.
import { deflateSync } from 'zlib'
import sharp from 'sharp'
import * as fontkit from 'fontkit'
import { PDFDocument, PDFRawStream, PDFRef, cmyk, pushGraphicsState, popGraphicsState, setLineWidth, setStrokingColor, setDashPattern, moveTo, lineTo, stroke, concatTransformationMatrix, drawObject, type PDFPage, type PDFEmbeddedPage } from 'pdf-lib'
import { supabaseAdmin } from '@/app/lib/supabase'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { planTextLayer, resolveTextLayerYPositions, resolveTextValue, type ImageLayer, type PhotoSlotLayer, type ResolvedAssets, type ResolvedTexts, type TextLayer, type Variant } from '@/app/lib/announcements/composite'
import { withTextLayerDefaults } from '@/app/lib/announcements/text-layer-defaults'
import { alignAndCropPhoto } from '@/app/lib/media/face-alignment'
import { toMonochrome } from '@/app/lib/media/monochrome'

const MM = 72 / 25.4
const TARGET_PPI = 600
const PHOTO_JPEG_QUALITY = 92 // speaker photos only; flat artwork stays lossless (vector or Flate)
// The slice of fontkit's Font this file uses (the shipped typings are awkward for layout runs).
type Glyph = { path: { commands: unknown[]; scale(x: number, y: number): { toSVG(): string } } }
type Font = { unitsPerEm: number; layout(text: string): { advanceWidth: number; glyphs: Glyph[]; positions: Array<{ xAdvance: number; xOffset: number; yOffset: number }> } }
type Color = ReturnType<typeof cmyk>

export type BadgePrintInput = {
  variant: Variant                       // must carry `print`
  assets: ResolvedAssets
  texts: ResolvedTexts
  eventName: string
  /** One entry per badge page. Sample files pass a single entry using the placeholder assets/texts above. */
  sample: boolean
}

// ── colour ────────────────────────────────────────────────────────────────────────────────────────────────
async function hexToCmyk(hex: string): Promise<Color> {
  const h = hex.replace('#', '').toLowerCase()
  if (h === 'ffffff') return cmyk(0, 0, 0, 0)   // pure white = no ink, as branding specified
  if (h === '000000') return cmyk(0, 0, 0, 1)
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const rgb = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
  const raw = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).toColourspace('cmyk').raw().toBuffer()
  return cmyk(raw[0] / 255, raw[1] / 255, raw[2] / 255, raw[3] / 255)
}

// ── images ────────────────────────────────────────────────────────────────────────────────────────────────
// RGB(A) image -> DeviceCMYK XObject + soft mask from the alpha channel.
async function embedCmykImage(doc: PDFDocument, png: Buffer, photoQuality?: number): Promise<PDFRef> {
  const base = sharp(png).ensureAlpha()
  const { width, height } = await base.metadata() as { width: number; height: number }
  const alpha = await base.clone().extractChannel(3).raw().toBuffer()
  const ctx = doc.context
  const mask = ctx.register(PDFRawStream.of(ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' }), deflateSync(alpha)))
  if (photoQuality) {
    // Photos: CMYK JPEG (DCT) at high quality — a lossless 600 ppi CMYK photo is ~3.5 MB per badge, which makes a
    // 100-badge file unmanageable. libjpeg writes Adobe-style CMYK (inverted), which PDF reads via /Decode [1 0 …].
    const jpeg = await sharp(png).removeAlpha().toColourspace('cmyk').jpeg({ quality: photoQuality, chromaSubsampling: '4:4:4' }).toBuffer()
    return ctx.register(PDFRawStream.of(ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Filter: 'DCTDecode', Decode: [1, 0, 1, 0, 1, 0, 1, 0], SMask: mask }), jpeg))
  }
  const cmykRaw = await sharp(png).removeAlpha().toColourspace('cmyk').raw().toBuffer({ resolveWithObject: true })
  if (cmykRaw.info.channels !== 4) throw new Error(`CMYK conversion produced ${cmykRaw.info.channels} channels`)
  return ctx.register(PDFRawStream.of(ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Filter: 'FlateDecode', SMask: mask }), deflateSync(cmykRaw.data)))
}

let imageSeq = 0
function drawImageRef(page: PDFPage, ref: PDFRef, xPt: number, yPt: number, wPt: number, hPt: number) {
  const name = page.node.newXObject(`Im${++imageSeq}`, ref) // pdf-lib mints its own resource key — use what it returns
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(wPt, 0, 0, hPt, xPt, yPt), drawObject(name), popGraphicsState())
}

// ── text ──────────────────────────────────────────────────────────────────────────────────────────────────
// fetchAssetBuffer only accepts image/* responses, so fonts and PDFs need their own fetch.
async function fetchBinary(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null
  } catch { return null }
}
const fontCache = new Map<string, Promise<Font | null>>()
function loadFont(url: string): Promise<Font | null> {
  let p = fontCache.get(url)
  if (!p) {
    p = fetchBinary(url).then(buf => (buf ? (fontkit as unknown as { create(b: Buffer): Font }).create(buf) : null)).catch(() => null)
    fontCache.set(url, p)
  }
  return p
}
const advance = (font: Font, text: string, sizePx: number) => font.layout(text).advanceWidth * (sizePx / font.unitsPerEm)

/** Draws one line as vector outlines. Coordinates are in the caller's unit space (`kx`/`ky` convert to points). */
function drawOutlinedLine(page: PDFPage, pageHeightPt: number, font: Font, text: string, xU: number, baselineU: number, sizeU: number, kx: number, ky: number, color: Color, boldStrokeU = 0) {
  const run = font.layout(text); const k = sizeU / font.unitsPerEm
  let pen = xU
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i]
    if (g.path.commands.length) {
      page.drawSvgPath(g.path.scale(1, -1).toSVG(), { // font units are y-up; drawSvgPath expects y-down
        x: (pen + pos.xOffset * k) * kx, y: pageHeightPt - (baselineU - pos.yOffset * k) * ky, scale: k * kx,
        color, ...(boldStrokeU > 0 ? { borderColor: color, borderWidth: boldStrokeU * kx } : { borderWidth: 0 }),
      })
    }
    pen += pos.xAdvance * k
  })
}

// ── fonts for the instruction page (the template's brand font if it has one, else Lufga) ───────────────────
async function instructionFonts(variant: Variant): Promise<{ regular: Font; bold: Font }> {
  const textLayer = variant.layers.find((l): l is TextLayer => l.type === 'text' && !!l.font_family)
  const sources: Array<Record<number, string | undefined>> = []
  if (textLayer?.font_family) sources.push({ ...(textLayer.font_family.regular_url ? { 400: textLayer.font_family.regular_url } : {}), ...(textLayer.font_family.bold_url ? { 700: textLayer.font_family.bold_url } : {}), ...(textLayer.font_family.weights ?? {}) })
  const { data } = await supabaseAdmin.from('brand_fonts').select('family_name, weights, regular_url, bold_url').ilike('family_name', 'lufga').limit(1)
  if (data?.[0]) sources.push({ ...(data[0].regular_url ? { 400: data[0].regular_url as string } : {}), ...(data[0].bold_url ? { 700: data[0].bold_url as string } : {}), ...((data[0].weights as Record<number, string> | null) ?? {}) })
  for (const w of sources) {
    const regular = w[400] ? await loadFont(w[400]) : null
    const bold = (w[700] ? await loadFont(w[700]) : null) ?? regular
    if (regular && bold) return { regular, bold }
  }
  throw new Error('No brand font available to write the instruction page (add a font on the Branding page).')
}

// ── instruction page ──────────────────────────────────────────────────────────────────────────────────────
export type InstructionInfo = { eventName: string; templateName: string; date: string; badges: number; hasBack: boolean; notes?: string }

function drawInstructionPage(doc: PDFDocument, spec: NonNullable<Variant['print']>, fonts: { regular: Font; bold: Font }, info: InstructionInfo) {
  const PWm = spec.width_mm, PHm = spec.height_mm, bleed = spec.bleed_mm
  const trimW = +(PWm - 2 * bleed).toFixed(2), trimH = +(PHm - 2 * bleed).toFixed(2)
  const PW = PWm * MM, PH = PHm * MM
  const page = doc.addPage([PW, PH]); setBoxes(page, spec)
  const K = cmyk(0, 0, 0, 1), GREY = cmyk(0, 0, 0, 0.55), MAGENTA = cmyk(0, 1, 0, 0)
  const text = (f: Font, t: string, xMm: number, topMm: number, pt: number, color = K) => drawOutlinedLine(page, PH, f, t, xMm * MM, topMm * MM, pt, 1, 1, color)
  const width = (f: Font, t: string, pt: number) => advance(f, t, pt) / MM
  const line = (x1: number, y1: number, x2: number, y2: number, color: Color, w = 0.4, dash?: number[]) =>
    page.pushOperators(pushGraphicsState(), setLineWidth(w), setStrokingColor(color), ...(dash ? [setDashPattern(dash, 0)] : []), moveTo(x1 * MM, PH - y1 * MM), lineTo(x2 * MM, PH - y2 * MM), stroke(), popGraphicsState())
  const rect = (x: number, y: number, w: number, h: number, color: Color, lw = 0.4, dash?: number[]) => { line(x, y, x + w, y, color, lw, dash); line(x + w, y, x + w, y + h, color, lw, dash); line(x + w, y + h, x, y + h, color, lw, dash); line(x, y + h, x, y, color, lw, dash) }
  const wrap = (f: Font, t: string, pt: number, maxMm: number): string[] => {
    const out: string[] = []; let cur = ''
    for (const w of t.split(/\s+/)) { const c = cur ? `${cur} ${w}` : w; if (!cur || width(f, c, pt) <= maxMm) cur = c; else { out.push(cur); cur = w } }
    if (cur) out.push(cur); return out
  }

  const top = bleed + 6, L = Math.max(bleed, 3) + 2.5, contentW = PWm - 2 * L
  text(fonts.bold, 'PRINT INSTRUCTIONS', L, top, 9)
  text(fonts.regular, info.eventName, L, top + 4.5, 5.6)
  text(fonts.regular, `${info.templateName} · ${info.date}`, L, top + 8, 5.6)
  rect(L - 1, top + 10.2, contentW + 2, 5.2, K, 0.5)
  text(fonts.bold, 'THIS PAGE IS NOT ARTWORK — DO NOT PRINT', L + 0.6, top + 13.7, 4.9)

  // schematic drawn to scale: artwork (page) edge in magenta, trim dashed
  const sh = Math.min(28, PHm * 0.30), sw = sh * (PWm / PHm), sx = L, sy = top + 19, s = sh / PHm
  rect(sx, sy, sw, sh, MAGENTA, 0.6)
  rect(sx + bleed * s, sy + bleed * s, trimW * s, trimH * s, K, 0.6, [1.6, 1.2])
  const lx = sx + sw + 3
  text(fonts.bold, 'Artwork (page)', lx, sy + 4.2, 5.2, MAGENTA); text(fonts.regular, `${PWm} × ${PHm} mm`, lx, sy + 7.4, 5.4)
  text(fonts.bold, 'Trim (cut line)', lx, sy + 12.4, 5.2); text(fonts.regular, `${trimW} × ${trimH} mm`, lx, sy + 15.6, 5.4)
  text(fonts.bold, 'Bleed', lx, sy + 20.6, 5.2, GREY); text(fonts.regular, `${bleed} mm each side`, lx, sy + 23.8, 5.4)

  let y = sy + sh + 5.5
  const row = (k: string, v: string) => {
    const lines = wrap(fonts.regular, v, 5.1, contentW - 17)
    if (y + (lines.length - 1) * 2.9 > PHm - bleed - 3) return // never run past the trim line on small pages
    text(fonts.bold, k, L, y, 5.1)
    lines.forEach((l, i) => text(fonts.regular, l, L + 17, y + i * 2.9, 5.1))
    y += Math.max(1, lines.length) * 2.9 + 1.1
  }
  const backPage = info.badges + 2
  row('Quantity', `${info.badges} badge${info.badges === 1 ? '' : 's'}${info.hasBack ? ' + 1 common back' : ''}`)
  row('Page order', info.badges === 1 ? `p.2 speaker badge${info.hasBack ? ` · p.${backPage} common back (last)` : ''}` : `p.2–${info.badges + 1} speaker badges${info.hasBack ? ` · p.${backPage} common back (last)` : ''}`)
  row('Bleed', `${bleed} mm is built into every page's artwork`)
  row('Colour', 'CMYK · text outlined · vector art')
  if (info.notes) row('Notes', info.notes)
}

function setBoxes(page: PDFPage, spec: NonNullable<Variant['print']>) {
  const PW = spec.width_mm * MM, PH = spec.height_mm * MM, B = spec.bleed_mm * MM
  page.setMediaBox(0, 0, PW, PH); page.setBleedBox(0, 0, PW, PH)
  page.setTrimBox(B, B, PW - 2 * B, PH - 2 * B); page.setArtBox(B, B, PW - 2 * B, PH - 2 * B)
}

// ── badge page ────────────────────────────────────────────────────────────────────────────────────────────
type VectorCache = Map<string, Promise<PDFEmbeddedPage | null>>
function embedVector(doc: PDFDocument, cache: VectorCache, url: string): Promise<PDFEmbeddedPage | null> {
  let p = cache.get(url)
  if (!p) {
    p = fetchBinary(url).then(async buf => (buf ? (await doc.embedPdf(buf))[0] : null))
    cache.set(url, p)
  }
  return p
}

async function drawBadgePage(doc: PDFDocument, variant: Variant, assets: ResolvedAssets, texts: ResolvedTexts, vectors: VectorCache) {
  const spec = variant.print!
  const PW = spec.width_mm * MM, PH = spec.height_mm * MM
  const cw = variant.canvas_width, ch = variant.canvas_height
  const kx = PW / cw, ky = PH / ch
  const ppi1x = cw / (spec.width_mm / 25.4)
  const PX = Math.min(4, Math.max(1, Math.ceil(TARGET_PPI / ppi1x))) // raster render scale vs the design grid
  const page = doc.addPage([PW, PH]); setBoxes(page, spec)
  const yPositions = await resolveTextLayerYPositions(variant, texts)

  for (const layer of variant.layers) {
    if (layer.type === 'image') {
      const l = layer as ImageLayer
      if (l.reference_only) continue // mockup layers never print
      const x = l.x * kx, w = l.width * kx, h = l.height * ky, y = PH - (l.y + l.height) * ky
      if (l.print_pdf_url) {
        const embedded = await embedVector(doc, vectors, l.print_pdf_url)
        if (!embedded) throw new Error(`Could not load the layer PDF for an image layer (${l.print_pdf_url})`)
        page.drawPage(embedded, { x, y, width: w, height: h })
      } else if (l.asset_url) {
        const buf = await fetchAssetBuffer(l.asset_url)
        if (!buf) throw new Error('Could not load an image layer')
        const png = await sharp(buf).resize(Math.round(l.width * PX), Math.round(l.height * PX), { fit: 'cover' }).png().toBuffer()
        drawImageRef(page, await embedCmykImage(doc, png), x, y, w, h)
      }
    } else if (layer.type === 'photo_slot') {
      const l = layer as PhotoSlotLayer
      const asset = assets[l.source]
      if (!asset) continue
      let buffer = asset.buffer
      if (asset.is_svg) buffer = await sharp(buffer).png().toBuffer()
      let png: Buffer, px = l.x, py = l.y, pw = l.width, ph = l.height
      if (l.alignment && l.source === 'speaker_photo') {
        // the alignment's frozen reference size must scale with the box, or the head lands at the wrong scale
        const al = l.alignment
        const scaledAlignment = { ...al, ...(al.reference_box_width ? { reference_box_width: al.reference_box_width * PX } : {}), ...(al.reference_box_height ? { reference_box_height: al.reference_box_height * PX } : {}) }
        const { buffer: cropped } = await alignAndCropPhoto(buffer, { ...scaledAlignment, box: { x: 0, y: 0, width: Math.round(l.width * PX), height: Math.round(l.height * PX) } }, asset.head_box)
        png = cropped
      } else {
        png = await sharp(buffer).resize(Math.round(l.width * PX), Math.round(l.height * PX), { fit: 'inside' }).png().toBuffer()
        const m = await sharp(png).metadata()
        pw = (m.width ?? l.width * PX) / PX; ph = (m.height ?? l.height * PX) / PX
        px = l.x + (l.width - pw) / 2; py = l.y + (l.height - ph) / 2
      }
      if (l.monochrome && l.source === 'speaker_photo') png = await toMonochrome(png)
      drawImageRef(page, await embedCmykImage(doc, png, PHOTO_JPEG_QUALITY), px * kx, PH - (py + ph) * ky, pw * kx, ph * ky)
    } else {
      const value = resolveTextValue(layer, texts)
      if (!value) continue
      const resolvedY = yPositions.get(layer.id) ?? layer.y
      const positioned = resolvedY === layer.y ? layer : { ...layer, y: resolvedY }
      const normalized = withTextLayerDefaults(positioned, { width: cw, height: ch })
      const plan = await planTextLayer(normalized, value)
      const font = (plan.fontUrl ? await loadFont(plan.fontUrl) : null) ?? (await instructionFonts(variant)).regular
      const color = await hexToCmyk(plan.color)
      plan.lines.forEach((text, i) => {
        const w = advance(font, text, plan.fontSize)
        const x = plan.align === 'center' ? plan.xPos - w / 2 : plan.align === 'right' ? plan.xPos - w : plan.xPos
        drawOutlinedLine(page, PH, font, text, x, plan.firstBaselineY + i * plan.lineHeight, plan.fontSize, kx, ky, color, plan.syntheticBold ? plan.fontSize * 0.04 : 0)
      })
    }
  }
}

// ── public ────────────────────────────────────────────────────────────────────────────────────────────────
export type BadgeBatchPdfInput = {
  variant: Variant                       // the template (must carry `print`): page size, common back, instruction page
  count: number                          // number of badge pages
  /** Called once per badge, in order, one at a time (keeps memory flat). Returns that badge's own variant (photo nudge), photo and text. */
  getItem: (index: number) => Promise<{ variant: Variant; assets: ResolvedAssets; texts: ResolvedTexts }>
  eventName: string
  batchName?: string
  notes?: string
  onProgress?: (done: number, total: number) => void | Promise<void>
}

/** Instruction page, then one page per badge, then the common back once at the end. */
export async function buildBadgeBatchPdf(input: BadgeBatchPdfInput): Promise<Buffer> {
  const { variant } = input
  const spec = variant.print
  if (variant.category !== 'badge' || !spec) throw new Error('This template is not a speaker badge with a print size.')

  const doc = await PDFDocument.create()
  doc.setTitle(`${input.eventName} — ${input.batchName ?? variant.name ?? 'Speaker badges'}`)
  doc.setProducer('EventPilot'); doc.setCreator('EventPilot')
  const fonts = await instructionFonts(variant)
  drawInstructionPage(doc, spec, fonts, {
    eventName: input.eventName,
    templateName: input.batchName ? `${variant.name || 'Speaker badge'} · ${input.batchName}` : variant.name || 'Speaker badge',
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    badges: input.count, hasBack: !!spec.back_pdf_url, notes: input.notes,
  })

  const vectors: VectorCache = new Map()
  for (let i = 0; i < input.count; i++) {
    const item = await input.getItem(i)
    await drawBadgePage(doc, item.variant, item.assets, item.texts, vectors)
    await input.onProgress?.(i + 1, input.count)
  }

  if (spec.back_pdf_url) {
    const back = await embedVector(doc, vectors, spec.back_pdf_url)
    if (!back) throw new Error('Could not load the common back PDF.')
    const page = doc.addPage([spec.width_mm * MM, spec.height_mm * MM]); setBoxes(page, spec)
    page.drawPage(back, { x: 0, y: 0, width: spec.width_mm * MM, height: spec.height_mm * MM })
  }
  return Buffer.from(await doc.save())
}

/** One-badge sample file from the editor's placeholder content (Quick preview > Download print PDF). */
export async function buildBadgePrintPdf(input: BadgePrintInput): Promise<Buffer> {
  const { variant, assets, texts } = input
  return buildBadgeBatchPdf({
    variant, count: 1, eventName: input.eventName,
    notes: input.sample ? 'SAMPLE — placeholder content, not a real order.' : undefined,
    getItem: async () => ({ variant, assets, texts }),
  })
}
