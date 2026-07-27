// Google Fonts' full family catalog — powers the Font Library's live
// search-as-you-type dropdown and fixes a real bug: Google's css2
// stylesheet API (used by fetchGoogleFontFiles in ./fonts.ts) requires the
// EXACT canonical family name casing ("Space Grotesk", not "space grotesk"
// or "Space grotesk") and 400s otherwise — confirmed empirically. Selecting
// from this catalog (or resolving through it before fetching) means a user
// typing free text in any case still finds their font, matching how
// fonts.google.com's own picker behaves.
//
// Source: https://fonts.google.com/metadata/fonts — the same public,
// unauthenticated endpoint fonts.google.com's own web app calls for its
// search box. Not Google's officially-documented Web Fonts Developer API
// (that one needs an API key); this one needs none. ~1,942 families,
// ~2.7MB — fetched once and cached in-process rather than per-request.

export type GoogleFontEntry = { family: string; category: string }

const CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12h — the catalog changes rarely; staleness just means a brand-new font isn't found for a few hours
let cache: { entries: GoogleFontEntry[]; fetchedAt: number } | null = null

async function loadCatalog(): Promise<GoogleFontEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.entries

  const res = await fetch('https://fonts.google.com/metadata/fonts')
  if (!res.ok) {
    // Serve stale cache rather than fail outright if Google's metadata
    // endpoint is briefly unavailable but we have a previous fetch.
    if (cache) return cache.entries
    throw new Error(`Could not load the Google Fonts catalog (${res.status})`)
  }
  const data = await res.json() as { familyMetadataList: GoogleFontEntry[] }
  const entries = data.familyMetadataList.map(f => ({ family: f.family, category: f.category }))
  cache = { entries, fetchedAt: Date.now() }
  return entries
}

/** Case-insensitive substring match, family-name-startsWith ranked first — mirrors fonts.google.com's own search box ordering. Empty query returns nothing (the dropdown shouldn't show 1,942 rows). */
export async function searchGoogleFonts(query: string, limit = 20): Promise<GoogleFontEntry[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const entries = await loadCatalog()
  const starts = entries.filter(e => e.family.toLowerCase().startsWith(q))
  const contains = entries.filter(e => !e.family.toLowerCase().startsWith(q) && e.family.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, limit)
}

/** Resolves free-typed text to the canonical family-name casing Google's css2 API requires, via an exact case-insensitive match. Returns the input unchanged if no match is found — the caller (fetchGoogleFontFiles) still attempts the fetch and surfaces Google's own error, rather than silently swallowing a genuinely-nonexistent font name. */
export async function resolveCanonicalFamilyName(name: string): Promise<string> {
  const entries = await loadCatalog()
  const match = entries.find(e => e.family.toLowerCase() === name.trim().toLowerCase())
  return match?.family ?? name
}
