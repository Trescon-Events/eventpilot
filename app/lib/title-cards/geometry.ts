import { createHash } from 'node:crypto'
import type { SpeakerGridLayer } from '@/app/lib/announcements/composite'

/* Title card geometry — pure, unit-testable. Mirrors the thumbnail geometry pattern. */

export const TITLE_CARD_W = 1920
export const TITLE_CARD_H = 1080

export type GridArea = Pick<SpeakerGridLayer, 'x' | 'y' | 'width' | 'height' | 'columns' | 'max_rows' | 'gap_x' | 'gap_y' | 'card_min_width' | 'card_max_width'>

/** How many rows and columns given n speakers and the grid spec. Respects max_rows and columns. */
export function gridLayout(n: number, area: GridArea): { rows: number; cols: number[] } {
  const count = Math.max(1, n)
  const maxCols = Math.min(area.columns, count)
  const rows = Math.min(area.max_rows, Math.ceil(count / maxCols))
  // Fill rows evenly: first row gets the remainder (5 speakers = 3 + 2 for 2 rows of 3)
  const perRow = Math.ceil(count / rows)
  const cols: number[] = []
  let left = count
  for (let r = 0; r < rows; r++) { const c = Math.min(perRow, left); cols.push(c); left -= c }
  return { rows, cols }
}

/** Card size for n cards given the grid spec. Fits width within max_card_width and height within area. aspect = card h/w. */
export function gridCardSize(n: number, area: GridArea, aspect: number): { width: number; height: number } {
  const { rows, cols } = gridLayout(n, area)
  const maxCols = Math.max(...cols)
  let width = Math.min(area.card_max_width, (area.width - area.gap_x * (maxCols - 1)) / maxCols)
  let height = width * aspect
  const totalH = rows * height + Math.max(0, rows - 1) * area.gap_y
  if (totalH > area.height) { height = (area.height - Math.max(0, rows - 1) * area.gap_y) / rows; width = height / aspect }
  width = Math.max(area.card_min_width, Math.floor(width))
  height = Math.max(1, Math.floor(width * aspect))
  return { width, height }
}

/** Top-left of every card in reading order. Each row is left-aligned per spec (DFS previews). */
export function gridCardPositions(n: number, size: { width: number; height: number }, area: GridArea): { x: number; y: number }[] {
  const { cols } = gridLayout(n, area)
  const positions: { x: number; y: number }[] = []
  let cardIdx = 0
  let rowY = area.y
  for (const colCount of cols) {
    for (let c = 0; c < colCount; c++) {
      positions.push({ x: Math.round(area.x + c * (size.width + area.gap_x)), y: Math.round(rowY) })
      cardIdx++
    }
    rowY += size.height + area.gap_y
  }
  return positions.slice(0, n)
}

export const speakerGridOf = (layers: { type: string }[]): SpeakerGridLayer | null =>
  (layers.find((l): l is SpeakerGridLayer => l.type === 'speaker_grid') ?? null)

export function titleCardFingerprint(input: unknown): string {
  return createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16)
}
