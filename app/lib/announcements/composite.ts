// Sharp-based server-side creative compositing — replaces Canva Autofill
// (PRD v1.4; see the comment in app/lib/canva.ts for why). Canva stays the
// design tool for the *background* templates, exported once per event as
// blank PNGs with all dynamic content removed; this composites the
// stakeholder's photo/logo and text onto that background at generation
// time. Adapted from the PRD's own SS7 sample, with two corrections against
// this codebase's real conventions: background_url/the return value are
// real public HTTPS URLs from app/lib/events/storage.ts's uploadPublicAsset
// (not the PRD sample's placeholder `r2:` scheme), and this function
// returns a Buffer — the caller uploads it, matching how the old
// Canva-export re-upload step worked.
import sharp, { type OverlayOptions } from 'sharp'

export type TextLayer = {
  x: number
  y: number
  font_size: number
  font_color: string        // hex, e.g. '#FFFFFF'
  font_weight?: 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
  max_width?: number        // reserved for future wrap/truncate support
  value?: string             // hardcoded value (e.g. tier labels), used when no runtime text is passed
}

export type CompositeConfig = {
  background_url: string
  canvas_width: number
  canvas_height: number
  photo_zone?: { x: number; y: number; width: number; height: number }
  logo_zone?: { x: number; y: number; width: number; height: number; background?: string }
  name_text?: TextLayer
  title_text?: TextLayer
  company_text?: TextLayer
  tier_text?: TextLayer
}

export async function compositeAnnouncement(
  config: CompositeConfig,
  assets: { photo_or_logo_buffer: Buffer; is_svg?: boolean },
  texts: { name?: string; title?: string; company?: string; tier?: string }
): Promise<Buffer> {
  // 1. Fetch background from storage
  const bgResponse = await fetch(config.background_url)
  if (!bgResponse.ok) throw new Error(`Failed to fetch background template: ${bgResponse.status}`)
  const bgBuffer = Buffer.from(await bgResponse.arrayBuffer())

  // 2. Prepare the photo or logo
  let assetBuffer = assets.photo_or_logo_buffer
  if (assets.is_svg) {
    assetBuffer = await sharp(assetBuffer).png().toBuffer()
  }

  const compositeOps: OverlayOptions[] = []

  // 3. Resize and position photo/logo
  const zone = config.photo_zone ?? config.logo_zone
  if (zone) {
    if (config.logo_zone?.background) {
      const bgCard = await sharp({
        create: { width: zone.width, height: zone.height, channels: 4, background: config.logo_zone.background },
      }).png().toBuffer()
      compositeOps.push({ input: bgCard, left: zone.x, top: zone.y })
    }

    const resized = await sharp(assetBuffer)
      .resize(zone.width, zone.height, { fit: 'inside', withoutEnlargement: false })
      .toBuffer()

    const metadata = await sharp(resized).metadata()
    const assetWidth = metadata.width ?? zone.width
    const assetHeight = metadata.height ?? zone.height

    const leftOffset = zone.x + Math.floor((zone.width - assetWidth) / 2)
    const topOffset = zone.y + Math.floor((zone.height - assetHeight) / 2)

    compositeOps.push({ input: resized, left: leftOffset, top: topOffset })
  }

  // 4. Text overlays via SVG
  const textSvg = buildTextSvg(config, texts, config.canvas_width, config.canvas_height)
  if (textSvg) {
    compositeOps.push({ input: Buffer.from(textSvg), top: 0, left: 0 })
  }

  // 5. Composite everything onto background
  return sharp(bgBuffer)
    .resize(config.canvas_width, config.canvas_height)
    .composite(compositeOps)
    .png()
    .toBuffer()
}

function buildTextSvg(
  config: CompositeConfig,
  texts: { name?: string; title?: string; company?: string; tier?: string },
  width: number,
  height: number
): string | null {
  const layers: string[] = []

  const addText = (layer: TextLayer | undefined, value: string | undefined) => {
    if (!layer || !value) return
    const weight = layer.font_weight === 'bold' ? 'bold' : 'normal'
    const anchor = layer.align === 'center' ? 'middle' : layer.align === 'right' ? 'end' : 'start'
    const xPos = layer.align === 'center' ? layer.x + (layer.max_width ?? 0) / 2 : layer.x
    const safe = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    layers.push(
      `<text x="${xPos}" y="${layer.y}" font-size="${layer.font_size}" fill="${layer.font_color}" font-weight="${weight}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif">${safe}</text>`
    )
  }

  addText(config.name_text, texts.name)
  addText(config.title_text, texts.title)
  addText(config.company_text, texts.company)
  addText(config.tier_text, texts.tier ?? config.tier_text?.value)

  if (layers.length === 0) return null
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${layers.join('')}</svg>`
}
