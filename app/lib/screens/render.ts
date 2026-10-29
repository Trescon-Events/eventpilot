import sharp from 'sharp'
import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import { renderWebsitePhoto, websitePhotoParts } from '@/app/lib/media/website-photo-render'
import { compositeAnnouncement, planTextLayer, type TextLayer, type TextLayerPlan, type Variant } from '@/app/lib/announcements/composite'
import { canvasWidthFor, cardColumns, rowSizes, rowWidth, zoomCrop, type Dims } from './geometry'
import type { ScreenCard, ScreenLook, ScreenSession } from './data'
import { typeDefaults, type TypeElement } from './dims'

/* Stage Screens — draws one session's graphic: the topic on top, then a row of cards (photo, name, title, company, country; "MODERATOR" over the moderator's photo).
   Transparent background, so the AV team lays it over their video. Text goes through the same planner as badges and creatives (same fonts, same wrap/shrink rules).
   Photos are placed at their own pixel size (the stored cut-outs are 1024 px); nothing is ever enlarged. */

// eslint-disable-next-line no-restricted-syntax -- colour of the empty card when a speaker has no photo yet; part of the exported PNG
const EMPTY_CARD = '#E8EEF9'
const TEXT_OVERHANG = 60            // text may run a little wider than the photo
const TAG_H_RATIO = 130 / 64        // room above the photos for the MODERATOR tag (only when someone moderates), in tag heights
const AFTER_PHOTO = 56, AFTER_TOPIC = 130, ROW_GAP = 130

/** Design 2 is in use only when the event picked it AND a Stage Screen Card template exists (otherwise the plain design draws, never a broken one). */
const cardModeOf = (look: ScreenLook) => look.cardStyle === 'card' && !!look.cardVariant
/** The website-photo design: each photo is the event's Website Photo template drawn for that speaker, at the template's own size. */
const websiteModeOf = (look: ScreenLook) => !cardModeOf(look) && look.useWebsitePhoto && !!look.websiteVariant

/** How one element is written: its own setting where the branding team made one, else the event default (see typeDefaults). */
function styleFor(look: ScreenLook, el: TypeElement) {
  const d = typeDefaults(el, { cardMode: cardModeOf(look), dims: look.dims, frameW: cardModeOf(look) && look.cardVariant ? look.cardVariant.canvas_width : websiteModeOf(look) && look.websiteVariant ? look.websiteVariant.canvas_width : look.dims.photoW, textColor: look.textColor, accentColor: look.accentColor })
  const o = look.typeStyles[el] ?? {}
  return { weight: o.weight ?? d.weight, size: o.size ?? d.size, color: o.color ?? d.color, upper: o.upper ?? d.upper, font: (o.fontId ? look.typeFonts[o.fontId] : null) ?? look.font }
}
const cased = (st: { upper: boolean }, t: string) => (st.upper ? t.toUpperCase() : t)

const layerFor = (look: ScreenLook, o: { id: string; width: number; maxLines: number; size: number; weight: number; color: string; align: 'left' | 'center'; font?: ScreenLook['font'] }): TextLayer => ({
  id: o.id, type: 'text', field: 'custom', x: 0, y: 0, width: o.width, height: o.size * o.maxLines * 1.25, max_lines: o.maxLines, font_size: o.size, font_color: o.color,
  font_weight: o.weight, align: o.align, font_family: (o.font ?? look.font) ?? undefined, allow_shrink: true,
})

type Block = { plan: TextLayerPlan; color: string; top: number }
async function stack(look: ScreenLook, c: ScreenCard, d: Dims): Promise<{ blocks: Block[]; height: number }> {
  const parts: { el: TypeElement; text: string; maxLines: number; gapBefore: number }[] = [
    { el: 'name', text: c.text.name, maxLines: 3, gapBefore: 0 },
    { el: 'title', text: c.text.title, maxLines: 3, gapBefore: 30 },
    { el: 'company', text: c.text.company, maxLines: 3, gapBefore: 14 },
    { el: 'country', text: c.text.country, maxLines: 1, gapBefore: 14 },
  ]
  const blocks: Block[] = []
  let y = 0
  for (const p of parts) {
    if (!p.text) continue
    const st = styleFor(look, p.el)
    const plan = await planTextLayer(layerFor(look, { id: p.el, width: d.photoW + TEXT_OVERHANG, maxLines: p.maxLines, size: st.size, weight: st.weight, color: st.color, align: 'center', font: st.font }), cased(st, p.text))
    y += blocks.length ? p.gapBefore : 0
    blocks.push({ plan, color: st.color, top: y })
    y += plan.lines.length * plan.lineHeight
  }
  return { blocks, height: y }
}

function drawPlan(ctx: SKRSContext2D, plan: TextLayerPlan, color: string, originX: number, topY: number) {
  ctx.font = `${plan.fontWeight} ${plan.fontSize}px ${plan.fontFamily}`
  ctx.fillStyle = color; ctx.textAlign = plan.align
  if (plan.syntheticBold) { ctx.strokeStyle = color; ctx.lineWidth = plan.fontSize * 0.04; ctx.lineJoin = 'round' }
  plan.lines.forEach((line, i) => {
    const y = topY + plan.firstBaselineY + i * plan.lineHeight
    if (plan.syntheticBold) ctx.strokeText(line, originX + plan.xPos, y)
    ctx.fillText(line, originX + plan.xPos, y)
  })
}

async function fetchBuf(url: string): Promise<Buffer | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(25_000) }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null } catch { return null }
}

/** The photo frame for one card: the cut-out placed on the event's card background at its own size (bottom-centred, never enlarged to fill the frame); a plain photo is cropped to the frame instead. */
async function photoFor(c: ScreenCard, bg: Buffer | null, headScale: number, d: Dims): Promise<Buffer> {
  const W = d.photoW, H = d.photoH
  const raw = c.photoUrl ? await fetchBuf(c.photoUrl) : null
  const base = bg ?? await sharp({ create: { width: W, height: H, channels: 4, background: EMPTY_CARD } }).png().toBuffer()
  if (!raw) return sharp(base).png().toBuffer()   // no photo yet: just the empty card background
  if (c.cutout) {
    const placed = await sharp(raw).resize(W, H, { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
    const left = Math.round((W - placed.info.width) / 2), top = H - placed.info.height
    let fg = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: placed.data, left, top }]).png().toBuffer()
    if (headScale > 1) {   // bigger heads: zoom in around the head (the one place a photo is enlarged, on purpose — see Look → Head size)
      const head = c.head ? { x: (left + c.head.x * placed.info.width) / W, y: (top + c.head.y * placed.info.height) / H } : null
      const z = zoomCrop(headScale, head, W, H)
      fg = await sharp(fg).resize(z.enlarged, z.enlargedH, { kernel: 'lanczos3' }).extract({ left: z.left, top: z.top, width: W, height: H }).png().toBuffer()
    }
    return sharp(base).composite([{ input: fg }]).png().toBuffer()
  }
  return sharp(raw).resize(W, H, { fit: 'cover', position: 'attention' }).png().toBuffer()   // fills the frame; only enlarged if the source is smaller (flagged as low-res)
}


/** Website-photo design: the speaker drawn with the Website Photo template. Needs the cleaned photo and a confirmed head position; without them the plain frame is used. */
async function websiteFor(c: ScreenCard, variant: Variant, fallback: () => Promise<Buffer>): Promise<Buffer> {
  const parts = websitePhotoParts(variant)
  if (!parts.ok || !c.photoUrl || !c.headBox) return fallback()
  try {
    const [cutout, backgroundBuffer] = await Promise.all([fetchBuf(c.photoUrl), fetchBuf(parts.parts.backgroundLayer.asset_url)])
    if (!cutout || !backgroundBuffer) return fallback()
    const { buffer } = await renderWebsitePhoto({ variant, parts: parts.parts, cutout, cleanPhotoUrl: c.photoUrl, headBox: c.headBox, backgroundBuffer, texts: { name: c.text.name, title: c.text.title, company: c.text.company, country: c.text.country }, companyLogoUrl: c.logoUrl })
    return buffer
  } catch { return fallback() }
}

/** Design 2: one finished card, drawn from the event's Stage Screen Card template (layers, speaker photo slot, name / title / company / country text, stacked as the
    template says) exactly the way a creative is drawn. A speaker without a photo yet simply has no photo on the card. */
async function composeCard(c: ScreenCard, variant: Variant): Promise<Buffer> {
  const raw = c.photoUrl ? await fetchBuf(c.photoUrl) : null
  const assets = raw ? { speaker_photo: { buffer: raw, url: c.photoUrl ?? undefined, head_box: c.headBox } } : {}
  return compositeAnnouncement(variant, assets, { name: c.text.name, title: c.text.title, company: c.text.company, country: c.text.country }, { showReferenceLayers: false })
}

export async function renderScreen(session: ScreenSession, look: ScreenLook): Promise<{ buffer: Buffer; width: number; height: number }> {
  const cards = session.cards
  const cv = look.cardVariant, cardMode = cardModeOf(look) && !!cv
  const wv = look.websiteVariant, websiteMode = websiteModeOf(look) && !!wv
  const d = cardMode && cv ? { ...look.dims, photoW: cv.canvas_width, photoH: cv.canvas_height } : websiteMode && wv ? { ...look.dims, photoW: wv.canvas_width, photoH: wv.canvas_height } : look.dims   // design 2: the card is the frame, the details live inside it
  const modSt = styleFor(look, 'moderator'), topicSt = styleFor(look, 'topic')
  const CARD = d.photoW, TAG_PX = modSt.size, TAG_H = Math.round(TAG_PX * TAG_H_RATIO), PAD = d.pad
  const sizes = rowSizes(cards.length, d)
  const W = canvasWidthFor(sizes, d)
  const hasMod = cards.some(c => c.moderator)

  const bgRaw = look.backgroundUrl && !cardMode ? await fetchBuf(look.backgroundUrl) : null
  const bg = bgRaw ? await sharp(bgRaw).resize(d.photoW, d.photoH, { fit: 'cover' }).png().toBuffer() : null
  const photos = await Promise.all(cards.map(c => cardMode && cv ? composeCard(c, cv) : websiteMode && wv ? websiteFor(c, wv, () => photoFor(c, bg, look.headScale, d)) : photoFor(c, bg, look.headScale, d)))
  const stacks = await Promise.all(cards.map(c => cardMode ? Promise.resolve({ blocks: [] as Block[], height: 0 }) : stack(look, c, d)))
  const afterPhoto = cardMode ? 0 : AFTER_PHOTO

  const topicW = Math.max(sizes.length ? Math.max(...sizes.map(n => rowWidth(n, d))) : CARD, d.minTopicW)
  const topicText = session.hideTopic ? '' : session.topic
  const topicPlan = topicText ? await planTextLayer(layerFor(look, { id: 'topic', width: topicW, maxLines: 3, size: topicSt.size, weight: topicSt.weight, color: topicSt.color, align: 'center', font: topicSt.font }), cased(topicSt, topicText)) : null
  const topicH = topicPlan ? topicPlan.lines.length * topicPlan.lineHeight : 0

  // Row geometry: every card in a row shares the photo line; the row is as tall as its longest text stack.
  let cursor = PAD + (topicPlan ? topicH + AFTER_TOPIC : 0)
  const rowsAt: { top: number; start: number; count: number; textH: number }[] = []
  let start = 0
  for (const n of sizes) {
    const textH = Math.max(...stacks.slice(start, start + n).map(s => s.height))
    rowsAt.push({ top: cursor, start, count: n, textH })
    cursor += (hasMod ? TAG_H : 0) + d.photoH + afterPhoto + textH + ROW_GAP
    start += n
  }
  const H = Math.ceil(cursor - ROW_GAP + PAD)

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  if (topicPlan) drawPlan(ctx, topicPlan, topicSt.color, Math.round((W - topicW) / 2), PAD)

  const cols = cardColumns(sizes, W, d)
  const tagFamily = hasMod ? (await planTextLayer(layerFor(look, { id: 'tag', width: CARD, maxLines: 1, size: TAG_PX, weight: modSt.weight, color: modSt.color, align: 'center', font: modSt.font }), cased(modSt, 'Moderator'))).fontFamily : 'sans-serif'
  for (let r = 0; r < rowsAt.length; r++) {
    const row = rowsAt[r]
    const photoTop = row.top + (hasMod ? TAG_H : 0)
    for (let i = 0; i < row.count; i++) {
      const idx = row.start + i, x = cols[r][i], c = cards[idx]
      if (c.moderator) {
        ctx.font = `${modSt.weight} ${TAG_PX}px ${tagFamily}`
        ctx.fillStyle = modSt.color; ctx.textAlign = 'center'
        ctx.fillText(cased(modSt, 'Moderator'), x + CARD / 2, row.top + TAG_PX + 20)
      }
      ctx.drawImage(await loadImage(photos[idx]), x, photoTop, CARD, d.photoH)
      const textTop = photoTop + d.photoH + afterPhoto
      for (const b of stacks[idx].blocks) drawPlan(ctx, b.plan, b.color, x - TEXT_OVERHANG / 2, textTop + b.top)
    }
  }
  return { buffer: canvas.toBuffer('image/png'), width: W, height: H }
}
