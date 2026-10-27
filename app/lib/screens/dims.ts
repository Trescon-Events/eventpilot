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
