// Server-side word-wrap + auto-shrink for text layers (SAE Phase C v5,
// 2026-07-29). Split out from composite.ts deliberately — pure function,
// no Sharp/network dependency, so it can be spike-tested standalone
// (confirmed against real names, unbreakable long tokens, and empty/
// whitespace input before ever being wired into the Sharp pipeline).
//
// Uses @napi-rs/canvas's real ctx.measureText() for line-breaking — Sharp/
// SVG has no auto-wrap capability of its own, and there's no DOM here to
// measure with. The caller (composite.ts) is responsible for registering
// the actual font with @napi-rs/canvas's GlobalFonts before calling this,
// so measured widths match the glyphs actually rendered in the final SVG
// — measuring against a fallback system font would produce wrong wrap
// points whenever a custom brand font is set.
import { createCanvas } from '@napi-rs/canvas'

const measureCanvas = createCanvas(10, 10)
const measureCtx = measureCanvas.getContext('2d')

export type WrapAndFitOptions = {
  width: number
  height: number
  maxLines: number
  fontSize: number          // ceiling — actual returned fontSize may be smaller
  fontWeight?: 'normal' | 'bold'
  fontFamily?: string       // must already be registered with GlobalFonts if custom
}

export type WrapAndFitResult = {
  lines: string[]
  fontSize: number
  lineHeight: number
  didShrink: boolean
  didTruncate: boolean
}

const LINE_HEIGHT_RATIO = 1.2
// Madhu's confirmed floor (2026-07-29): shrink down to 60% of the
// configured font size, then ellipsis-truncate any further overflow
// rather than continuing to shrink to an unreadable size.
const SHRINK_FLOOR_RATIO = 0.6
const SHRINK_STEP = 1

function measure(text: string, size: number, weight: 'normal' | 'bold', family: string): number {
  measureCtx.font = `${weight === 'bold' ? 'bold ' : ''}${size}px ${family}`
  return measureCtx.measureText(text).width
}

function greedyWordWrap(text: string, boxWidth: number, size: number, weight: 'normal' | 'bold', family: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (measure(candidate, size, weight, family) <= boxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      // `word` alone may still be wider than boxWidth (an unbreakable long
      // token, e.g. a company name with no spaces) — start a new line with
      // it anyway; the caller's truncation step handles the over-wide case.
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

// forceEllipsis: append "…" even if `text` already fits within boxWidth
// unmodified — needed when a whole trailing line got dropped (maxLines
// cut it off) rather than this specific line itself being too wide; the
// visible last line still needs to signal that more text existed.
function truncateToWidth(text: string, boxWidth: number, size: number, weight: 'normal' | 'bold', family: string, forceEllipsis = false): string {
  const ellipsis = '…'
  if (!forceEllipsis && measure(text, size, weight, family) <= boxWidth) return text
  if (measure(text + ellipsis, size, weight, family) <= boxWidth) return text + ellipsis
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = text.slice(0, mid).trimEnd() + ellipsis
    if (measure(candidate, size, weight, family) <= boxWidth) lo = mid
    else hi = mid - 1
  }
  return (text.slice(0, lo).trimEnd() + ellipsis) || ellipsis
}

export function wrapAndFit(text: string, opts: WrapAndFitOptions): WrapAndFitResult {
  const { width, height, maxLines, fontSize, fontWeight = 'normal', fontFamily = 'sans-serif' } = opts
  const trimmed = text.trim()
  if (!trimmed) return { lines: [], fontSize, lineHeight: fontSize * LINE_HEIGHT_RATIO, didShrink: false, didTruncate: false }

  const floor = Math.max(1, Math.round(fontSize * SHRINK_FLOOR_RATIO))
  let size = fontSize

  while (size >= floor) {
    const lineHeight = size * LINE_HEIGHT_RATIO
    const wrapped = greedyWordWrap(trimmed, width, size, fontWeight, fontFamily)
    const fitsLineCount = wrapped.length <= maxLines
    const fitsHeight = wrapped.length * lineHeight <= height
    const fitsWidth = wrapped.every(l => measure(l, size, fontWeight, fontFamily) <= width)
    if (fitsLineCount && fitsHeight && fitsWidth) {
      return { lines: wrapped, fontSize: size, lineHeight, didShrink: size < fontSize, didTruncate: false }
    }
    size -= SHRINK_STEP
  }

  // Hit the floor without ever fitting — best-effort at floor size, capped
  // to maxLines. Two distinct truncation reasons, both marked with an
  // ellipsis: (a) whole trailing lines got dropped by the maxLines cap —
  // the last VISIBLE line gets a forced ellipsis even if its own text
  // already fits, since it's what signals more content existed; (b) a
  // single line (commonly an unbreakable long token) is itself still
  // wider than the box even alone — cut mid-word with an ellipsis.
  const lineHeight = floor * LINE_HEIGHT_RATIO
  const fullyWrapped = greedyWordWrap(trimmed, width, floor, fontWeight, fontFamily)
  let wrapped = fullyWrapped.slice(0, Math.max(1, maxLines))
  if (wrapped.length === 0) wrapped = [trimmed]
  const droppedTrailingLines = fullyWrapped.length > wrapped.length
  const lastIdx = wrapped.length - 1

  for (let i = 0; i < wrapped.length; i++) {
    const tooWide = measure(wrapped[i], floor, fontWeight, fontFamily) > width
    const isLastWithDroppedContent = i === lastIdx && droppedTrailingLines
    if (tooWide || isLastWithDroppedContent) {
      wrapped[i] = truncateToWidth(wrapped[i], width, floor, fontWeight, fontFamily, isLastWithDroppedContent)
    }
  }
  return { lines: wrapped, fontSize: floor, lineHeight, didShrink: true, didTruncate: true }
}
