import sharp from 'sharp'
import { compositeAnnouncement, layersForRole } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { DESIGN_H, DESIGN_W, cardPositions, cardSize, scaleCardVariant, speakerAreaOf } from './geometry'
import { nameSizeFor } from './assess'
import type { ThumbSession, ThumbSetup } from './data'

/* Session thumbnails — draws one thumbnail: the layout (background, tag pill, title) with the speaker cards placed on top in one row.
   Each card is the event's thumbnail card template drawn at its FINAL size (not shrunk afterwards), so the name can be held at a readable size.
   Output: the 1920x1080 PNG, and the 1280x720 JPG for YouTube (under 2 MB). Nothing is ever enlarged past a photo's own resolution (cards are at most the template's size). */

const JPG_LIMIT = 1_900_000   // YouTube's limit is 2 MB; keep a margin

export async function renderThumbnail(s: ThumbSession, setup: ThumbSetup): Promise<{ png: Buffer; jpg: Buffer; width: number; height: number }> {
  const layout = setup.layouts[s.layout], card = setup.card
  if (!layout || !card) throw new Error('The thumbnail templates are not complete.')
  const area = speakerAreaOf(layout)
  if (!area) throw new Error(`The ${s.layout} layout has no speaker area.`)
  if (layout.canvas_width !== DESIGN_W || layout.canvas_height !== DESIGN_H) throw new Error(`The ${s.layout} layout must be ${DESIGN_W}x${DESIGN_H}.`)

  const base = await compositeAnnouncement(layout, {}, { session_type: s.tag ?? undefined, session_title: s.title }, { showReferenceLayers: false })
  const size = cardSize(s.cards.length, area, card.canvas_height / card.canvas_width)
  const spots = cardPositions(s.cards.length, size, area)
  const nameSize = await nameSizeFor(card, size.width, s.cards)   // one size for every name: what the longest needs
  const scaled = scaleCardVariant(card, size.width, nameSize ?? undefined)
  const pieces = await Promise.all(s.cards.map(async c => {
    if (!c.photoUrl || !c.headBox) throw new Error(`Photo missing for ${c.name}.`)
    const buffer = await fetchAssetBuffer(c.photoUrl)
    if (!buffer) throw new Error(`Could not load the photo for ${c.name}.`)
    return compositeAnnouncement(layersForRole(scaled, c.moderator), { speaker_photo: { buffer, url: c.photoUrl, head_box: c.headBox } }, { name: c.name, company: c.company }, { showReferenceLayers: false })
  }))
  const png = await sharp(base).composite(pieces.map((input, i) => ({ input, left: spots[i].x, top: spots[i].y }))).png().toBuffer()
  return { png, jpg: await toYoutubeJpg(png), width: DESIGN_W, height: DESIGN_H }
}

/** 1280x720 JPG under 2 MB: the quality steps down until it fits. */
export async function toYoutubeJpg(png: Buffer): Promise<Buffer> {
  const small = await sharp(png).resize(1280, 720, { fit: 'fill' }).flatten({ background: { r: 0, g: 0, b: 0 } }).toBuffer()
  let last: Buffer = Buffer.alloc(0)
  for (const q of [92, 86, 80, 74, 68, 60, 50]) {
    last = await sharp(small).jpeg({ quality: q, mozjpeg: true }).toBuffer()
    if (last.length <= JPG_LIMIT) return last
  }
  return last
}
