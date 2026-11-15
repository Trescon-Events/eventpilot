import { createHash } from 'node:crypto'
import type { Layer, SpeakerAreaLayer, TextLayer, Variant } from '@/app/lib/announcements/composite'

/* Session thumbnails — the pure parts (docs/build_suggestions/session-thumbnails.md): how cards are chosen and sized for one row, the tag, the file name,
   the "has this changed?" fingerprint and the card template scaled to its final size. Nothing here touches the database, fonts or images, so it is unit-tested (geometry.test.ts). */

export const DESIGN_W = 1920
export const DESIGN_H = 1080
/** Names must be at least this tall (px, on the 1920x1080 design) so they stay legible at YouTube's display sizes (cap height about 20 px). */
export const MIN_NAME_PX = 28
/** One row only. More speakers than this and the thumbnail is not drawn until the producer excludes some (Madhu, 15 Nov). */
export const MAX_SPEAKERS = 6
export const MAX_PER_CALL = 3

export type ThumbLayout = 'keynote' | 'fireside' | 'panel'
export type CardTextMode = 'name' | 'name_company'
export type Area = Pick<SpeakerAreaLayer, 'x' | 'y' | 'width' | 'height' | 'gap' | 'align' | 'max_card_width'>

/** Producer edits for one session's thumbnail. Stored on the thumbnail, never on the agenda or a speaker record. */
export type ThumbOverrides = {
  title?: string
  tag?: string
  hide_tag?: boolean
  cards?: Record<string, { name?: string; company?: string }>
  exclude?: string[]   // speaker ids left off this thumbnail
  order?: string[]     // speaker ids in the order the producer wants the NON-moderators (moderators always come first)
}

/** Keeps only the shapes we understand, so a bad body can never reach the renderer. */
export function cleanOverrides(raw: unknown): ThumbOverrides {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 400) : '')
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))] : [])
  const out: ThumbOverrides = {}
  if (str(r.title)) out.title = str(r.title)
  if (str(r.tag)) out.tag = str(r.tag)
  if (r.hide_tag === true) out.hide_tag = true
  const cards: NonNullable<ThumbOverrides['cards']> = {}
  if (r.cards && typeof r.cards === 'object') {
    for (const [id, v] of Object.entries(r.cards as Record<string, unknown>)) {
      if (!/^[0-9a-f-]{36}$/i.test(id) || !v || typeof v !== 'object') continue
      const c = v as Record<string, unknown>
      const one: { name?: string; company?: string } = {}
      if (str(c.name)) one.name = str(c.name)
      if (typeof c.company === 'string') one.company = str(c.company)   // an empty company is a real choice ("show none")
      if (Object.keys(one).length) cards[id] = one
    }
  }
  if (Object.keys(cards).length) out.cards = cards
  if (ids(r.exclude).length) out.exclude = ids(r.exclude)
  if (ids(r.order).length) out.order = ids(r.order)
  return out
}

export type Candidate = { speakerId: string; moderator: boolean; order: number }

/** The cards this thumbnail will show: moderator(s) first, then the others in agenda order (or the producer's order), minus excluded speakers.
 *  A moderator who is one of the first MAX_SPEAKERS cannot be excluded. */
export function chooseCards<T extends Candidate>(all: T[], o: ThumbOverrides): { cards: T[]; tooMany: boolean; keptModerators: string[] } {
  const mods = all.filter(c => c.moderator).sort((a, b) => a.order - b.order)
  const rest = all.filter(c => !c.moderator).sort((a, b) => a.order - b.order)
  const want = new Map((o.order ?? []).map((id, i) => [id, i]))
  const others = [...rest].sort((a, b) => (want.has(a.speakerId) ? want.get(a.speakerId)! : 1e6 + a.order) - (want.has(b.speakerId) ? want.get(b.speakerId)! : 1e6 + b.order))
  const ordered = [...mods, ...others]
  const ex = new Set(o.exclude ?? [])
  const keptModerators: string[] = []
  const cards = ordered.filter((c, i) => {
    if (!ex.has(c.speakerId)) return true
    if (c.moderator && i < MAX_SPEAKERS) { keptModerators.push(c.speakerId); return true }
    return false
  })
  return { cards, tooMany: cards.length > MAX_SPEAKERS, keptModerators }
}

/** The tag pill's text: the producer's override, else the agenda format in capitals. No format and no override: no tag. */
export function tagFor(format: string | null | undefined, o: ThumbOverrides): { text: string | null; warning: string | null } {
  if (o.hide_tag) return { text: null, warning: null }
  const t = (o.tag ?? '').trim() || (format ?? '').trim()
  if (t) return { text: t.toUpperCase(), warning: null }
  return { text: null, warning: 'No session format: set it in the agenda or override the tag' }
}

/** Card size for n cards in one row: equal width, never wider than max_card_width, shrunk further if the height would not fit. aspect = card height / card width. */
export function cardSize(n: number, area: Area, aspect: number): { width: number; height: number } {
  const count = Math.max(1, n)
  let width = Math.min(area.max_card_width, (area.width - area.gap * (count - 1)) / count)
  let height = width * aspect
  if (height > area.height) { height = area.height; width = height / aspect }
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(width * aspect)) }
}

/** Top-left of every card: one row, aligned per the area, top-aligned. */
export function cardPositions(n: number, size: { width: number; height: number }, area: Area): { x: number; y: number }[] {
  const rowW = n * size.width + Math.max(0, n - 1) * area.gap
  const left = area.align === 'left' ? area.x : area.align === 'right' ? area.x + area.width - rowW : area.x + (area.width - rowW) / 2
  return Array.from({ length: n }, (_, i) => ({ x: Math.round(left + i * (size.width + area.gap)), y: Math.round(area.y) }))
}

/** The card template at its final size. Layer boxes scale with the card; text sizes scale too, except the NAME, which is floored at MIN_NAME_PX
 *  (and its box made tall enough for the template's own line count) so a small card still carries a readable name. Cards are drawn at this size, not shrunk afterwards. */
export function scaleCardVariant(v: Variant, width: number, minName = MIN_NAME_PX): Variant {
  const k = width / v.canvas_width
  const height = Math.max(1, Math.round(v.canvas_height * k))
  const sx = (n: number) => Math.round(n * k)
  const layers = v.layers.map((l): Layer => {
    const box = { x: sx(l.x), y: sx(l.y), width: Math.max(1, sx(l.x + l.width) - sx(l.x)), height: Math.max(1, sx(l.y + l.height) - sx(l.y)) }
    // A photo slot's face alignment is measured against its FROZEN reference box (see PhotoAlignmentMeta), so that box scales with the card too: otherwise the head target lands outside the scaled crop.
    if (l.type === 'photo_slot' && l.alignment) return { ...l, ...box, alignment: { ...l.alignment, reference_box_width: Math.max(1, Math.round((l.alignment.reference_box_width ?? l.width) * k)), reference_box_height: Math.max(1, Math.round((l.alignment.reference_box_height ?? l.height) * k)) } }
    if (l.type !== 'text') return { ...l, ...box }
    const t = l as TextLayer
    const scaled = Math.max(1, Math.round(t.font_size * k))
    const font = t.field === 'name' ? Math.max(scaled, minName) : scaled
    const h = t.field === 'name' ? Math.max(box.height, Math.ceil(font * 1.2 * Math.max(1, t.max_lines))) : box.height
    return { ...t, ...box, height: h, font_size: font, ...(t.snap_gap !== undefined ? { snap_gap: Math.round(t.snap_gap * k) } : {}) }
  })
  return { ...v, canvas_width: width, canvas_height: height, layers }
}

export const speakerAreaOf = (layout: Variant): SpeakerAreaLayer | null => (layout.layers.find((l): l is SpeakerAreaLayer => l.type === 'speaker_area') ?? null)

const slugify = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-')
/** e.g. session-003-id12786-a-new-era-for-global-wealth-capital-technology-a — nnn is the position in the agenda (by day and time). */
export function fileBase(p: { position: number; konfhubId: string | null | undefined; title: string }): string {
  const nnn = String(p.position).padStart(3, '0')
  const id = p.konfhubId && /^\d+$/.test(p.konfhubId.trim()) ? `-id${p.konfhubId.trim()}` : ''
  const slug = slugify(p.title).slice(0, 48).replace(/-+$/, '') || 'session'
  return `session-${nnn}${id}-${slug}`
}

export type ThumbState = 'new' | 'ready' | 'changed' | 'needs_attention' | 'approved'
/** attention first (nothing can be generated), then new / changed from the fingerprint, then approved vs ready. */
export function thumbState(p: { attention: boolean; hasImage: boolean; savedFingerprint: string | null | undefined; live: string; approved: boolean }): ThumbState {
  if (p.attention) return 'needs_attention'
  if (!p.hasImage || !p.savedFingerprint) return 'new'
  if (p.savedFingerprint !== p.live) return 'changed'
  return p.approved ? 'approved' : 'ready'
}

/** Anything visible on the thumbnail goes in; when it differs from what the image was drawn from, the image is out of date. */
export function fingerprint(input: unknown): string {
  return createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16)
}
