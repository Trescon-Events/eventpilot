/* eslint-disable no-restricted-syntax -- these hex values are the colours drawn into the VIDEO, not app theme colours */

/* Lower-third template config (config-driven, like title cards). Pure — no server imports — so the settings page,
   the preview API and the video worker all share the same animation maths and defaults.

   The whole card (background graphic + name + job title + company) moves as ONE unit: it slides in from the left with a
   fade, holds, then slides back out. The hold is counted from when the card has finished arriving. */

export type LtTextEl = {
  x: number; y: number; width: number; size: number; weight: number
  color: string; upper: boolean; max_lines: number; font_id?: string | null
}
export type LtAnim = { style: 'slide_left' | 'fade'; in_dur: number; hold: number; out_dur: number; slide_px: number }
export type LowerThirdConfig = {
  background_url: string | null
  font_id: string | null
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

// Defaults sit inside the DFS bar (x 147–947, y 806–976 on the 1920×1080 canvas; cyan tab ≈ 21px wide).
export const DEFAULT_LT_CONFIG: LowerThirdConfig = {
  background_url: null,
  font_id: null,
  name:    { x: 192, y: 818, width: 735, size: 44, weight: 700, color: '#FFFFFF', upper: true,  max_lines: 1 },
  title:   { x: 192, y: 876, width: 735, size: 28, weight: 400, color: '#FFFFFF', upper: false, max_lines: 1 },
  company: { x: 192, y: 918, width: 735, size: 24, weight: 400, color: '#CCCCCC', upper: false, max_lines: 1 },
  animation: { style: 'slide_left', in_dur: LT_IN_DEFAULT, hold: LT_HOLD_DEFAULT, out_dur: LT_OUT_DEFAULT, slide_px: 220 },
}

const num = (v: unknown, fb: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb)
const str = (v: unknown, fb: string) => (typeof v === 'string' && v ? v : fb)

function mergeEl(raw: unknown, fb: LtTextEl): LtTextEl {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    x: num(e.x, fb.x, 0, LT_W), y: num(e.y, fb.y, 0, LT_H), width: num(e.width, fb.width, 40, LT_W),
    size: num(e.size, fb.size, 8, 200), weight: e.weight === 700 || e.weight === 400 || e.weight === 500 || e.weight === 600 ? (e.weight as number) : fb.weight,
    color: str(e.color, fb.color), upper: typeof e.upper === 'boolean' ? e.upper : fb.upper,
    max_lines: Math.round(num(e.max_lines, fb.max_lines, 1, 4)),
    font_id: typeof e.font_id === 'string' && e.font_id ? e.font_id : null,
  }
}

export function mergeLowerThirdConfig(raw: unknown): LowerThirdConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const a = (c.animation && typeof c.animation === 'object' ? c.animation : {}) as Record<string, unknown>
  const d = DEFAULT_LT_CONFIG
  return {
    background_url: typeof c.background_url === 'string' && c.background_url ? c.background_url : null,
    font_id: typeof c.font_id === 'string' && c.font_id ? c.font_id : null,
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
