// Platform-level font library (SAE Phase C v4) — not event-scoped. A font
// uploaded or fetched once here is selectable from any text layer's Font
// Family dropdown in any event's Creative Templates editor.
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { resolveCanonicalFamilyName } from '@/app/lib/branding/google-fonts-catalog'

export const STANDARD_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const

export type FetchedFontFiles = {
  weights: Record<number, Buffer> // whichever of STANDARD_WEIGHTS this family genuinely has as a distinct file
}

// Google's css2 API sometimes returns one @font-face rule per weight
// (a modern-browser response, no subsetting) and sometimes several blocks
// per weight split by unicode subset (devanagari, latin-ext, latin...) —
// varies by request headers, confirmed empirically. Prefer a block whose
// unicode-range includes the base Latin subset (U+0000-00FF); if no block
// declares a unicode-range at all, it's an unsubsetted response and the
// one match for that weight is exactly what we want.
function extractLatinFontUrl(css: string, weight: number): string | null {
  const blocks = css.split('@font-face').slice(1).map(b => `@font-face${b}`)
  const forWeight = blocks.filter(b => {
    const weightMatch = b.match(/font-weight:\s*(\d+)/)
    return weightMatch && Number(weightMatch[1]) === weight
  })

  const latinBlock = forWeight.find(b => {
    const rangeMatch = b.match(/unicode-range:\s*([^;]+);/)
    return rangeMatch && rangeMatch[1].includes('U+0000-00FF')
  })
  const unsubsettedBlock = forWeight.find(b => !b.includes('unicode-range'))
  const chosen = latinBlock ?? unsubsettedBlock ?? forWeight[0]
  if (!chosen) return null

  const urlMatch = chosen.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)
  return urlMatch ? urlMatch[1] : null
}

// 2026-08-04 — full weight support (was hardcoded to 400+700 only), per
// Madhu: "for most of our google fonts or custom fonts we also use font
// weight option too." Real technical blocker found and worked around live:
// Google's css2 API serves almost its entire catalog as ONE variable-font
// file for every weight when asked with a modern User-Agent — confirmed
// directly (5 different weight requests for Space Grotesk all resolved to
// the identical gstatic URL). Requesting with an OLD Android User-Agent
// (pre-variable-font browser support) forces Google to serve genuinely
// distinct static per-weight files instead — confirmed via SHA-256 (5
// different hashes, 5 different byte lengths) for the same family. This is
// the standard, widely-documented technique for pulling static Google Font
// weights rather than a single variable file.
const LEGACY_USER_AGENT = 'Mozilla/5.0 (Linux; U; Android 4.4.2; en-US; SM-G900F) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36'

export async function fetchGoogleFontFiles(googleFontFamily: string): Promise<FetchedFontFiles> {
  // Google's css2 API requires the exact canonical family-name casing
  // ("Space Grotesk", not "space grotesk") and 400s otherwise — confirmed
  // empirically (Madhu hit this live, 2026-07-27). Resolve through the
  // catalog first so typed-in-any-case names still work; falls back to the
  // literal input if the catalog has no match, so Google's own error still
  // surfaces for genuinely-nonexistent font names rather than being masked.
  const canonicalFamily = await resolveCanonicalFamilyName(googleFontFamily)
  const weightQuery = STANDARD_WEIGHTS.join(';')
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(canonicalFamily)}:wght@${weightQuery}&display=swap`,
    { headers: { 'User-Agent': LEGACY_USER_AGENT } }
  )
  if (!cssRes.ok) throw new Error(`Google Fonts family "${googleFontFamily}" not found (${cssRes.status})`)
  const css = await cssRes.text()

  // Extract whichever weights the family actually has (Google only ever
  // returns @font-face blocks for weights that genuinely exist — confirmed
  // empirically: a family with only 300-700 requested against the full
  // 100-900 range came back with exactly those 5, nothing padded/repeated
  // for the missing ones).
  const urlsByWeight = new Map<number, string>()
  for (const w of STANDARD_WEIGHTS) {
    const url = extractLatinFontUrl(css, w)
    if (url) urlsByWeight.set(w, url)
  }
  if (urlsByWeight.size === 0) throw new Error(`Could not find any weight for "${googleFontFamily}"`)
  if (!urlsByWeight.has(400)) throw new Error(`Could not find a regular (400) weight for "${googleFontFamily}"`)

  // Defense in depth against the exact variable-font trap this whole
  // function works around — even with the legacy UA, dedupe by content so
  // a family that (for whatever reason) still returns the same bytes for
  // two "different" weights only ever gets ONE of them stored as available,
  // never two entries that would silently render identically.
  const weights: Record<number, Buffer> = {}
  const seenBuffers: Buffer[] = []
  for (const [weight, url] of urlsByWeight) {
    const res = await fetch(url)
    if (!res.ok) continue
    const buffer = Buffer.from(await res.arrayBuffer())
    if (seenBuffers.some(b => b.equals(buffer))) continue
    seenBuffers.push(buffer)
    weights[weight] = buffer
  }
  if (!weights[400]) throw new Error(`Regular (400) weight for "${googleFontFamily}" failed to download`)

  return { weights }
}

// Picks the closest available weight to a target — same "nearest match"
// principle CSS itself uses when an exact font-weight isn't available.
export function closestAvailableWeight(weights: Record<number, string> | undefined, target: number): number | null {
  if (!weights) return null
  const available = Object.keys(weights).map(Number)
  if (available.length === 0) return null
  return available.reduce((best, w) => Math.abs(w - target) < Math.abs(best - target) ? w : best, available[0])
}

export async function storeFontFiles(
  fontId: string,
  files: FetchedFontFiles
): Promise<{ regular_url: string; bold_url: string | null; weights: Record<number, string> }> {
  const urlByWeight: Record<number, string> = {}
  for (const [weightStr, buffer] of Object.entries(files.weights)) {
    const weight = Number(weightStr)
    urlByWeight[weight] = await uploadPublicAsset(`branding/fonts/${fontId}/${weight}.woff2`, buffer, 'font/woff2')
  }

  // regular_url/bold_url kept in sync for every consumer that still reads
  // them directly (older saved text layers denormalize these two fields
  // only, at variant-save time — see TextLayerFont in composite.ts) —
  // nearest-available-weight fallback rather than a hard 400/700
  // requirement, same principle as closestAvailableWeight() above.
  const regularWeight = urlByWeight[400] ? 400 : closestAvailableWeight(urlByWeight, 400)!
  const boldWeight = urlByWeight[700] ? 700 : closestAvailableWeight(urlByWeight, 700)

  return {
    regular_url: urlByWeight[regularWeight],
    bold_url: boldWeight !== null ? urlByWeight[boldWeight] : null,
    weights: urlByWeight,
  }
}
