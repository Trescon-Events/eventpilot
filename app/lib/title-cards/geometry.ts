import { createHash } from 'node:crypto'
import type { SpeakerGridLayer } from '@/app/lib/announcements/composite'

/* Title card geometry — pure, unit-testable. Mirrors the thumbnail geometry pattern. */

export const TITLE_CARD_W = 1920
export const TITLE_CARD_H = 1080

export type GridArea = Pick<SpeakerGridLayer, 'x' | 'y' | 'width' | 'height' | 'columns' | 'max_rows' | 'gap_x' | 'gap_y' | 'card_min_width' | 'card_max_width'>

/** Optimal column count: for 1-2 speakers use exactly that many; for 3+ use the minimum needed to fill max_rows.
 *  This gives 2+1 for 3 speakers, 2+2 for 4, 3+2 for 5, 3+3 for 6 — maximising card size. */
function optimalColumns(n: number, maxCols: number, maxRows: number): number {
  if (n <= 2) return Math.min(Math.max(1, n), maxCols)
  return Math.min(maxCols, Math.ceil(n / maxRows))
}

/** How many rows and columns given n speakers and the grid spec. Respects max_rows and columns. */
export function gridLayout(n: number, area: GridArea): { rows: number; cols: number[] } {
  const count = Math.max(1, n)
  const useCols = optimalColumns(count, area.columns, area.max_rows)
  const rows = Math.min(area.max_rows, Math.ceil(count / useCols))
  // Fill rows evenly: first row gets the remainder (5 speakers = 3 + 2 for 2 rows of 3)
  const perRow = Math.ceil(count / rows)
  const cols: number[] = []
  let left = count
  for (let r = 0; r < rows; r++) { const c = Math.min(perRow, left); cols.push(c); left -= c }
  return { rows, cols }
}

/** Card size for n cards given the grid spec.
 *  Cards fill the grid area completely — width divided by column count, height divided by row count.
 *  No aspect-ratio constraint on the card itself; the photo inside self-clips to a square. */
export function gridCardSize(n: number, area: GridArea, _aspect: number): { width: number; height: number } {
  const { rows, cols } = gridLayout(n, area)
  const maxCols = Math.max(...cols)
  const width  = Math.max(area.card_min_width, Math.floor((area.width  - area.gap_x * Math.max(0, maxCols - 1)) / maxCols))
  const height = Math.max(1,                   Math.floor((area.height - area.gap_y * Math.max(0, rows    - 1)) / rows))
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
