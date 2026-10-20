// Retry for outbound calls that fail on the network ("fetch failed") or with a 5xx/429 (2026-10-20: a speaker's Full Bio upload
// died on a one-off "fetch failed" from the CloudConvert call). Gives up after `attempts` and throws a message that names the
// service and the underlying cause (ENOTFOUND, ECONNRESET, ...) instead of Node's bare "fetch failed".
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function describeNetworkError(e: unknown): string {
  const cause = (e as { cause?: { code?: string; message?: string } } | null)?.cause
  return cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e))
}

export async function fetchWithRetry(url: string, init: RequestInit | undefined, label: string, attempts = 3): Promise<Response> {
  let last: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, init)
      if ((res.status >= 500 || res.status === 429) && i < attempts) { last = new Error(`HTTP ${res.status}`); await sleep(700 * i); continue }
      return res
    } catch (e) {
      last = e
      if (i < attempts) await sleep(700 * i)
    }
  }
  console.error(`[net] ${label} failed after ${attempts} attempts:`, last, (last as { cause?: unknown })?.cause)
  throw new Error(`${label} could not be reached (${describeNetworkError(last)})`)
}

export async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 1; i <= attempts; i++) {
    try { return await fn() } catch (e) {
      last = e
      if ((e as { permanent?: boolean })?.permanent) break // a real rejection fails the same way again
      if (i < attempts) await sleep(700 * i)
    }
  }
  console.error(`[net] ${label} failed:`, last)
  throw last instanceof Error ? last : new Error(String(last))
}
