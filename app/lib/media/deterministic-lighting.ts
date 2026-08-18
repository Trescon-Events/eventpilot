// Deterministic Speaker Photo Lighting (2026-08-18) — replaces PhotoRoom's
// editWithAI for the website-photo pipeline entirely. See
// website-photo-engine.ts's git history for the full investigation this
// replaces: PhotoRoom's generative relight (1) doesn't reliably obey
// framing instructions — the same input/prompt drifted on some calls and
// not others, confirmed by direct before/after comparison — and (2) any
// attempt to correct that drift afterward requires re-detecting the head
// position on PhotoRoom's own output, and that re-detection (Gemini-based)
// is itself too imprecise for correction work (measured a head at 35% of
// frame height that was visibly ~45-50%). Two independent, compounding
// sources of unreliability. Madhu's call: "all photos must look the same
// since they are all used publicly" — a hard consistency requirement a
// generative model can't give a guarantee for, no matter how the prompt is
// worded.
//
// The fix: a rim/backlight + soft key light are well-defined visual
// effects, not something that actually requires an AI to imagine. This is
// plain layer compositing (blur + gradient masks + screen blend), built on
// sharp (already a dependency) — same input always produces the exact same
// output, forever, for every speaker, with zero PhotoRoom credit cost and
// no ~30-90s wait. The ONLY position data this uses is the same
// alignment/head_box ratios alignAndCropPhoto already trusted to produce
// the crop — no re-detection of anything after that point, which is
// exactly the step that made every PhotoRoom-based correction attempt
// unreliable.
import sharp, { type OverlayOptions } from 'sharp'

export type LightingEffect = {
  rim_color?: string   // hex, e.g. '#3CA0FF' — the backlight/rim color
  rim_side?: 'left' | 'right'
  rim_intensity?: number  // 0-1, default 1
  key_light_color?: string  // hex, e.g. '#FFE1B4' — warm fill on the face
  key_light_intensity?: number  // 0-1, default 1; 0 disables the key light
}

const DEFAULTS: Required<LightingEffect> = {
  rim_color: '#3CA0FF',
  rim_side: 'left',
  rim_intensity: 1,
  key_light_color: '#FFE1B4',
  key_light_intensity: 1,
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return { r: 60, g: 160, b: 255 }
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

export async function applyDeterministicLighting(
  subjectBuffer: Buffer,
  backgroundBuffer: Buffer,
  opts: {
    canvasWidth: number
    canvasHeight: number
    // Known face position — from the SAME alignment ratios the crop step
    // already used, never re-detected against generated output.
    headCenterXRatio: number
    headCenterYRatio: number
    headHeightRatio: number
    effect?: LightingEffect
  }
): Promise<Buffer> {
  const { canvasWidth: W, canvasHeight: H } = opts
  const effect = { ...DEFAULTS, ...opts.effect }
  const rimRgb = hexToRgb(effect.rim_color)
  const keyRgb = hexToRgb(effect.key_light_color)

  const bgResized = await sharp(backgroundBuffer).resize(W, H, { fit: 'cover' }).toBuffer()

  const layers: OverlayOptions[] = []

  if (effect.rim_intensity > 0) {
    const alphaMask = await sharp(subjectBuffer).ensureAlpha().extractChannel('alpha').toBuffer()
    const blurredMask = await sharp(alphaMask).blur(9).toBuffer()

    const fromEdge = effect.rim_side === 'left' ? '0%' : '100%'
    const toEdge = effect.rim_side === 'left' ? '100%' : '0%'
    const hGradientSvg = `<svg width="${W}" height="${H}">
      <defs><linearGradient id="g" x1="${fromEdge}" y1="0%" x2="${toEdge}" y2="0%">
        <stop offset="0%" stop-color="white"/><stop offset="20%" stop-color="white"/><stop offset="42%" stop-color="black"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`
    const hGradient = await sharp(Buffer.from(hGradientSvg)).png().toBuffer()

    const vFalloffSvg = `<svg width="${W}" height="${H}">
      <defs><linearGradient id="v" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="white"/><stop offset="50%" stop-color="white" stop-opacity="0.85"/><stop offset="100%" stop-color="white" stop-opacity="0.3"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#v)"/>
    </svg>`
    const vFalloff = await sharp(Buffer.from(vFalloffSvg)).png().toBuffer()

    const shaped = await sharp(blurredMask)
      .composite([{ input: hGradient, blend: 'multiply' }, { input: vFalloff, blend: 'multiply' }])
      .linear(2.0 * effect.rim_intensity, -20 * effect.rim_intensity)
      .toBuffer()

    const rimSolid = await sharp({ create: { width: W, height: H, channels: 3, background: rimRgb } }).png().toBuffer()
    const rimGlow = await sharp(rimSolid).joinChannel(shaped).png().toBuffer()
    layers.push({ input: rimGlow, blend: 'screen' })
  }

  layers.push({ input: subjectBuffer, blend: 'over' })

  if (effect.key_light_intensity > 0) {
    const cx = Math.round(opts.headCenterXRatio * W)
    const cy = Math.round(opts.headCenterYRatio * H)
    const r = Math.max(1, Math.round(opts.headHeightRatio * H * 0.75))
    const baseOpacity = 0.35 * effect.key_light_intensity
    const midOpacity = 0.12 * effect.key_light_intensity
    const keyLightSvg = `<svg width="${W}" height="${H}">
      <defs><radialGradient id="k" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="rgb(${keyRgb.r},${keyRgb.g},${keyRgb.b})" stop-opacity="${baseOpacity}"/>
        <stop offset="70%" stop-color="rgb(${keyRgb.r},${keyRgb.g},${keyRgb.b})" stop-opacity="${midOpacity}"/>
        <stop offset="100%" stop-color="rgb(${keyRgb.r},${keyRgb.g},${keyRgb.b})" stop-opacity="0"/>
      </radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#k)"/>
    </svg>`
    const keyLight = await sharp(Buffer.from(keyLightSvg)).png().toBuffer()
    layers.push({ input: keyLight, blend: 'screen' })
  }

  return sharp(bgResized).composite(layers).png().toBuffer()
}
