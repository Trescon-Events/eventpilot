// Turns one frozen batch item (+ the batch's frozen template) into exactly what the compositor and the print PDF
// builder need. ONE function feeds both the review-grid preview and the print file, so they can't drift apart.
import sharp from 'sharp'
import { analyzeTextLayers, compositeAnnouncement, type PhotoSlotLayer, type ResolvedAssets, type ResolvedTexts, type Variant } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import type { BadgeFlag, BadgeItemRow } from '@/app/lib/badges/types'

export const MIN_PRINT_PPI = 300

export type ItemInputs = { variant: Variant; assets: ResolvedAssets; texts: ResolvedTexts; photoMissing: boolean }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The frozen template with this item's photo nudge/zoom applied to the speaker-photo layer (other layers untouched). */
export function variantForItem(snapshot: Variant, item: BadgeItemRow): Variant {
  const p = item.overrides?.photo
  if (!p || (!p.dx && !p.dy && (p.zoom === undefined || p.zoom === 1))) return snapshot
  return {
    ...snapshot,
    layers: snapshot.layers.map(l => {
      if (l.type !== 'photo_slot' || l.source !== 'speaker_photo' || !l.alignment) return l
      const a = l.alignment
      return { ...l, alignment: {
        ...a,
        target_head_center_x: clamp(a.target_head_center_x + (p.dx ?? 0), 0, 1),
        target_head_center_y: clamp(a.target_head_center_y + (p.dy ?? 0), 0, 1),
        target_head_height: clamp(a.target_head_height * clamp(p.zoom ?? 1, 0.5, 2), 0.05, 1),
      } } as PhotoSlotLayer
    }),
  }
}

export function textsForItem(item: BadgeItemRow): ResolvedTexts {
  const o = item.overrides ?? {}
  return {
    name: (o.name ?? item.name ?? '').trim(),
    title: (o.title ?? item.title ?? '').trim(),
    company: (o.company ?? item.company ?? '').trim(),
    country: (o.country ?? item.country ?? '').trim(),
  }
}

export async function resolveItemInputs(item: BadgeItemRow, snapshot: Variant): Promise<ItemInputs> {
  const assets: ResolvedAssets = {}
  let photoMissing = true
  if (item.photo_url) {
    const buffer = await fetchAssetBuffer(item.photo_url)
    if (buffer) {
      assets.speaker_photo = { buffer, url: item.photo_url, is_svg: item.photo_url.toLowerCase().endsWith('.svg'), head_box: item.photo_head_box ?? undefined }
      photoMissing = false
    }
  }
  return { variant: variantForItem(snapshot, item), assets, texts: textsForItem(item), photoMissing }
}

/** Automatic review flags for one badge. Cheap checks first; the logo-overlap check needs two small renders. */
export async function computeFlags(item: BadgeItemRow, inputs: ItemInputs): Promise<BadgeFlag[]> {
  const flags: BadgeFlag[] = []
  const { variant, texts, assets } = inputs
  const usedFields = new Set(variant.layers.filter(l => l.type === 'text').map(l => (l as { field: string }).field))
  const labels: Record<string, string> = { name: 'name', title: 'job title', company: 'company', country: 'country' }
  const missing = Object.keys(labels).filter(f => usedFields.has(f) && !(texts as Record<string, string | undefined>)[f]).map(f => labels[f])
  if (missing.length) flags.push({ code: 'missing_field', message: `Missing ${missing.join(', ')}` })

  const photoLayer = variant.layers.find((l): l is PhotoSlotLayer => l.type === 'photo_slot' && l.source === 'speaker_photo')
  if (photoLayer) {
    if (inputs.photoMissing) {
      flags.push({ code: 'no_photo', message: item.photo_url ? 'The cleaned photo could not be loaded' : 'No cleaned photo on the speaker record' })
    } else if (assets.speaker_photo && variant.print && photoLayer.alignment) {
      // Real detail the photo can give at the head size this template asks for.
      const meta = await sharp(assets.speaker_photo.buffer).metadata()
      const headFrac = item.photo_head_box?.heightRatio ?? 0.36
      const headPx = headFrac * (meta.height ?? 0)
      const headInches = (photoLayer.alignment.target_head_height * variant.print.height_mm * (photoLayer.height / variant.canvas_height)) / 25.4
      const ppi = headInches > 0 ? headPx / headInches : Infinity
      if (ppi < MIN_PRINT_PPI) flags.push({ code: 'low_resolution', message: `Photo is only about ${Math.round(ppi)} ppi at print size (minimum ${MIN_PRINT_PPI})` })
    }
  }

  const diagnostics = await analyzeTextLayers(variant, texts)
  const layerField = new Map(variant.layers.filter(l => l.type === 'text').map(l => [l.id, (l as { field: string }).field]))
  for (const [id, d] of Object.entries(diagnostics)) {
    const label = labels[layerField.get(id) ?? ''] ?? 'text'
    if (d.did_truncate) flags.push({ code: 'text_overflow', message: `The ${label} does not fit its box` })
    else if (d.did_shrink) flags.push({ code: 'text_shrunk', message: `The ${label} was shrunk to fit` })
  }

  const overlap = await photoOverlapsLogo(variant, assets, texts, photoLayer)
  if (overlap) flags.push({ code: 'photo_overlaps_logo', message: 'The photo covers part of the logo block' })
  return flags
}

// Best effort: render only the photo layer, and compare its opaque pixels with the artwork content of the first image
// layer (anything that differs from that layer's corner colour / is non-transparent). Content here is logos + rules.
async function photoOverlapsLogo(variant: Variant, assets: ResolvedAssets, texts: ResolvedTexts, photoLayer: PhotoSlotLayer | undefined): Promise<boolean> {
  try {
    const bgLayer = variant.layers.find(l => l.type === 'image' && !l.reference_only && l.asset_url)
    if (!photoLayer || !bgLayer || !assets.speaker_photo) return false
    const [photoPng, bgPng] = await Promise.all([
      compositeAnnouncement({ ...variant, layers: [photoLayer] }, assets, texts),
      compositeAnnouncement({ ...variant, layers: [bgLayer] }, assets, texts),
    ])
    const [photo, bg] = await Promise.all([
      sharp(photoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(bgPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ])
    const w = photo.info.width, h = photo.info.height
    const px = (d: Buffer, x: number, y: number) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]] }
    const corner = px(bg.data, 2, 2)
    const transparentBg = corner[3] < 40
    let hits = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (photo.data[(y * w + x) * 4 + 3] < 200) continue
      const [r, g, b, a] = px(bg.data, x, y)
      const content = transparentBg ? a >= 40 : a >= 40 && Math.max(Math.abs(r - corner[0]), Math.abs(g - corner[1]), Math.abs(b - corner[2])) > 24
      if (content) hits++
    }
    return hits > 120 // a few px of anti-aliased edge don't count
  } catch { return false }
}
