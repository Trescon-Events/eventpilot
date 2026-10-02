// Client-side: finds where the real artwork sits inside an image layer, so the layer editor can snap text boxes to the
// edges/centres of logos, panels and other design elements (not just the layer's full-canvas box). Works for transparent
// art (alpha) and for art on an opaque background (white or any flat colour — the background is read from the corners).
export type ContentRuns = { xs: Array<[number, number]>; ys: Array<[number, number]> } // [start, end] as 0..1 fractions of the image

const cache = new Map<string, Promise<ContentRuns | null>>()
const WORK = 400, MIN_PIXELS = 2, MERGE_GAP = 0.015, COLOUR_DIST = 18, ALPHA_MIN = 40

function runsOf(counts: number[], size: number): Array<[number, number]> {
  const runs: Array<[number, number]> = []
  let start = -1, last = -1
  for (let i = 0; i < size; i++) {
    if (counts[i] >= MIN_PIXELS) {
      if (start < 0) start = i
      else if ((i - last) / size > MERGE_GAP) { runs.push([start / size, (last + 1) / size]); start = i }
      last = i
    }
  }
  if (start >= 0) runs.push([start / size, (last + 1) / size])
  // a run covering (almost) the whole axis is just a full-bleed background, which the canvas edges already cover
  return runs.filter(([a, b]) => b - a < 0.97).slice(0, 24)
}

async function analyse(url: string): Promise<ContentRuns | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bmp = await createImageBitmap(await res.blob())
    const scale = Math.min(1, WORK / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bmp, 0, 0, w, h); bmp.close()
    const d = ctx.getImageData(0, 0, w, h).data
    const px = (x: number, y: number) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]] }
    const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)]
    const transparentBg = corners.every(p => p[3] < ALPHA_MIN)
    const bg = [0, 1, 2].map(k => corners.map(p => p[k]).sort((a, b) => a - b)[2]) // median-ish corner colour
    const cols = new Array(w).fill(0), rows = new Array(h).fill(0)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y)
      const on = transparentBg ? a >= ALPHA_MIN : a >= ALPHA_MIN && Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) > COLOUR_DIST
      if (on) { cols[x]++; rows[y]++ }
    }
    return { xs: runsOf(cols, w), ys: runsOf(rows, h) }
  } catch { return null }
}

export function getContentRuns(url: string): Promise<ContentRuns | null> {
  let p = cache.get(url)
  if (!p) { p = analyse(url); cache.set(url, p) }
  return p
}
