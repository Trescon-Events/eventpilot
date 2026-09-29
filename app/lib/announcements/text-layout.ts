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
  fontWeight?: number // 100-900, 2026-08-04 (was 'normal'|'bold') — see composite.ts's resolveFontWeight()
  fontFamily?: string       // must already be registered with GlobalFonts if custom
  // 2026-09-22 — when false, skip the shrink loop entirely: font_size is
  // pinned at the ceiling and text only ever wraps to more lines, never
  // gets visually smaller. Text that still doesn't fit maxLines/height at
  // that pinned size falls straight to ellipsis-truncation. Default true
  // (every existing caller keeps today's shrink-then-truncate behavior).
  allowShrink?: boolean
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
// Absolute shrink limit once the normal floor is passed (see wrapAndFit's last resorts).
const HARD_MIN_RATIO = 0.4

function measure(text: string, size: number, weight: number, family: string): number {
  measureCtx.font = `${weight} ${size}px ${family}`
  return measureCtx.measureText(text).width
}

// Natural break characters (2026-09-27) — real bug found live: "Shariah-
// compliant" got ellipsis-truncated mid-word ("SHARIAH-COMP…") even though
// its box had two whole lines of budget to spare, because the old
// greedyWordWrap treated any whitespace-delimited token as atomic and only
// had one fallback for "too wide to fit" — cut it and append "…". A
// hyphenated compound word already has a grammatically correct break point;
// this list is deliberately extensible (e.g. '/' for "and/or", "24/7")
// rather than hardcoded to just '-', so a future text type with its own
// natural break character doesn't need new wrapping logic, just an addition
// here.
const NATURAL_BREAK_CHARS = ['-', '/']

// Breaks a single token too wide to fit boxWidth on its own into fragments
// that each fit (except possibly a final one handed back to the caller to
// keep trying to combine with subsequent words — see greedyWordWrap).
// Prefers splitting at an existing natural break character (kept with the
// preceding fragment, standard hyphenation convention — no bare leading
// hyphen on the continuation line); falls back to inserting a hyphen at a
// measured-safe character boundary via the same bisection approach
// the old ellipsis fallback used, only now continuing onto a new
// line instead of appending "…" and stopping. This is why a genuinely
// unbreakable token (a URL, a long number) still degrades gracefully:
// real glyph widths from measureCtx.measureText() make the cut point exact
// regardless of the text's script or content, not just for English prose.
function splitOverlongWord(word: string, boxWidth: number, size: number, weight: number, family: string): string[] {
  if (measure(word, size, weight, family) <= boxWidth) return [word]

  for (const breakChar of NATURAL_BREAK_CHARS) {
    let bestSplit = -1
    let searchFrom = 0
    while (true) {
      const idx = word.indexOf(breakChar, searchFrom)
      if (idx === -1) break
      // Prefixes only grow as idx increases, so the first one that doesn't
      // fit means every later one won't either — stop scanning this char.
      if (measure(word.slice(0, idx + 1), size, weight, family) <= boxWidth) {
        bestSplit = idx
        searchFrom = idx + 1
      } else break
    }
    if (bestSplit >= 0 && bestSplit + 1 < word.length) {
      const first = word.slice(0, bestSplit + 1) // keeps the break char itself
      const rest = word.slice(bestSplit + 1)
      return [first, ...splitOverlongWord(rest, boxWidth, size, weight, family)]
    }
  }

  // No usable natural break char (or the box is too narrow for even the
  // first fragment) — bisect by real glyph width, same approach as
  // the old ellipsis fallback, inserting our own hyphen and continuing to a new
  // line rather than stopping with an ellipsis.
  let lo = 1
  let hi = word.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = word.slice(0, mid) + '-'
    if (measure(candidate, size, weight, family) <= boxWidth) lo = mid
    else hi = mid - 1
  }
  const cut = Math.max(1, lo) // always consume at least 1 char so recursion terminates
  const first = word.slice(0, cut) + '-'
  const rest = word.slice(cut)
  if (!rest) return [word]
  return [first, ...splitOverlongWord(rest, boxWidth, size, weight, family)]
}

function greedyWordWrap(text: string, boxWidth: number, size: number, weight: number, family: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (measure(candidate, size, weight, family) <= boxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    if (measure(word, size, weight, family) <= boxWidth) {
      current = word
      continue
    }
    // `word` alone is still wider than boxWidth even on its own fresh line
    // (e.g. "Shariah-compliant") — break it into fragments instead of
    // deferring to ellipsis-truncation later. Every fragment but the last
    // already fits and becomes its own line; the last fragment keeps
    // trying to combine with whatever word comes next, same as normal
    // greedy wrapping.
    const fragments = splitOverlongWord(word, boxWidth, size, weight, family)
    for (let i = 0; i < fragments.length - 1; i++) lines.push(fragments[i])
    current = fragments[fragments.length - 1]
  }
  if (current) lines.push(current)
  return lines
}

export function wrapAndFit(text: string, opts: WrapAndFitOptions): WrapAndFitResult {
  const { width, height, maxLines, fontSize, fontWeight = 400, fontFamily = 'sans-serif', allowShrink = true } = opts
  const trimmed = text.trim()
  if (!trimmed) return { lines: [], fontSize, lineHeight: fontSize * LINE_HEIGHT_RATIO, didShrink: false, didTruncate: false }

  const floor = allowShrink ? Math.max(1, Math.round(fontSize * SHRINK_FLOOR_RATIO)) : fontSize
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

  // Never ellipsis-truncate (2026-09-30, Madhu: a headline must never lose words to "…" — seen on
  // FSF's headline_full layer: pinned font size + max_lines 3 dropped the tail of a long headline).
  // "Never shrink" layers keep their size exactly: every word is shown, wrapping onto as many
  // lines as it takes (an overlong single word breaks at a hyphen/safe point and continues on the
  // next line — see splitOverlongWord), even past max_lines / the box's bottom edge. didTruncate
  // then means "overflows its box" so the editor tells the producer to enlarge the box.
  if (!allowShrink) {
    const all = greedyWordWrap(trimmed, width, fontSize, fontWeight, fontFamily)
    return { lines: all.length ? all : [trimmed], fontSize, lineHeight: fontSize * LINE_HEIGHT_RATIO, didShrink: false, didTruncate: true }
  }
  // Layers that ARE allowed to shrink: keep shrinking past the normal floor, down to a hard
  // minimum (a smaller headline beats a cut-off one). Honors maxLines/height.
  const hardMin = Math.max(10, Math.round(fontSize * HARD_MIN_RATIO))
  for (let s2 = Math.min(size, floor) - SHRINK_STEP; s2 >= hardMin; s2 -= SHRINK_STEP) {
    const lh = s2 * LINE_HEIGHT_RATIO
    const w2 = greedyWordWrap(trimmed, width, s2, fontWeight, fontFamily)
    if (w2.length <= maxLines && w2.length * lh <= height && w2.every(l => measure(l, s2, fontWeight, fontFamily) <= width)) {
      return { lines: w2, fontSize: s2, lineHeight: lh, didShrink: true, didTruncate: false }
    }
  }
  // Last resort 2: even the hard minimum doesn't fit the box — render ALL the text at that size and
  // let it run past the box rather than drop words. didTruncate now means "overflows its box" so the
  // editor still warns the producer to enlarge the box or shorten the text.
  const lineHeight = hardMin * LINE_HEIGHT_RATIO
  const allLines = greedyWordWrap(trimmed, width, hardMin, fontWeight, fontFamily)
  return { lines: allLines.length ? allLines : [trimmed], fontSize: hardMin, lineHeight, didShrink: true, didTruncate: true }
}
