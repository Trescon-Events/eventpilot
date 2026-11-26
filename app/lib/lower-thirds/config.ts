/* eslint-disable no-restricted-syntax -- these hex values are the colours drawn into the VIDEO, not app theme colours */

/* Lower-third template config (config-driven, like title cards). Pure — no server imports — so the settings page,
   the preview API and the video worker all share the same animation maths and defaults.

   The whole card (background graphic + name + job title + company) moves as ONE unit: it slides in from the left with a
   fade, holds, then slides back out. The hold is counted from when the card has finished arriving. */

/** One text line style. Positions are not per line any more: the three lines stack inside the shared text box. */
export type LtTextEl = {
  size: number; weight: number
  color: string; upper: boolean; max_lines: number; font_id?: string | null
}
/** The area inside the graphic where the text goes (1920×1080 px). The text block is centred vertically in it. */
export type LtBox = { x: number; y: number; width: number; height: number }
export type LtAnim = { style: 'slide_left' | 'fade'; in_dur: number; hold: number; out_dur: number; slide_px: number }
export type LowerThirdConfig = {
  background_url: string | null
  font_id: string | null
  box: LtBox
  /** Space between the lines, px. */
  gap: number
  name: LtTextEl; title: LtTextEl; company: LtTextEl
  animation: LtAnim
}

export const LT_W = 1920
export const LT_H = 1080
export const LT_FPS = 30
export const LT_IN_DEFAULT = 0.8
export const LT_HOLD_DEFAULT = 6
export const LT_OUT_DEFAULT = 0.8
/** Default total on-screen time — used to space cues so two lower thirds never overlap. */
export const LT_TOTAL_DEFAULT = LT_IN_DEFAULT + LT_HOLD_DEFAULT + LT_OUT_DEFAULT

// Default text box sits inside the DFS bar (x 147–947, y 806–976 on the 1920×1080 canvas; cyan tab ≈ 21px wide).
export const DEFAULT_LT_CONFIG: LowerThirdConfig = {
  background_url: null,
  font_id: null,
  box: { x: 192, y: 818, width: 730, height: 146 },
  gap: 6,
  name:    { size: 44, weight: 700, color: '#FFFFFF', upper: true,  max_lines: 1 },
  title:   { size: 30, weight: 400, color: '#FFFFFF', upper: false, max_lines: 2 },
  company: { size: 26, weight: 400, color: '#CCCCCC', upper: false, max_lines: 2 },
  animation: { style: 'slide_left', in_dur: LT_IN_DEFAULT, hold: LT_HOLD_DEFAULT, out_dur: LT_OUT_DEFAULT, slide_px: 220 },
}

const num = (v: unknown, fb: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb)
const str = (v: unknown, fb: string) => (typeof v === 'string' && v ? v : fb)

function mergeEl(raw: unknown, fb: LtTextEl): LtTextEl {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    size: num(e.size, fb.size, 8, 200), weight: e.weight === 700 || e.weight === 400 || e.weight === 500 || e.weight === 600 ? (e.weight as number) : fb.weight,
    color: str(e.color, fb.color), upper: typeof e.upper === 'boolean' ? e.upper : fb.upper,
    max_lines: Math.round(num(e.max_lines, fb.max_lines, 1, 4)),
    font_id: typeof e.font_id === 'string' && e.font_id ? e.font_id : null,
  }
}

function mergeBox(raw: unknown, legacyName: unknown): LtBox {
  const d = DEFAULT_LT_CONFIG.box
  const b = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
  // Older saves had per-line x/y/width — start the box where the name line was.
  const n = (!b && legacyName && typeof legacyName === 'object' ? legacyName : {}) as Record<string, unknown>
  const src = b ?? n
  return {
    x: num(src.x, d.x, 0, LT_W - 40), y: num(src.y, d.y, 0, LT_H - 20),
    width: num(src.width, d.width, 40, LT_W), height: num(b?.height, d.height, 20, LT_H),
  }
}

/** Text box for a freshly uploaded graphic: the bar's opaque area (from the PNG) with room left for an accent tab. */
export function boxFromGraphicBounds(bb: { x0: number; y0: number; x1: number; y1: number }): LtBox {
  const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0
  const padL = Math.round(Math.min(60, Math.max(24, w * 0.055))), padR = Math.round(Math.min(40, Math.max(16, w * 0.03)))
  const padY = Math.round(Math.min(24, Math.max(8, h * 0.08)))
  return { x: bb.x0 + padL, y: bb.y0 + padY, width: Math.max(40, w - padL - padR), height: Math.max(20, h - 2 * padY) }
}

export function mergeLowerThirdConfig(raw: unknown): LowerThirdConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const a = (c.animation && typeof c.animation === 'object' ? c.animation : {}) as Record<string, unknown>
  const d = DEFAULT_LT_CONFIG
  return {
    background_url: typeof c.background_url === 'string' && c.background_url ? c.background_url : null,
    font_id: typeof c.font_id === 'string' && c.font_id ? c.font_id : null,
    box: mergeBox(c.box, c.name),
    gap: num(c.gap, d.gap, 0, 80),
    name: mergeEl(c.name, d.name), title: mergeEl(c.title, d.title), company: mergeEl(c.company, d.company),
    animation: {
      style: a.style === 'fade' ? 'fade' : 'slide_left',
      in_dur: num(a.in_dur, d.animation.in_dur, 0.1, 3), hold: num(a.hold, d.animation.hold, 1, 30),
      out_dur: num(a.out_dur, d.animation.out_dur, 0.1, 3), slide_px: num(a.slide_px, d.animation.slide_px, 0, 1200),
    },
  }
}

export const ltTotal = (a: LtAnim) => a.in_dur + a.hold + a.out_dur

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const easeIn = (x: number) => x * x * x

/** Opacity (0–1) and horizontal offset in px of the whole card at time t seconds. */
export function ltTransform(a: LtAnim, t: number): { opacity: number; dx: number } {
  const slide = a.style === 'slide_left' ? a.slide_px : 0
  if (t <= 0) return { opacity: 0, dx: -slide }
  if (t < a.in_dur) { const p = easeOut(t / a.in_dur); return { opacity: p, dx: -slide * (1 - p) } }
  if (t < a.in_dur + a.hold) return { opacity: 1, dx: 0 }
  const o = (t - a.in_dur - a.hold) / a.out_dur
  if (o >= 1) return { opacity: 0, dx: -slide }
  const p = easeIn(o)
  return { opacity: 1 - p, dx: -slide * p }
}
