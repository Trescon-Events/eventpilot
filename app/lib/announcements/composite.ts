// Sharp-based server-side creative compositing — PRD v1.4 Phase C v3.
// Canva stays the design tool for individual layer assets (background art,
// foreground overlays with feathered transparency, etc.), exported as PNGs;
// this composites an ordered stack of layers (image / photo-slot / text)
// onto a blank canvas at generation time. Supersedes the Phase C v2
// single-background-plus-fixed-zones shape — real creatives (e.g. the WAIS
// Malaysia "Speaking At" design) have independently-positioned elements with
// genuine z-order between them (a speaker photo sitting *under* a
// translucent foreground layer to get a feathered blend), which a fixed
// background+zones model can't express.
//
// Photo/logo blending into the background is achieved purely through layer
// order + the uploaded PNG's own alpha channel (baked in by whoever exports
// it from Canva) — Sharp's .composite() already respects per-layer alpha,
// so no custom masking logic is needed here.
import sharp, { type OverlayOptions } from 'sharp'
import { GlobalFonts, createCanvas } from '@napi-rs/canvas'
import { alignAndCropPhoto, type PhotoAlignmentMeta, type HeadBox } from '@/app/lib/media/face-alignment'
import { wrapAndFit } from '@/app/lib/announcements/text-layout'
import { withTextLayerDefaults } from '@/app/lib/announcements/text-layer-defaults'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'

export { withTextLayerDefaults, type LegacyTextLayer } from '@/app/lib/announcements/text-layer-defaults'

export type ImageLayer = {
  id: string
  type: 'image'
  asset_url: string
  x: number
  y: number
  width: number
  height: number
}

export type PhotoSlotLayer = {
  id: string
  type: 'photo_slot'
  source: 'speaker_photo' | 'speaker_logo' | 'partner_logo'
  x: number
  y: number
  width: number
  height: number
  alignment?: PhotoAlignmentMeta // face-aligned-cover fit (speaker photos only) when present; contain-centered otherwise — see app/lib/media/face-alignment.ts
}

export type TextLayerFont = {
  family_name: string        // display name, e.g. "Poppins" — used as the SVG font-family
  regular_url: string
  bold_url?: string | null
}

export type TextLayer = {
  id: string
  type: 'text'
  field: 'name' | 'title' | 'company' | 'tier' | 'custom'
  value?: string             // static text for 'custom', or a fallback for 'tier'
  x: number                  // box top-left (SAE Phase C v5, 2026-07-29) — was a single SVG baseline
  y: number                  // point before this; see withTextLayerDefaults() for the migration from that shape
  width: number
  height: number
  max_lines: number          // wrapAndFit() shrinks font size (down to 60% of font_size) then
                              // ellipsis-truncates if the text still can't fit within this many lines
  font_size: number           // ceiling — actual rendered size may auto-shrink smaller to fit
  font_color: string         // hex, e.g. '#FFFFFF'
  font_weight?: 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
  font_family?: TextLayerFont // denormalized at variant-save time from a brand_fonts row — see app/lib/branding/fonts.ts. Falls back to a generic sans-serif when absent.
}

export type TextLayerDiagnostics = { did_shrink: boolean; did_truncate: boolean }

export type Layer = ImageLayer | PhotoSlotLayer | TextLayer

export type Variant = {
  id: string
  name: string
  canvas_width: number
  canvas_height: number
  layers: Layer[]            // array order = z-order, index 0 = bottom
}

export type CreativeTemplateConfig = {
  speaker?: { variants: Variant[] }
  partner?: { variants: Variant[] }
}

export type ResolvedAssets = Partial<Record<PhotoSlotLayer['source'], { buffer: Buffer; is_svg?: boolean; head_box?: HeadBox | null }>>

export async function compositeAnnouncement(
  variant: Variant,
  assets: ResolvedAssets,
  texts: { name?: string; title?: string; company?: string; tier?: string }
): Promise<Buffer> {
  // Each layer's fetch/process work is independent of every other layer's —
  // parallelized via Promise.all (2026-07-31 speed pass) rather than the
  // original sequential for-loop, since a layer stack commonly has 3-4
  // full-canvas background images plus a photo/logo/text, and fetching
  // those one at a time was the dominant cost of a preview render.
  // Promise.all preserves array order regardless of completion order, and
  // sharp().composite() composites in array order = z-order, so mapping
  // straight through (rather than reducing/pushing as each resolves) keeps
  // z-order correct with zero extra bookkeeping. Layers that render nothing
  // (unset image, missing photo asset, empty text) map to null and are
  // filtered out afterward.
  const compositeOpsOrNull = await Promise.all(variant.layers.map(async (layer): Promise<OverlayOptions | null> => {
    if (layer.type === 'image') {
      if (!layer.asset_url) return null // not uploaded yet — editor can preview right after "+ Image Layer" is clicked, before a file is chosen
      const buffer = await fetchAssetBuffer(layer.asset_url)
      if (!buffer) throw new Error(`Failed to fetch layer image (${layer.id})`)
      const resized = await sharp(buffer)
        .resize(layer.width, layer.height, { fit: 'cover' })
        .toBuffer()
      return { input: resized, left: layer.x, top: layer.y }
    }

    if (layer.type === 'photo_slot') {
      const asset = assets[layer.source]
      if (!asset) return null // caller validates required sources before calling; missing optional ones are skipped

      let assetBuffer = asset.buffer
      if (asset.is_svg) assetBuffer = await sharp(assetBuffer).png().toBuffer()

      if (layer.alignment && layer.source === 'speaker_photo') {
        const cropped = await alignAndCropPhoto(assetBuffer, {
          ...layer.alignment,
          box: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
        }, asset.head_box)
        return { input: cropped, left: layer.x, top: layer.y }
      }

      const resized = await sharp(assetBuffer)
        .resize(layer.width, layer.height, { fit: 'inside', withoutEnlargement: false })
        .toBuffer()

      const metadata = await sharp(resized).metadata()
      const assetWidth = metadata.width ?? layer.width
      const assetHeight = metadata.height ?? layer.height
      const left = layer.x + Math.floor((layer.width - assetWidth) / 2)
      const top = layer.y + Math.floor((layer.height - assetHeight) / 2)

      return { input: resized, left, top }
    }

    // text
    const value = resolveTextValue(layer, texts)
    if (!value) return null
    const normalized = withTextLayerDefaults(layer, { width: variant.canvas_width, height: variant.canvas_height })
    const { buffer } = await renderTextLayerPng(normalized, value, variant.canvas_width, variant.canvas_height)
    return { input: buffer, left: 0, top: 0 }
  }))

  const compositeOps = compositeOpsOrNull.filter((op): op is OverlayOptions => op !== null)

  return sharp({
    create: {
      width: variant.canvas_width,
      height: variant.canvas_height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeOps)
    .png()
    .toBuffer()
}

function resolveTextValue(layer: TextLayer, texts: { name?: string; title?: string; company?: string; tier?: string }): string | undefined {
  if (layer.field === 'custom') return layer.value
  if (layer.field === 'name') return texts.name
  if (layer.field === 'title') return texts.title
  if (layer.field === 'company') return texts.company
  return texts.tier ?? layer.value // 'tier' — runtime value wins, falls back to the layer's own hardcoded label
}

// Cached across calls (not just within one render) so the debounced live
// preview in the variant editor — which re-renders on every keystroke —
// doesn't refetch the same font file over the network every ~500ms.
const fontBufferCache = new Map<string, Promise<Buffer | null>>()

async function fetchFontBufferUncached(url: string): Promise<Buffer | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

function fetchFontBuffer(url: string): Promise<Buffer | null> {
  const cached = fontBufferCache.get(url)
  if (cached) return cached
  const promise = fetchFontBufferUncached(url).catch(() => null)
  fontBufferCache.set(url, promise)
  return promise
}

// @napi-rs/canvas's GlobalFonts registry is process-global and additive —
// registering the same family twice is harmless but wasteful (network
// fetch + native registration on every debounced preview keystroke), so
// track what's already been registered this process.
const registeredFontFamilies = new Set<string>()

async function ensureFontRegisteredForMeasurement(font: TextLayerFont): Promise<string> {
  const familyName = font.family_name.replace(/"/g, '')
  if (!registeredFontFamilies.has(familyName)) {
    const regularBuffer = await fetchFontBuffer(font.regular_url)
    if (regularBuffer) GlobalFonts.register(regularBuffer, familyName)
    if (font.bold_url) {
      const boldBuffer = await fetchFontBuffer(font.bold_url)
      if (boldBuffer) GlobalFonts.register(boldBuffer, familyName)
    }
    registeredFontFamilies.add(familyName)
  }
  return familyName
}

// Renders a text layer directly via @napi-rs/canvas (Skia) rather than
// building an SVG string for Sharp/librsvg to rasterize. Real bug found
// live (2026-07-31): librsvg (the SVG engine Sharp uses, confirmed via
// `sharp.versions.rsvg`) does NOT reliably apply embedded base64
// @font-face fonts — Madhu selected a real, correctly-uploaded custom
// brand font (Space Grotesk Bold) and the render silently fell back to a
// generic default font every time. Confirmed via a direct test: an SVG
// with a Space Grotesk @font-face embed and one with NO font specified
// at all rendered to byte-identical PNGs — librsvg was ignoring the
// embedded font entirely, not a caching or data problem. @napi-rs/canvas
// or already correctly loads custom fonts via GlobalFonts.register() —
// this was already proven working for wrapAndFit()'s own text
// measurement — so rendering through the SAME engine both fixes the bug
// and removes a latent measurement/render engine mismatch risk (SVG text
// was previously measured by one engine and rendered by a different one).
async function renderTextLayerPng(
  layer: TextLayer, value: string, canvasWidth: number, canvasHeight: number
): Promise<{ buffer: Buffer; didShrink: boolean; didTruncate: boolean }> {
  const weight = layer.font_weight === 'bold' ? 'bold' : 'normal'

  // Custom brand font if configured; falls back to a generic sans-serif
  // (unaffected for every text layer authored before Phase C v4).
  let fontFamily = 'sans-serif'
  if (layer.font_family) {
    fontFamily = await ensureFontRegisteredForMeasurement(layer.font_family)
  }

  const { lines, fontSize, lineHeight, didShrink, didTruncate } = wrapAndFit(value, {
    width: layer.width,
    height: layer.height,
    maxLines: layer.max_lines,
    fontSize: layer.font_size,
    fontWeight: layer.font_weight,
    fontFamily,
  })

  const canvas = createCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')
  ctx.font = `${weight === 'bold' ? 'bold ' : ''}${fontSize}px ${fontFamily}`
  ctx.fillStyle = layer.font_color
  ctx.textAlign = layer.align === 'center' ? 'center' : layer.align === 'right' ? 'right' : 'left'

  const xPos = layer.align === 'center' ? layer.x + layer.width / 2 : layer.align === 'right' ? layer.x + layer.width : layer.x

  // Vertically center the wrapped block within the box height — mirrors
  // the existing photo_slot "center content inside a box" math above.
  const approxAscent = fontSize * 0.8
  const blockHeight = lines.length * lineHeight
  const firstBaselineY = layer.y + Math.max(0, (layer.height - blockHeight) / 2) + approxAscent

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], xPos, firstBaselineY + i * lineHeight)
  }

  return { buffer: canvas.toBuffer('image/png'), didShrink, didTruncate }
}

// Diagnostics-only: lets the variant editor's live preview surface an
// inline "text was shrunk/truncated to fit" warning without needing to
// parse the rendered PNG. Deliberately separate from compositeAnnouncement
// (which stays a plain Buffer-returning function for the real generation
// path) rather than threading a richer return type through it.
export async function analyzeTextLayers(
  variant: Variant, texts: { name?: string; title?: string; company?: string; tier?: string }
): Promise<Record<string, TextLayerDiagnostics>> {
  const result: Record<string, TextLayerDiagnostics> = {}
  for (const layer of variant.layers) {
    if (layer.type !== 'text') continue
    const value = resolveTextValue(layer, texts)
    if (!value) continue
    const normalized = withTextLayerDefaults(layer, { width: variant.canvas_width, height: variant.canvas_height })
    const measurementFamily = normalized.font_family ? await ensureFontRegisteredForMeasurement(normalized.font_family) : 'sans-serif'
    const { didShrink, didTruncate } = wrapAndFit(value, {
      width: normalized.width, height: normalized.height, maxLines: normalized.max_lines,
      fontSize: normalized.font_size, fontWeight: normalized.font_weight, fontFamily: measurementFamily,
    })
    result[layer.id] = { did_shrink: didShrink, did_truncate: didTruncate }
  }
  return result
}
