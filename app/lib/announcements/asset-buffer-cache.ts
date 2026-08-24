// Shared URL-keyed fetch cache for creative-compositing assets (SAE
// variant-maker speed pass, 2026-07-31) — mirrors the font-buffer cache
// pattern already used in composite.ts, generalized so the variant
// editor's live preview (repeatedly re-fetching the same handful of
// background-art/photo/logo URLs while an MM iterates on a layout) doesn't
// pay a fresh network fetch every time.
//
// Safe with zero invalidation logic: every upload route in this app
// already mints a new timestamped URL on re-upload (e.g.
// `photo-processed-${Date.now()}.png`), so a re-upload is never a cache
// hit against stale content — the OLD url simply stops being requested,
// the new url is a fresh cache miss.
//
// Capped (simple LRU via Map's insertion-order iteration) since image/
// photo buffers are meaningfully larger than font buffers — an unbounded
// cache here in a long-lived server process is a real memory risk in a
// way the font cache isn't.
const MAX_ENTRIES = 40

const cache = new Map<string, Promise<Buffer | null>>()

// Bounded (2026-08-24) — this fetch previously had no timeout at all. It's
// one of two calls (alongside the Gemini post-copy call it runs alongside
// via Promise.all in announcements/generate/route.ts) that decide the
// route's total wall time, and the route is proxied through a Cloudflare
// Worker in front of production that kills any single request around
// ~100s. A stalled external photo/logo URL (slow host, dead redirect)
// could otherwise hang the whole generate indefinitely instead of failing
// fast into the route's existing "continue without a creative" fallback.
const ASSET_FETCH_TIMEOUT_MS = 30_000

async function fetchUncached(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ASSET_FETCH_TIMEOUT_MS) })
  if (!res.ok) return null
  // A 200 response isn't necessarily the image — an expired/broken signed
  // URL (seen in the wild: a HubSpot-hosted photo whose signed-url-
  // redirect had lapsed) can still return 200 with an HTML error page.
  // Caching that as "the image" makes every consumer's own error handling
  // useless: sharp fails to decode it downstream, however that failure is
  // handled there, instead of this being a normal "photo unavailable, fall
  // back" case at the one place that actually knows the fetch was bad.
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) return null
  return Buffer.from(await res.arrayBuffer())
}

export function fetchAssetBuffer(url: string): Promise<Buffer | null> {
  const cached = cache.get(url)
  if (cached) {
    // Re-insert to mark as most-recently-used (Map iterates in insertion
    // order, so this is enough to implement LRU eviction below).
    cache.delete(url)
    cache.set(url, cached)
    return cached
  }

  const promise = fetchUncached(url).catch(() => null)
  cache.set(url, promise)

  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }

  return promise
}
