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
  x: number
  y: number
  font_size: number
  font_color: string         // hex, e.g. '#FFFFFF'
  font_weight?: 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
  max_width?: number         // reserved for future wrap/truncate support
  font_family?: TextLayerFont // denormalized at variant-save time from a brand_fonts row — see app/lib/branding/fonts.ts. Falls back to a generic sans-serif when absent.
}

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

export type ResolvedAssets = Partial<Record<PhotoSlotLayer['source'], { buffer: Buffer; is_svg?: boolean }>>

export async function compositeAnnouncement(
  variant: Variant,
  assets: ResolvedAssets,
  texts: { name?: string; title?: string; company?: string; tier?: string }
): Promise<Buffer> {
  const compositeOps: OverlayOptions[] = []

  for (const layer of variant.layers) {
    if (layer.type === 'image') {
      const res = await fetch(layer.asset_url)
      if (!res.ok) throw new Error(`Failed to fetch layer image (${layer.id}): ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const resized = await sharp(buffer)
        .resize(layer.width, layer.height, { fit: 'cover' })
        .toBuffer()
      compositeOps.push({ input: resized, left: layer.x, top: layer.y })
      continue
    }

    if (layer.type === 'photo_slot') {
      const asset = assets[layer.source]
      if (!asset) continue // caller validates required sources before calling; missing optional ones are skipped

      let assetBuffer = asset.buffer
      if (asset.is_svg) assetBuffer = await sharp(assetBuffer).png().toBuffer()

      const resized = await sharp(assetBuffer)
        .resize(layer.width, layer.height, { fit: 'inside', withoutEnlargement: false })
        .toBuffer()

      const metadata = await sharp(resized).metadata()
      const assetWidth = metadata.width ?? layer.width
      const assetHeight = metadata.height ?? layer.height
      const left = layer.x + Math.floor((layer.width - assetWidth) / 2)
      const top = layer.y + Math.floor((layer.height - assetHeight) / 2)

      compositeOps.push({ input: resized, left, top })
      continue
    }

    // text
    const value = resolveTextValue(layer, texts)
    if (!value) continue
    const svg = await buildTextLayerSvg(layer, value, variant.canvas_width, variant.canvas_height)
    const svgBuffer = await sharp(Buffer.from(svg)).png().toBuffer()
    compositeOps.push({ input: svgBuffer, left: 0, top: 0 })
  }

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

const FONT_FORMATS: Record<string, string> = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }

function fontFormatFromUrl(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase() ?? ''
  return FONT_FORMATS[ext] ?? 'woff2'
}

async function buildFontFaceCss(font: TextLayerFont): Promise<string> {
  const familyName = font.family_name.replace(/"/g, '')
  const faces: string[] = []

  const regularRes = await fetch(font.regular_url)
  if (regularRes.ok) {
    const b64 = Buffer.from(await regularRes.arrayBuffer()).toString('base64')
    const format = fontFormatFromUrl(font.regular_url)
    faces.push(`@font-face{font-family:'${familyName}';font-weight:400;src:url(data:font/${format};base64,${b64}) format('${format}');}`)
  }

  if (font.bold_url) {
    const boldRes = await fetch(font.bold_url)
    if (boldRes.ok) {
      const b64 = Buffer.from(await boldRes.arrayBuffer()).toString('base64')
      const format = fontFormatFromUrl(font.bold_url)
      faces.push(`@font-face{font-family:'${familyName}';font-weight:700;src:url(data:font/${format};base64,${b64}) format('${format}');}`)
    }
  }

  return faces.join('')
}

async function buildTextLayerSvg(layer: TextLayer, value: string, width: number, height: number): Promise<string> {
  const weight = layer.font_weight === 'bold' ? 'bold' : 'normal'
  const anchor = layer.align === 'center' ? 'middle' : layer.align === 'right' ? 'end' : 'start'
  const xPos = layer.align === 'center' ? layer.x + (layer.max_width ?? 0) / 2 : layer.x
  const safe = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Custom brand font if configured; falls back to a generic sans-serif
  // (unaffected for every text layer authored before Phase C v4).
  const fontFamily = layer.font_family ? layer.font_family.family_name.replace(/"/g, '') : 'Arial, Helvetica, sans-serif'
  const styleBlock = layer.font_family ? `<style>${await buildFontFaceCss(layer.font_family)}</style>` : ''

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${styleBlock}<text x="${xPos}" y="${layer.y}" font-size="${layer.font_size}" fill="${layer.font_color}" font-weight="${weight}" text-anchor="${anchor}" font-family="${fontFamily}">${safe}</text></svg>`
}
