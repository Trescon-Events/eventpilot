// CloudConvert client (Clean Logo Base generator, 2026-07-28) — the one
// external-API dependency in the Logo Engine, isolated in its own module
// (mirroring speaker-photo-engine.ts's PhotoRoom pattern: null-on-failure/
// unset-key, never throws) so app/lib/media/logo-engine.ts doesn't need to
// know HTTP/polling details.
//
// EPS is arbitrary PostScript, not a fixed page-description structure like
// PDF/PSD — there's no viable pure-JS rasterizer for it (confirmed via
// research before choosing this path). Real EPS→raster always goes through
// Ghostscript, a system binary this Railway/Nixpacks deploy doesn't have
// (no Dockerfile). CloudConvert wraps Ghostscript as a hosted API with a
// real free tier — chosen per Madhu's explicit priority order (free API
// first, a custom Ghostscript build second, a paid API third).
//
// Synchronous polling (not a webhook) is the right shape here: this app
// runs `next start` as a long-lived Railway process, not a serverless
// function with a timeout constraint, and EPS uploads are expected to be
// rare/occasional — standing up a public webhook receiver + signature
// verification for a low-volume, occasional-upload code path isn't worth
// it. Mirrors the existing synchronous PhotoRoom fetch-and-wait pattern.
const CLOUDCONVERT_API_BASE = 'https://api.cloudconvert.com/v2'
const POLL_INTERVAL_MS = 1500
const MAX_POLL_ATTEMPTS = 50 // ~75s ceiling

type CloudConvertTask = {
  id: string
  name: string
  operation: string
  status: 'waiting' | 'processing' | 'finished' | 'error'
  result?: { form?: { url: string; parameters: Record<string, string> }; files?: Array<{ url: string; filename: string }> }
  message?: string
}
type CloudConvertJob = { id: string; status: string; tasks: CloudConvertTask[] }

async function cloudConvertRequest<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOUDCONVERT_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`CloudConvert ${path} failed: ${res.status} ${await res.text().catch(() => '')}`)
  const body = await res.json()
  return (body.data ?? body) as T
}

/** EPS -> PNG via CloudConvert's Jobs API. Returns null (never throws) on any failure — missing key, job error, or timeout — so the caller can fall back gracefully. EPS is the one format where that raw-as-fallback is a genuinely bad experience (browsers can't render EPS at all), so callers should surface a distinct error state rather than silently accepting the null. */
export async function convertEpsToPng(buffer: Buffer): Promise<Buffer | null> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY
  if (!apiKey) return null // no-ops gracefully if unset, matches the PhotoRoom/speaker-photo-engine precedent

  try {
    const job = await cloudConvertRequest<CloudConvertJob>(apiKey, '/jobs', {
      method: 'POST',
      body: JSON.stringify({
        tasks: {
          'import-eps': { operation: 'import/upload' },
          'convert-eps': { operation: 'convert', input: 'import-eps', input_format: 'eps', output_format: 'png' },
          'export-png': { operation: 'export/url', input: 'convert-eps' },
        },
      }),
    })

    const importTask = job.tasks.find(t => t.name === 'import-eps')
    const uploadForm = importTask?.result?.form
    if (!uploadForm) throw new Error('CloudConvert did not return an upload target')

    const formData = new FormData()
    for (const [key, value] of Object.entries(uploadForm.parameters)) formData.append(key, value)
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/postscript' }), 'logo.eps')
    const uploadRes = await fetch(uploadForm.url, { method: 'POST', body: formData })
    if (!uploadRes.ok) throw new Error(`CloudConvert file upload failed: ${uploadRes.status}`)

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      const polled = await cloudConvertRequest<CloudConvertJob>(apiKey, `/jobs/${job.id}`)
      if (polled.status === 'error') {
        const failedTask = polled.tasks.find(t => t.status === 'error')
        throw new Error(`CloudConvert job failed: ${failedTask?.message ?? 'unknown error'}`)
      }
      if (polled.status === 'finished') {
        const exportTask = polled.tasks.find(t => t.name === 'export-png')
        const fileUrl = exportTask?.result?.files?.[0]?.url
        if (!fileUrl) throw new Error('CloudConvert job finished but no output file was returned')
        const fileRes = await fetch(fileUrl)
        if (!fileRes.ok) throw new Error(`Failed to download CloudConvert output: ${fileRes.status}`)
        return Buffer.from(await fileRes.arrayBuffer())
      }
    }
    throw new Error(`CloudConvert job did not finish within ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`)
  } catch (e) {
    console.error('EPS conversion via CloudConvert failed:', e)
    return null
  }
}
