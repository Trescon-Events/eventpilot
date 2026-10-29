/* Stage Screens — the sizes and defaults the branding/marketing team can change. Kept free of server imports so the Admin Console page can use it too. */

/* Variant 1 ("photo + details separate"): every size below can be changed per event by the branding team (Admin Console → Stage Speaker Pic → Card size).
   The defaults are what the built-in layout used before it became adjustable. Photos are never enlarged to fill a bigger frame: the cut-out keeps its own pixel size
   and the card background fills the rest. */
export type Dims = {
  photoW: number; photoH: number     // the photo frame in px (the cut-out sits inside it at its own size)
  gap: number                        // space between cards
  pad: number                        // transparent margin round the whole graphic
  minTopicW: number                  // a keynote has one narrow card; the topic still gets room to breathe
  maxPerRow: number                  // 1 moderator + 5 speakers on one line; more wraps to another line
  nameSize: number; lineSize: number // text sizes under the photo (name; title, company, country)
  topicSize: number                  // the session topic line(s) above the cards
}
export const DEFAULT_DIMS: Dims = { photoW: 1024, photoH: 1024, gap: 110, pad: 100, minTopicW: 2400, maxPerRow: 6, nameSize: 88, lineSize: 68, topicSize: 140 }
export const DIM_LIMITS: Record<keyof Dims, [number, number]> = {
  photoW: [500, 2400], photoH: [500, 2800], gap: [0, 400], pad: [0, 400], minTopicW: [1000, 8000], maxPerRow: [2, 8], nameSize: [30, 220], lineSize: [24, 180], topicSize: [50, 320],
}
/** Stored settings → a complete, in-range set of sizes (unknown or missing values fall back to the defaults). */
export function clampDims(raw: unknown): Dims {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_DIMS }
  for (const k of Object.keys(DEFAULT_DIMS) as (keyof Dims)[]) {
    const v = o[k]
    if (typeof v === 'number' && isFinite(v)) out[k] = Math.min(DIM_LIMITS[k][1], Math.max(DIM_LIMITS[k][0], Math.round(v)))
  }
  return out
}
export type CardStyle = 'separate' | 'card'

// Default colours baked into the exported PNG (not UI chrome), so the design-token lint does not apply.
/* eslint-disable no-restricted-syntax */
export const PANEL_DEFAULTS = {
  light: { text: '#0B1F3A', accent: '#1D4ED8' },
  dark: { text: '#FFFFFF', accent: '#7FB2FF' },
} as const
/* eslint-enable no-restricted-syntax */
export type Panel = keyof typeof PANEL_DEFAULTS

export const MAX_HEAD_SCALE = 1.8
export const clampHeadScale = (n: unknown): number => { const v = typeof n === 'number' && isFinite(n) ? n : 1; return Math.min(MAX_HEAD_SCALE, Math.max(1, Math.round(v * 100) / 100)) }

/* Text styling per element (Admin Console → Stage Speaker Pic → Text styles). Anything left unset falls back to the event's defaults, so nothing changes until someone sets it. */
export const TYPE_ELEMENTS = ['topic', 'moderator', 'name', 'title', 'company', 'country'] as const
export type TypeElement = typeof TYPE_ELEMENTS[number]
export const TYPE_LABELS: Record<TypeElement, string> = { topic: 'Session title', moderator: 'Moderator tag', name: 'Speaker name', title: 'Job title', company: 'Company', country: 'Country' }
export const TYPE_WEIGHTS = [400, 500, 600, 700] as const
export type TypeStyle = { fontId?: string | null; weight?: number; size?: number; color?: string; upper?: boolean }
export type TypeStyles = Partial<Record<TypeElement, TypeStyle>>
export const TYPE_SIZE_LIMITS: [number, number] = [20, 320]
const HEX6 = /^#[0-9a-f]{6}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Stored / sent styles → only known elements and valid values; anything else is dropped (so it falls back to the default). */
export function clampTypeStyles(raw: unknown): TypeStyles {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: TypeStyles = {}
  for (const el of TYPE_ELEMENTS) {
    const x = o[el] as Record<string, unknown> | undefined
    if (!x || typeof x !== 'object') continue
    const st: TypeStyle = {}
    if (typeof x.fontId === 'string' && UUID_RE.test(x.fontId)) st.fontId = x.fontId
    if (typeof x.weight === 'number' && (TYPE_WEIGHTS as readonly number[]).includes(x.weight)) st.weight = x.weight
    if (typeof x.size === 'number' && isFinite(x.size)) st.size = Math.min(TYPE_SIZE_LIMITS[1], Math.max(TYPE_SIZE_LIMITS[0], Math.round(x.size)))
    if (typeof x.color === 'string' && HEX6.test(x.color)) st.color = x.color
    if (typeof x.upper === 'boolean') st.upper = x.upper
    if (Object.keys(st).length) out[el] = st
  }
  return out
}
/** What each element uses when nothing is set: sizes come from the card dims, colours from the panel, weights and capitals as before. */
export function typeDefaults(el: TypeElement, ctx: { cardMode: boolean; dims: Dims; frameW: number; textColor: string; accentColor: string }): Required<Omit<TypeStyle, 'fontId'>> {
  const frameW = ctx.frameW
  switch (el) {
    case 'topic': return { weight: 700, size: ctx.dims.topicSize, color: ctx.accentColor, upper: false }
    case 'moderator': return { weight: 700, size: Math.round(frameW * 64 / 1024), color: ctx.accentColor, upper: true }
    case 'name': return { weight: 700, size: ctx.dims.nameSize, color: ctx.textColor, upper: true }
    case 'title': return { weight: 400, size: ctx.dims.lineSize, color: ctx.textColor, upper: false }
    case 'company': return { weight: 600, size: ctx.dims.lineSize, color: ctx.textColor, upper: false }
    case 'country': return { weight: 400, size: ctx.dims.lineSize, color: ctx.textColor, upper: false }
  }
}

/** In card mode the card template styles name, title, company and country; only the topic and the moderator tag are set here. */
export const SCREEN_TEXT_ELEMENTS: readonly TypeElement[] = ['topic', 'moderator']
