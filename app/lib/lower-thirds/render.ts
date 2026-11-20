import sharp from 'sharp'
import { compositeAnnouncement } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import type { Variant, ResolvedTexts, ResolvedAssets } from '@/app/lib/announcements/composite'
import type { LowerThirdSpeaker } from './data'

/* Lower-third rendering.
   drawLowerThirdStill() — web app: composites the hold frame as a PNG for browser preview (no animation applied).
   compositeAnimatedFrame() — worker: computes per-layer opacity/Y at time t, then composites. */

export const LT_FPS = 30
export const LT_DURATION = 6.0  // total cue length in seconds

/** Easing: ease-out cubic for in, ease-in cubic for out. */
function ease(x: number): number { return 1 - Math.pow(1 - x, 3) }

/** 0.0–1.0 opacity for a layer at time t (seconds). Returns 1 when animation is undefined. */
export function layerOpacity(anim: { in_start: number; in_dur: number; out_start: number; out_dur: number } | undefined, t: number): number {
  if (!anim) return 1
  if (t < anim.in_start) return 0
  if (t < anim.in_start + anim.in_dur) return ease((t - anim.in_start) / Math.max(0.001, anim.in_dur))
  if (t < anim.out_start) return 1
  if (t < anim.out_start + anim.out_dur) return 1 - ease((t - anim.out_start) / Math.max(0.001, anim.out_dur))
  return 0
}

/** Y offset (px) for a slide_up layer at time t. 0 at and after in_start + in_dur. */
export function layerSlideOffset(anim: { style: string; in_start: number; in_dur: number; slide_px?: number } | undefined, t: number): number {
  if (!anim || anim.style !== 'slide_up' || !anim.slide_px) return 0
  if (t >= anim.in_start + anim.in_dur) return 0
  if (t < anim.in_start) return anim.slide_px
  const progress = ease((t - anim.in_start) / Math.max(0.001, anim.in_dur))
  return Math.round(anim.slide_px * (1 - progress))
}

/** Applies opacity to a PNG buffer (Sharp). Returns the buffer unchanged at opacity 1. */
export async function applyOpacity(buf: Buffer, opacity: number): Promise<Buffer> {
  if (opacity >= 1) return buf
  if (opacity <= 0) return sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
  const alpha = Math.round(255 * opacity)
  return sharp(buf).ensureAlpha().composite([{ input: Buffer.from([255, 255, 255, alpha]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }]).png().toBuffer()
}

/** Build the texts and assets for compositeAnnouncement() from a LowerThirdSpeaker. */
export function speakerToTexts(speaker: LowerThirdSpeaker): ResolvedTexts {
  return { name: speaker.name, title: speaker.title, company: speaker.company }
}

export async function speakerToAssets(speaker: LowerThirdSpeaker): Promise<ResolvedAssets> {
  if (!speaker.photoUrl) return {}
  const buffer = await fetchAssetBuffer(speaker.photoUrl)
  if (!buffer) return {}
  return { speaker_photo: { buffer, url: speaker.photoUrl, head_box: speaker.headBox } }
}

/** Still PNG at the hold frame (opacity 1, no offset). Used for browser preview. */
export async function drawLowerThirdStill(variant: Variant, speaker: LowerThirdSpeaker): Promise<Buffer> {
  const texts = speakerToTexts(speaker)
  const assets = await speakerToAssets(speaker)
  return compositeAnnouncement(variant, assets, texts, { showReferenceLayers: false })
}

/** One composited frame at time t. Used by the worker for each of the 180 frames. */
export async function compositeAnimatedFrame(variant: Variant, speaker: LowerThirdSpeaker, t: number): Promise<Buffer> {
  const texts = speakerToTexts(speaker)
  const assets = await speakerToAssets(speaker)
  // Render the base still (all layers at full opacity and position)
  const base = await compositeAnnouncement(variant, assets, texts, { showReferenceLayers: false })
  // Then re-composite per-layer with animation applied.
  // We render each animated layer independently and apply opacity/offset,
  // then compose them onto a transparent canvas in z-order.
  // For layers with no animation or animation.opacity == 1 at time t, skip the extra pass.
  const layers = variant.layers.filter(l => l.type !== 'speaker_area' && l.type !== 'speaker_grid')
  const anyAnimated = layers.some(l => l.animation)
  if (!anyAnimated) return base
  // Build per-layer renders for animated layers
  const { createCanvas } = await import('@napi-rs/canvas')
  const compositeOps: { input: Buffer; left: number; top: number }[] = []
  for (const layer of layers) {
    if (!layer.animation) continue
    const opacity = layerOpacity(layer.animation, t)
    const dy = layerSlideOffset(layer.animation, t)
    if (opacity <= 0) continue
    // Render just this one layer as a full-canvas PNG
    const singleVariant = { ...variant, layers: [layer] }
    let layerBuf = await compositeAnnouncement(singleVariant, assets, texts, { showReferenceLayers: false })
    if (opacity < 1) layerBuf = await applyOpacity(layerBuf, opacity)
    compositeOps.push({ input: layerBuf, left: 0, top: dy })
  }
  if (!compositeOps.length) return base
  // Start from the static layers (no animation), then add animated layers on top
  const staticVariant = { ...variant, layers: variant.layers.filter(l => !('animation' in l && l.animation)) }
  const staticBase = await compositeAnnouncement(staticVariant, assets, texts, { showReferenceLayers: false })
  return sharp(staticBase).composite(compositeOps).png().toBuffer()
}
