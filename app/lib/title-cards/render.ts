import sharp from 'sharp'
import { compositeAnnouncement, layersForRole } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { TITLE_CARD_W, TITLE_CARD_H, gridCardSize, gridCardPositions, speakerGridOf } from './geometry'
import type { Variant } from '@/app/lib/announcements/composite'
import type { TitleCardSession, TitleCardSetup } from './data'

/* Title card rendering — same pattern as app/lib/thumbnails/render.ts.
   drawTitleCard() is the pure compositor; renderTitleCard() fetches photos and calls it. */

export type TitleCardPerson = { name: string; title: string; company: string; moderator: boolean; buffer: Buffer; url: string; headBox: NonNullable<TitleCardSession['cards'][number]['headBox']> }

/** Composites the layout (background, tag pill, stage label, session title) and places the speaker grid on top. */
export async function drawTitleCard(layout: Variant, card: Variant, text: { tag?: string; stage?: string; title: string }, people: TitleCardPerson[]): Promise<Buffer> {
  const area = speakerGridOf(layout.layers)
  if (!area) throw new Error('The title card layout has no speaker grid.')
  if (layout.canvas_width !== TITLE_CARD_W || layout.canvas_height !== TITLE_CARD_H) throw new Error(`Title card layout must be ${TITLE_CARD_W}x${TITLE_CARD_H}.`)
  const base = await compositeAnnouncement(layout, {}, { session_type: text.tag, session_stage: text.stage, session_title: text.title }, { showReferenceLayers: false })
  const size = gridCardSize(people.length, area, card.canvas_height / card.canvas_width)
  const spots = gridCardPositions(people.length, size, area)
  const k = size.width / card.canvas_width
  const scaledCard: Variant = {
    ...card,
    canvas_width: size.width,
    canvas_height: Math.max(1, Math.round(card.canvas_height * k)),
    layers: card.layers.map(l => {
      const sx = (n: number) => Math.round(n * k)
      const box = { x: sx(l.x), y: sx(l.y), width: Math.max(1, sx(l.x + l.width) - sx(l.x)), height: Math.max(1, sx(l.y + l.height) - sx(l.y)) }
      if (l.type === 'photo_slot' && l.alignment) return { ...l, ...box, alignment: { ...l.alignment, reference_box_width: Math.max(1, Math.round((l.alignment.reference_box_width ?? l.width) * k)), reference_box_height: Math.max(1, Math.round((l.alignment.reference_box_height ?? l.height) * k)) } }
      if (l.type !== 'text') return { ...l, ...box }
      return { ...l, ...box, font_size: Math.max(1, Math.round(l.font_size * k)) }
    }),
  }
  const pieces = await Promise.all(people.map(p =>
    compositeAnnouncement(
      layersForRole(scaledCard, p.moderator),
      { speaker_photo: { buffer: p.buffer, url: p.url, head_box: p.headBox } },
      { name: p.name, title: p.title, company: p.company },
      { showReferenceLayers: false }
    )
  ))
  return sharp(base).composite(pieces.map((input, k) => ({ input, left: spots[k].x, top: spots[k].y }))).png().toBuffer()
}

export async function renderTitleCard(s: TitleCardSession, setup: TitleCardSetup): Promise<{ png: Buffer; width: number; height: number }> {
  const { layout, card } = setup
  if (!layout || !card) throw new Error('Title card templates are not complete.')
  if (!speakerGridOf(layout.layers)) throw new Error('The title card layout has no speaker grid.')
  const people: TitleCardPerson[] = await Promise.all(s.cards.map(async c => {
    if (!c.photoUrl || !c.headBox) throw new Error(`Photo missing for ${c.name}.`)
    const buffer = await fetchAssetBuffer(c.photoUrl)
    if (!buffer) throw new Error(`Could not load the photo for ${c.name}.`)
    return { name: c.name, title: c.title, company: c.company, moderator: c.moderator, buffer, url: c.photoUrl, headBox: c.headBox }
  }))
  const png = await drawTitleCard(layout, card, { tag: s.tag ?? undefined, stage: s.stage ?? undefined, title: s.title }, people)
  return { png, width: TITLE_CARD_W, height: TITLE_CARD_H }
}
