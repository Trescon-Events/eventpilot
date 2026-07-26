// Platform-level font library (SAE Phase C v4) — not event-scoped. A font
// uploaded or fetched once here is selectable from any text layer's Font
// Family dropdown in any event's Creative Templates editor.
import { uploadPublicAsset } from '@/app/lib/events/storage'

export type FetchedFontFiles = {
  regularBuffer: Buffer
  boldBuffer: Buffer | null
}

// Google Fonts' CSS2 API sometimes returns one @font-face rule per weight
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

export async function fetchGoogleFontFiles(googleFontFamily: string): Promise<FetchedFontFiles> {
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(googleFontFamily)}:wght@400;700&display=swap`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }
  )
  if (!cssRes.ok) throw new Error(`Google Fonts family "${googleFontFamily}" not found (${cssRes.status})`)
  const css = await cssRes.text()

  const regularUrl = extractLatinFontUrl(css, 400)
  if (!regularUrl) throw new Error(`Could not find a regular (400) weight for "${googleFontFamily}"`)
  const boldUrl = extractLatinFontUrl(css, 700)

  const regularRes = await fetch(regularUrl)
  if (!regularRes.ok) throw new Error(`Failed to download regular font file: ${regularRes.status}`)
  const regularBuffer = Buffer.from(await regularRes.arrayBuffer())

  let boldBuffer: Buffer | null = null
  if (boldUrl) {
    const boldRes = await fetch(boldUrl)
    if (boldRes.ok) boldBuffer = Buffer.from(await boldRes.arrayBuffer())
  }

  return { regularBuffer, boldBuffer }
}

export async function storeFontFiles(
  fontId: string,
  files: FetchedFontFiles
): Promise<{ regular_url: string; bold_url: string | null }> {
  const regular_url = await uploadPublicAsset(`branding/fonts/${fontId}/regular.woff2`, files.regularBuffer, 'font/woff2')
  const bold_url = files.boldBuffer
    ? await uploadPublicAsset(`branding/fonts/${fontId}/bold.woff2`, files.boldBuffer, 'font/woff2')
    : null
  return { regular_url, bold_url }
}
