// Pure, dependency-free logic for defaulting a legacy (pre-Phase-C-v5)
// TextLayer's missing width/height/max_lines. Deliberately split out of
// composite.ts, which imports sharp + @napi-rs/canvas (native, server-
// only) — this needs to be safely importable from the 'use client' variant
// editor (app/admin/events/[id]/creative-templates/admin/page.tsx) too, so
// the editor can show a sane default box the instant an old variant loads,
// not just at render time on the server. See composite.ts's
// withTextLayerDefaults() doc comment (re-exported from here) for the full
// rationale on why this defaulting exists and where it's called from.
import type { TextLayer } from '@/app/lib/announcements/composite'

// Fields a TextLayer might be missing if it predates Phase C v5 (JSONB, no
// discrete rows to run a one-time SQL migration against) — width/height/
// max_lines didn't exist, x/y meant a baseline point rather than a box's
// top-left corner.
export type LegacyTextLayer = Omit<TextLayer, 'width' | 'height' | 'max_lines'> & Partial<Pick<TextLayer, 'width' | 'height' | 'max_lines'>>

export const DEFAULT_MAX_LINES: Record<TextLayer['field'], number> = { name: 3, title: 2, company: 2, country: 1, tier: 2, custom: 2 }
const DEFAULT_LINE_HEIGHT_RATIO = 1.2
const DEFAULT_BOX_WIDTH_RATIO = 0.4 // of canvas width — a reasonable starting guess for a migrated layer, not a design decision

export function withTextLayerDefaults(layer: LegacyTextLayer, canvas: { width: number; height: number }): TextLayer {
  if (layer.width !== undefined && layer.height !== undefined && layer.max_lines !== undefined) {
    return layer as TextLayer
  }

  const maxLines = layer.max_lines ?? DEFAULT_MAX_LINES[layer.field] ?? 2
  const width = layer.width ?? Math.round(canvas.width * DEFAULT_BOX_WIDTH_RATIO)
  const lineHeight = layer.font_size * DEFAULT_LINE_HEIGHT_RATIO
  const height = layer.height ?? Math.round(maxLines * lineHeight)

  if (layer.width !== undefined && layer.height !== undefined) {
    return { ...layer, width: layer.width, height: layer.height, max_lines: maxLines }
  }

  // The old x/y was an SVG baseline POINT (not a box corner), positioned
  // via text-anchor per `align` — derive a plausible box anchored at that
  // same point: left/center/right per the old align, vertically shifted up
  // by an approximate ascent (0.8× font size — not exact per-font metrics,
  // but old rendering was single-line so there's no more precise answer
  // available from the stored data alone). Best-effort, not guaranteed
  // pixel-identical to the old single-line look — real production variants
  // should be spot-checked after this ships.
  const approxAscent = layer.font_size * 0.8
  let x = layer.x
  if (layer.align === 'center') x = layer.x - width / 2
  else if (layer.align === 'right') x = layer.x - width
  const y = layer.y - approxAscent

  return { ...layer, x, y, width, height, max_lines: maxLines }
}
