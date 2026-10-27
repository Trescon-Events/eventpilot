import sharp from 'sharp'
import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import { planTextLayer, type TextLayer, type TextLayerPlan } from '@/app/lib/announcements/composite'
import { canvasWidthFor, cardColumns, rowSizes, rowWidth, zoomCrop, type Dims } from './geometry'
import type { ScreenCard, ScreenLook, ScreenSession } from './data'

/* Stage Screens — draws one session's graphic: the topic on top, then a row of cards (photo, name, title, company, country; "MODERATOR" over the moderator's photo).
   Transparent background, so the AV team lays it over their video. Text goes through the same planner as badges and creatives (same fonts, same wrap/shrink rules).
   Photos are placed at their own pixel size (the stored cut-outs are 1024 px); nothing is ever enlarged. */

// eslint-disable-next-line no-restricted-syntax -- colour of the empty card when a speaker has no photo yet; part of the exported PNG
const EMPTY_CARD = '#E8EEF9'
const TEXT_OVERHANG = 60            // text may run a little wider than the photo
const TAG_RATIO = 64 / 1024         // MODERATOR tag size follows the photo width (64 px on the default 1024 frame)
const TAG_H_RATIO = 130 / 64        // room above the photos for the MODERATOR tag (only when someone moderates), in tag heights
const AFTER_PHOTO = 56, AFTER_TOPIC = 130, ROW_GAP = 130

const layerFor = (look: ScreenLook, o: { id: string; width: number; maxLines: number; size: number; weight: number; color: string; align: 'left' | 'center' }): TextLayer => ({
  id: o.id, type: 'text', field: 'custom', x: 0, y: 0, width: o.width, height: o.size * o.maxLines * 1.25, max_lines: o.maxLines, font_size: o.size, font_color: o.color,
  font_weight: o.weight, align: o.align, font_family: look.font ?? undefined, allow_shrink: true,
})

type Block = { plan: TextLayerPlan; color: string; top: number }
async function stack(look: ScreenLook, c: ScreenCard, d: Dims): Promise<{ blocks: Block[]; height: number }> {
  const parts: { id: string; text: string; size: number; weight: number; maxLines: number; gapBefore: number }[] = [
    { id: 'name', text: c.text.name.toUpperCase(), size: d.nameSize, weight: 700, maxLines: 3, gapBefore: 0 },
    { id: 'title', text: c.text.title, size: d.lineSize, weight: 400, maxLines: 3, gapBefore: 30 },
    { id: 'company', text: c.text.company, size: d.lineSize, weight: 600, maxLines: 3, gapBefore: 14 },
    { id: 'country', text: c.text.country, size: d.lineSize, weight: 400, maxLines: 1, gapBefore: 14 },
  ]
  const blocks: Block[] = []
  let y = 0
  for (const p of parts) {
    if (!p.text) continue
    const plan = await planTextLayer(layerFor(look, { id: p.id, width: d.photoW + TEXT_OVERHANG, maxLines: p.maxLines, size: p.size, weight: p.weight, color: look.textColor, align: 'center' }), p.text)
    y += blocks.length ? p.gapBefore : 0
    blocks.push({ plan, color: look.textColor, top: y })
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

export async function renderScreen(session: ScreenSession, look: ScreenLook): Promise<{ buffer: Buffer; width: number; height: number }> {
  const cards = session.cards, d = look.dims
  const CARD = d.photoW, TAG_PX = Math.round(d.photoW * TAG_RATIO), TAG_H = Math.round(TAG_PX * TAG_H_RATIO), PAD = d.pad
  const sizes = rowSizes(cards.length, d)
  const W = canvasWidthFor(sizes, d)
  const hasMod = cards.some(c => c.moderator)

  const bgRaw = look.backgroundUrl ? await fetchBuf(look.backgroundUrl) : null
  const bg = bgRaw ? await sharp(bgRaw).resize(d.photoW, d.photoH, { fit: 'cover' }).png().toBuffer() : null
  const photos = await Promise.all(cards.map(c => photoFor(c, bg, look.headScale, d)))
  const stacks = await Promise.all(cards.map(c => stack(look, c, d)))

  const topicW = Math.max(sizes.length ? Math.max(...sizes.map(n => rowWidth(n, d))) : CARD, d.minTopicW)
  const topicText = session.hideTopic ? '' : session.topic
  const topicPlan = topicText ? await planTextLayer(layerFor(look, { id: 'topic', width: topicW, maxLines: 3, size: d.topicSize, weight: 700, color: look.accentColor, align: 'center' }), topicText) : null
  const topicH = topicPlan ? topicPlan.lines.length * topicPlan.lineHeight : 0

  // Row geometry: every card in a row shares the photo line; the row is as tall as its longest text stack.
  let cursor = PAD + (topicPlan ? topicH + AFTER_TOPIC : 0)
  const rowsAt: { top: number; start: number; count: number; textH: number }[] = []
  let start = 0
  for (const n of sizes) {
    const textH = Math.max(...stacks.slice(start, start + n).map(s => s.height))
    rowsAt.push({ top: cursor, start, count: n, textH })
    cursor += (hasMod ? TAG_H : 0) + d.photoH + AFTER_PHOTO + textH + ROW_GAP
    start += n
  }
  const H = Math.ceil(cursor - ROW_GAP + PAD)

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  if (topicPlan) drawPlan(ctx, topicPlan, look.accentColor, Math.round((W - topicW) / 2), PAD)

  const cols = cardColumns(sizes, W, d)
  const tagFamily = hasMod ? (await planTextLayer(layerFor(look, { id: 'tag', width: CARD, maxLines: 1, size: TAG_PX, weight: 700, color: look.accentColor, align: 'center' }), 'MODERATOR')).fontFamily : 'sans-serif'
  for (let r = 0; r < rowsAt.length; r++) {
    const row = rowsAt[r]
    const photoTop = row.top + (hasMod ? TAG_H : 0)
    for (let i = 0; i < row.count; i++) {
      const idx = row.start + i, x = cols[r][i], c = cards[idx]
      if (c.moderator) {
        ctx.font = `700 ${TAG_PX}px ${tagFamily}`
        ctx.fillStyle = look.accentColor; ctx.textAlign = 'center'
        ctx.fillText('MODERATOR', x + CARD / 2, row.top + TAG_PX + 20)
      }
      ctx.drawImage(await loadImage(photos[idx]), x, photoTop, CARD, d.photoH)
      const textTop = photoTop + d.photoH + AFTER_PHOTO
      for (const b of stacks[idx].blocks) drawPlan(ctx, b.plan, b.color, x - TEXT_OVERHANG / 2, textTop + b.top)
    }
  }
  return { buffer: canvas.toBuffer('image/png'), width: W, height: H }
}
