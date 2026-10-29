import { createHash } from 'node:crypto'
import { DEFAULT_DIMS, clampHeadScale, type Dims } from './dims'
export { DEFAULT_DIMS, DIM_LIMITS, clampDims, MAX_HEAD_SCALE, clampHeadScale, clampTypeStyles, SCREEN_TEXT_ELEMENTS, typeDefaults, TYPE_ELEMENTS, TYPE_LABELS, TYPE_WEIGHTS, TYPE_SIZE_LIMITS, type TypeElement, type TypeStyle, type TypeStyles, type Dims, type CardStyle } from './dims'

/* Stage Screens — the pure parts: which layout a session gets, how cards are arranged, the "has this changed?" fingerprint and the file name the AV team sees.
   Nothing here touches the database or draws anything, so it is unit-tested (geometry.test.ts). */

export type ScreenLayout = 'keynote' | 'fireside' | 'panel'

/** Name for the file and the badge on the page. Decided by the agenda's format, else by how many people are on stage. */
export function layoutFor(format: string | null | undefined, count: number): ScreenLayout {
  const f = (format ?? '').toLowerCase()
  if (f.includes('fireside')) return 'fireside'
  if (f.includes('panel') || f.includes('roundtable')) return 'panel'
  if (f.includes('keynote') || f.includes('address') || f.includes('remarks')) return count <= 1 ? 'keynote' : count === 2 ? 'fireside' : 'panel'
  return count <= 1 ? 'keynote' : count === 2 ? 'fireside' : 'panel'
}

/** Moderator wording on the event's own roles ("Moderator", "Panel Moderator"…). */
export const isModeratorRole = (label: string | null | undefined): boolean => /moderator/i.test(label ?? '')

/** Splits n cards into rows of at most maxPerRow, as evenly as possible (7 → 4+3, 8 → 4+4, 12 → 6+6). */
export function rowSizes(n: number, d: Dims = DEFAULT_DIMS): number[] {
  if (n <= 0) return []
  const rows = Math.ceil(n / d.maxPerRow)
  const base = Math.floor(n / rows), extra = n % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

export const rowWidth = (count: number, d: Dims = DEFAULT_DIMS): number => count * d.photoW + Math.max(0, count - 1) * d.gap

/** Left edge of every card, rows centred on the widest row (cards never need the canvas edge). */
export function cardColumns(sizes: number[], canvasWidth: number, d: Dims = DEFAULT_DIMS): number[][] {
  return sizes.map(count => {
    const left = Math.round((canvasWidth - rowWidth(count, d)) / 2)
    return Array.from({ length: count }, (_, i) => left + i * (d.photoW + d.gap))
  })
}

export function canvasWidthFor(sizes: number[], d: Dims = DEFAULT_DIMS): number {
  const widest = sizes.length ? Math.max(...sizes.map(n => rowWidth(n, d))) : d.photoW
  return Math.max(widest, d.minTopicW) + d.pad * 2
}


/** Zooms a photo frame by `scale` around the head, keeping the head where it was in the frame, and says which part of the enlarged image to keep.
 *  `size` = the frame width (and height, unless `height` is given); `head` = the head centre as ratios of the frame (a missing head box falls back to a point where heads usually are). Pure. */
export function zoomCrop(scale: number, head: { x: number; y: number } | null, size: number, height: number = size): { enlarged: number; enlargedH: number; left: number; top: number } {
  const s = clampHeadScale(scale), cx = head?.x ?? 0.5, cy = head?.y ?? 0.4
  const enlarged = Math.round(size * s), enlargedH = Math.round(height * s)
  const clampX = (v: number) => Math.min(enlarged - size, Math.max(0, Math.round(v)))
  const clampY = (v: number) => Math.min(enlargedH - height, Math.max(0, Math.round(v)))
  return { enlarged, enlargedH, left: clampX(cx * enlarged - cx * size), top: clampY(cy * enlargedH - cy * height) }
}

export type CardText = { name: string; title: string; company: string; country: string }
export type Overrides = { topic?: string; hide_topic?: boolean; cards?: Record<string, Partial<CardText>> }

/** Applies a producer's edits for this session only — the speaker's own record is never touched. */
export function applyCardOverride(base: CardText, o: Partial<CardText> | undefined): CardText {
  const pick = (k: keyof CardText) => (typeof o?.[k] === 'string' ? (o[k] as string).trim() : base[k])
  return { name: pick('name'), title: pick('title'), company: pick('company'), country: pick('country') }
}

export type FingerprintInput = {
  topic: string
  cards: { speakerId: string; moderator: boolean; text: CardText; photo: string | null }[]
  look: { font: string | null; background: string | null; text: string; accent: string; head: number; dims: Dims; style?: string; card?: unknown; type?: Record<string, unknown> }
}
/** Anything visible on the graphic goes in; when it differs from what a PNG was built from, that PNG is out of date. */
export function fingerprint(input: FingerprintInput): string {
  return createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16)
}

export type ScreenState = 'ready' | 'changed' | 'new'
export function screenState(savedFingerprint: string | null | undefined, hasPng: boolean, live: string): ScreenState {
  if (!hasPng || !savedFingerprint) return 'new'
  return savedFingerprint === live ? 'ready' : 'changed'
}

const slug = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '').slice(0, 24)
/** e.g. 2026-11-18_PlenaryStage_1030_Panel.png — sorts by day and time, and stays the same when the session is regenerated. */
export function fileNameFor(p: { date: string; stage: string | null; startHM: string; layout: ScreenLayout }): string {
  const cap = p.layout[0].toUpperCase() + p.layout.slice(1)
  return [p.date, slug(p.stage ?? 'Stage') || 'Stage', p.startHM.replace(':', ''), cap].join('_') + '.png'
}
