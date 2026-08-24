/**
 * scanManager — module-level singleton for Market Intelligence scans.
 *
 * Lives OUTSIDE React components so scan loops survive client-side navigation.
 * Components subscribe, receive updates, and unsubscribe on unmount.
 *
 * Architecture:
 * - Multiple concurrent jobs (up to MAX_CONCURRENT_JOBS = 2)
 * - Each job scans its URLs sequentially
 * - Per-job pause / resume / cancel
 * - 3 retry attempts per URL before marking failed
 * - Credit tracking (gemini / firecrawl / jina) accumulated per job + session
 */

export type Speaker = {
  speaker_name: string
  job_title: string | null
  speaker_company: string | null
  speaker_company_url: string | null
  linkedin_url: string | null
  confidence: number
}

export type Participant = {
  company_name: string
  official_domain: string | null
  company_website: string | null
  company_linkedin_url: string | null
  description: string | null
  participant_type: string
  tier: string | null
  sponsorship_category: string | null
  confidence: number
  evidence: string[]
  extraction_method: string
  hq_location: string | null
  industry_sector: string | null
}

export type IntelResult = {
  scan_id: string | null
  event: { name: string; edition: string | null; industry: string; location: string; website: string; organizer: string | null }
  site_analysis: { site_type: string; rendering_model: string; commercial_structure: string; terminology_used: string[]; information_richness: string; pages_analyzed: number }
  participants: Participant[]
  speakers: Speaker[]
  intelligence_summary: string
  hypotheses_generated: { url: string; reasoning: string; confidence: number }[]
  hypotheses: { hypothesis: string; validated: boolean; finding: string }[]
  crawl_summary: { homepage_analyzed: boolean; sub_pages_fetched: number; total_links_discovered: number; total_participants_extracted: number; total_speakers_extracted: number }
  credits: { gemini: number; firecrawl: number; jina: number }
  partial_failures: { type: string; potential: number; extracted: number; reason: string }[]
}

export type UrlJob = {
  url: string
  status: 'pending' | 'running' | 'done' | 'failed'
  result: IntelResult | null
  error: string | null
  failureReason: 'network' | 'ai' | 'rate_limit' | 'timeout' | 'parse' | null
  attempts: number          // how many attempts were made (max 3)
  phase: string | null
}

export type JobCredits = {
  gemini: number
  firecrawl: number
  jina: number
}

export type JobBatch = {
  jobId: string             // DB market_intel_jobs.id
  eventId: string
  label: string
  urlJobs: UrlJob[]
  status: 'pending' | 'running' | 'paused' | 'cancelled' | 'complete'
  credits: JobCredits
  partialFailures: { url: string; type: string; reason: string }[]
  createdAt: string
  completedAt: string | null
}

export type SessionCredits = { gemini: number; firecrawl: number; jina: number }

export type ManagerState = {
  activeJobs: JobBatch[]
  sessionCredits: SessionCredits
}

type Listener = (state: ManagerState) => void

// ── Module-level state ────────────────────────────────────────────────────────
const MAX_CONCURRENT_JOBS = 2

const _activeJobs: Map<string, JobBatch> = new Map()
const _controls:   Map<string, { paused: boolean; cancelled: boolean }> = new Map()
const _listeners = new Set<Listener>()

const _sessionCredits: SessionCredits = { gemini: 0, firecrawl: 0, jina: 0 }

function _snapshot(): ManagerState {
  return {
    activeJobs: [..._activeJobs.values()].map(j => ({
      ...j,
      urlJobs: j.urlJobs.map(u => ({ ...u })),
      credits: { ...j.credits },
      partialFailures: [...j.partialFailures],
    })),
    sessionCredits: { ..._sessionCredits },
  }
}

function _notify() {
  const snap = _snapshot()
  _listeners.forEach(fn => fn(snap))
  _persist()
}

function _persist() {
  if (typeof window === 'undefined') return
  try {
    const lightweight = [..._activeJobs.values()].map(j => ({
      jobId:     j.jobId,
      eventId:   j.eventId,
      label:     j.label,
      status:    j.status,
      credits:   j.credits,
      createdAt: j.createdAt,
      urlJobs: j.urlJobs.map(u => ({
        url:           u.url,
        status:        u.status,
        error:         u.error,
        failureReason: u.failureReason,
        attempts:      u.attempts,
      })),
    }))
    localStorage.setItem('ep_scan_manager_v2', JSON.stringify({ jobs: lightweight, sessionCredits: _sessionCredits }))
  } catch { /* ignore quota errors */ }
}

function _sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

// POST /api/market-intel is now background-job-backed (2026-08-24) — see
// app/api/market-intel/route.ts's own top doc comment for why: production
// sits behind a Cloudflare Worker proxy that kills any single request
// around ~100s, and a full scan (up to 20 page fetches + an 8-page level-2
// crawl + a multi-model-fallback Gemini call) can run well past that. The
// POST call below now returns almost instantly with a scan_id; this polls
// GET /api/market-intel?scan_id=... until the scan record leaves 'running'.
const SCAN_POLL_INTERVAL_MS = 4000
const SCAN_POLL_MAX_ATTEMPTS = 90 // ~6 min ceiling — generous past any real scan seen so far, just a backstop
type ScanRow = {
  id: string
  status: 'running' | 'complete' | 'failed'
  result: (IntelResult & { credits: JobCredits; partial_failures: { type: string; reason: string }[] }) | null
  error_message: string | null
  failure_reason: UrlJob['failureReason'] | null
}
async function _pollScan(scanId: string, signal: AbortSignal): Promise<ScanRow> {
  for (let attempt = 0; attempt < SCAN_POLL_MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) throw new DOMException('Scan polling aborted', 'AbortError')
    const res = await fetch(`/api/market-intel?scan_id=${scanId}`, { signal })
    const data = await res.json().catch(() => ({}))
    const scan = (data.scans ?? [])[0] as ScanRow | undefined
    if (scan && scan.status !== 'running') return scan
    await _sleep(SCAN_POLL_INTERVAL_MS)
  }
  throw new DOMException('Scan timed out waiting for a result', 'AbortError')
}

// ── Job runner ────────────────────────────────────────────────────────────────

async function _runJobLoop(jobId: string): Promise<void> {
  const job     = _activeJobs.get(jobId)!
  const control = _controls.get(jobId)!

  for (let i = 0; i < job.urlJobs.length; i++) {
    const urlJob = job.urlJobs[i]

    // Check cancel
    if (control.cancelled) {
      for (let j = i; j < job.urlJobs.length; j++) {
        if (job.urlJobs[j].status === 'pending') {
          job.urlJobs[j].status = 'failed'
          job.urlJobs[j].error  = 'Job was cancelled'
          job.urlJobs[j].failureReason = 'network'
        }
      }
      break
    }

    // Wait while paused
    while (control.paused && !control.cancelled) {
      await _sleep(500)
    }
    if (control.cancelled) break

    // Already done (shouldn't happen, safety guard)
    if (urlJob.status === 'done' || urlJob.status === 'failed') continue

    urlJob.status = 'running'
    _notify()

    // Retry loop (max 3 attempts)
    let succeeded = false
    for (let attempt = 1; attempt <= 3 && !succeeded && !control.cancelled; attempt++) {
      urlJob.attempts = attempt
      urlJob.phase    = attempt === 1 ? 'Reconnaissance — studying site structure…' : `Retry ${attempt}/3 — ${attempt === 2 ? 'using alternate fetch method…' : 'final attempt…'}`
      _notify()

      try {
        // POST itself is now just a row-insert + background kickoff (see
        // app/api/market-intel/route.ts's top doc comment) — fast, so this
        // timeout only needs to cover that, not the whole scan.
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 20000)

        const res = await fetch('/api/market-intel', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ url: urlJob.url, event_id: job.eventId, job_id: jobId }),
          signal:  controller.signal,
        })
        clearTimeout(timer)

        const started = await res.json().catch(() => ({}))
        if (!res.ok || !started.scan_id) {
          throw new Error(String(started.error ?? `Could not start scan (status ${res.status})`))
        }

        urlJob.phase = 'Scanning — this can take a couple of minutes…'
        _notify()

        // Poll until the scan leaves 'running' — see _pollScan's own doc
        // comment. Separate, longer-lived controller than the POST's own,
        // since polling is expected to run for a while.
        const pollController = new AbortController()
        const pollTimer = setTimeout(() => pollController.abort(), 6 * 60 * 1000)
        let scan: ScanRow
        try {
          scan = await _pollScan(started.scan_id, pollController.signal)
        } finally {
          clearTimeout(pollTimer)
        }

        if (scan.status === 'complete' && scan.result) {
          const data = scan.result
          urlJob.status = 'done'
          urlJob.result = data as unknown as IntelResult
          urlJob.phase  = null

          // Accumulate credits
          const c = data.credits ?? { gemini: 0, firecrawl: 0, jina: 0 }
          job.credits.gemini    += c.gemini    ?? 0
          job.credits.firecrawl += c.firecrawl ?? 0
          job.credits.jina      += c.jina      ?? 0
          _sessionCredits.gemini    += c.gemini    ?? 0
          _sessionCredits.firecrawl += c.firecrawl ?? 0
          _sessionCredits.jina      += c.jina      ?? 0

          // Collect partial failures
          const pf = data.partial_failures ?? []
          for (const f of pf) {
            job.partialFailures.push({ url: urlJob.url, type: f.type, reason: f.reason })
          }

          succeeded = true
        } else {
          const errMsg = scan.error_message ?? 'Extraction failed'
          const reason = scan.failure_reason ?? 'ai'
          if (attempt < 3) {
            urlJob.phase = `Attempt ${attempt} failed (${reason}). Retrying in 3s…`
            _notify()
            await _sleep(3000)
          } else {
            urlJob.status        = 'failed'
            urlJob.error         = errMsg
            urlJob.failureReason = reason
            urlJob.phase         = null
          }
        }
      } catch (e) {
        const isAbort = e instanceof DOMException && e.name === 'AbortError'
        const errMsg  = isAbort ? 'Scan timed out' : String(e)
        const reason: UrlJob['failureReason'] = isAbort ? 'timeout' : 'network'
        if (attempt < 3 && !control.cancelled) {
          urlJob.phase = `Attempt ${attempt} failed (${reason}). Retrying in 3s…`
          _notify()
          await _sleep(3000)
        } else {
          urlJob.status        = 'failed'
          urlJob.error         = errMsg
          urlJob.failureReason = reason
          urlJob.phase         = null
        }
      }
    }

    _notify()
  }

  // Job complete
  if (!control.cancelled) {
    job.status      = 'complete'
    job.completedAt = new Date().toISOString()
  } else {
    job.status      = 'cancelled'
    job.completedAt = new Date().toISOString()
    // Update DB
    fetch('/api/market-intel-jobs?job_id=' + jobId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }).catch(() => {})
  }
  _controls.delete(jobId)
  _notify()

  // Keep completed job in state for 60s so UI can show final result, then remove
  setTimeout(() => {
    _activeJobs.delete(jobId)
    _notify()
  }, 60 * 1000)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function subscribe(fn: Listener): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

export function getState(): ManagerState {
  return _snapshot()
}

export function getActiveJobCount(): number {
  return [..._activeJobs.values()].filter(j => j.status === 'running' || j.status === 'paused').length
}

/**
 * Start a new scan job. Returns the jobId or null if slots are full.
 * The job loop runs asynchronously and survives navigation.
 */
export async function startJob(urls: string[], eventId: string, label?: string): Promise<string | null> {
  const running = getActiveJobCount()
  if (running >= MAX_CONCURRENT_JOBS) return null

  // Create job record in DB first
  let jobId: string
  try {
    const res = await fetch('/api/market-intel-jobs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event_id: eventId, urls, label }),
    })
    const data = await res.json()
    jobId = data.job_id
  } catch {
    // Fallback: use a local UUID if DB call fails
    jobId = crypto.randomUUID()
  }

  const batchLabel = label ?? `Batch — ${urls.length} URL${urls.length !== 1 ? 's' : ''}`
  const batch: JobBatch = {
    jobId,
    eventId,
    label:          batchLabel,
    urlJobs:        urls.map(url => ({ url, status: 'pending', result: null, error: null, failureReason: null, attempts: 0, phase: null })),
    status:         'running',
    credits:        { gemini: 0, firecrawl: 0, jina: 0 },
    partialFailures: [],
    createdAt:      new Date().toISOString(),
    completedAt:    null,
  }

  _activeJobs.set(jobId, batch)
  _controls.set(jobId, { paused: false, cancelled: false })
  _notify()

  // Fire-and-forget — loop persists across React renders
  _runJobLoop(jobId).catch(e => console.error('scanManager job error:', e))

  return jobId
}

export function pauseJob(jobId: string): void {
  const control = _controls.get(jobId)
  const job     = _activeJobs.get(jobId)
  if (!control || !job) return
  control.paused = true
  job.status     = 'paused'
  _notify()
  fetch('/api/market-intel-jobs?job_id=' + jobId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paused' }) }).catch(() => {})
}

export function resumeJob(jobId: string): void {
  const control = _controls.get(jobId)
  const job     = _activeJobs.get(jobId)
  if (!control || !job) return
  control.paused = false
  job.status     = 'running'
  _notify()
  fetch('/api/market-intel-jobs?job_id=' + jobId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'running' }) }).catch(() => {})
}

export function cancelJob(jobId: string): void {
  const control = _controls.get(jobId)
  if (!control) return
  control.cancelled = true
  // The loop will pick this up within 500ms
  _notify()
}

/** Try to restore session credits from localStorage after page refresh. */
export function restoreSession(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('ep_scan_manager_v2')
    if (!raw) return
    const data = JSON.parse(raw)
    const sc = data.sessionCredits
    if (sc) {
      _sessionCredits.gemini    = sc.gemini    ?? 0
      _sessionCredits.firecrawl = sc.firecrawl ?? 0
      _sessionCredits.jina      = sc.jina      ?? 0
    }
  } catch { /* ignore */ }
}

// Legacy compat — used by existing code that checks hasActiveScans
export function hasActiveScans(): boolean { return getActiveJobCount() > 0 }
