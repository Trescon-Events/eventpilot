import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { compositeExtraLayersOnto, type ImageLayer, type PhotoSlotLayer, type ResolvedAssets, type ResolvedTexts, type Variant } from '@/app/lib/announcements/composite'
import { alignAndCropPhoto, type HeadBox } from '@/app/lib/media/face-alignment'
import { compositeOnBackground } from '@/app/lib/media/composite-on-background'

/* The Website Photo template drawn for one speaker — the single implementation behind the website-photo generate route and the Stage Screens "website photo design".
   Face-aligned crop of the cleaned photo, composited on the variant's background image, then every other layer of the variant (design layers, text, logos) on top.
   Output is a lossless PNG at the variant's own canvas size (the route turns it into the WebP KonfHub publishes; Stage Screens uses the PNG). */

export type WebsitePhotoParts = { photoLayer: PhotoSlotLayer; backgroundLayer: ImageLayer }

/** The two layers a Website Photo template must have, or a plain reason it cannot be drawn yet. */
export function websitePhotoParts(variant: Variant | undefined | null): { ok: true; parts: WebsitePhotoParts } | { ok: false; error: string } {
  if (!variant) return { ok: false, error: 'No Website Photo template configured for this event yet' }
  const photoLayer = variant.layers.find((l): l is PhotoSlotLayer => l.type === 'photo_slot' && l.source === 'speaker_photo')
  if (!photoLayer?.alignment) return { ok: false, error: 'The Website Photo variant has no reference photo layer set up yet' }
  const backgroundLayer = variant.layers.find((l): l is ImageLayer => l.type === 'image' && !l.reference_only)
  if (!backgroundLayer?.asset_url) return { ok: false, error: 'The Website Photo variant has no background image set yet' }
  return { ok: true, parts: { photoLayer, backgroundLayer } }
}

export async function renderWebsitePhoto(input: {
  variant: Variant; parts: WebsitePhotoParts
  cutout: Buffer; cleanPhotoUrl: string; headBox: HeadBox; backgroundBuffer: Buffer
  texts: ResolvedTexts; companyLogoUrl?: string | null
}): Promise<{ buffer: Buffer; cropWarning: { left: number; top: number; right: number; bottom: number } | null }> {
  const { variant, parts, cutout, cleanPhotoUrl, headBox, backgroundBuffer, texts } = input
  const { photoLayer, backgroundLayer } = parts
  const target = { ...photoLayer.alignment!, box: { x: 0, y: 0, width: variant.canvas_width, height: variant.canvas_height } }
  const { buffer: cropped, padding } = await alignAndCropPhoto(cutout, target, headBox)
  const PADDING_WARNING_THRESHOLD_PX = 3
  const cropWarning = Math.max(padding.left, padding.top, padding.right, padding.bottom) > PADDING_WARNING_THRESHOLD_PX ? padding : null
  let composed = await compositeOnBackground(cropped, backgroundBuffer, { canvasWidth: variant.canvas_width, canvasHeight: variant.canvas_height })

  // Any layers beyond the required Image + speaker-photo Photo/Logo Slot pair (see compositeExtraLayersOnto in composite.ts).
  const extraLayers = variant.layers.filter(l => l.id !== photoLayer.id && l.id !== backgroundLayer.id)
  if (extraLayers.length > 0) {
    const extraSources = new Set(extraLayers.filter((l): l is PhotoSlotLayer => l.type === 'photo_slot').map(l => l.source))
    const entries = await Promise.all(Array.from(extraSources).map(async (source): Promise<[PhotoSlotLayer['source'], NonNullable<ResolvedAssets[PhotoSlotLayer['source']]>] | null> => {
      if (source === 'speaker_photo') return [source, { buffer: cropped, url: cleanPhotoUrl, head_box: headBox }]
      const url = source === 'speaker_logo' ? input.companyLogoUrl ?? null : null // partner_logo: N/A, speaker-only
      if (!url) return null
      const buffer = await fetchAssetBuffer(url)
      return buffer ? [source, { buffer, url, is_svg: url.toLowerCase().endsWith('.svg') }] : null
    }))
    const assets: ResolvedAssets = Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => e !== null))
    composed = await compositeExtraLayersOnto(composed, extraLayers, variant, assets, texts)
  }
  return { buffer: composed, cropWarning }
}
