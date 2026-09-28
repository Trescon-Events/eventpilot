'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/app/components/ui'

/* "Make it High-Res" (2026-09-28, per Madhu) — the Clean Photo sequence's
   own first OPTIONAL step, deliberately separate from PhotoCleaningWizard's
   multi-step state machine as its own small modal (this only ever touches
   photo_url/photo_processed_url, before Compose/AI Fill/Website Photo run)
   — see generateHighResPhoto's own doc comment in photo-cleaning-pipeline.ts
   for why this exists as its own step rather than folded into AI Fill +
   Enhance, and .../make-high-res/route.ts's own doc comment for why it's
   sourced from the raw, background-intact photo_url and produces a fresh
   photo_processed_url alongside it, not the other way round.

   Starts on a 'confirm' phase — a real cost/quality warning shown BEFORE
   any API call, not after (2026-09-28, per Madhu: "gives a clear legible
   warning... only use it if the photo resolution is bad" — a producer
   must be able to back out here with zero cost incurred, not just told
   after the fact). Only once they click through does the background job
   actually start.

   Same background-job + poll pattern as PhotoCleaningWizard's own
   pollCleanJob (job_id -> GET .../clean-photo/job/[jobId] every few
   seconds) since this reuses that same speaker_photo_clean_jobs table.

   Propose-only: "Use This" PATCHes photo_url (and photo_processed_url,
   when the background-removal re-run succeeded) via the ordinary speaker
   PATCH route — no bespoke apply endpoint needed — then calls onApplied so
   the embedding wizard step can refresh what it's showing (Compose) without
   a full reopen, and onSaved (the parent page's full record refetch).
   "Discard"/backing out of 'confirm' just closes without touching
   anything. The original raw photo is never deleted from storage either
   way — only the DB pointer(s) would move. */

type Props = {
  speakerId: string
  currentPhotoUrl: string
  onApplied: (photoUrl: string, photoProcessedUrl: string | null) => void
  onSaved: () => void | Promise<void>
  onClose: () => void
}

type State =
  | { phase: 'confirm' }
  | { phase: 'starting' }
  | { phase: 'processing' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; pendingUrl: string; pendingProcessedUrl: string | null }
  | { phase: 'applying' }

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 200 // ~10 min ceiling, same backstop as PhotoCleaningWizard's clean-photo poll

// Same validated long-wait pattern as PhotoCleaningWizard's own
// WORKING_PHRASES/elapsedSec (2026-09-28) — an elapsed counter that keeps
// climbing reads as "still working," unlike a spinner that loops back to
// 0 and could look hung on a genuinely slow (30-90s+) AI call; a plain
// static sentence with no motion at all (what this modal had before) is
// worse still. Two calls run in sequence here (gpt-image-2, then
// PhotoRoom), hence its own slightly longer phrase set.
const WORKING_PHRASES = ['Upscaling the photo…', 'Sharpening details…', 'Re-checking the background…', 'Almost there…']
const PHRASE_INTERVAL_MS = 4000
// 45s (copied from PhotoCleaningWizard's own single-call threshold without
// adjusting) was way too low here — per Madhu, testing live, a normal run
// of this step (gpt-image-2's own 30-90s+ call, THEN a separate PhotoRoom
// re-segmentation call, sequential not parallel) took ~150s and still hit
// "taking longer than usual." 120s is a more honest floor for a normal run
// of this specific two-call pipeline.
const LONG_WAIT_THRESHOLD_SEC = 120

export default function MakeHighResModal({ speakerId, currentPhotoUrl, onApplied, onSaved, onClose }: Props) {
  const [state, setState] = useState<State>({ phase: 'confirm' })
  const jobIdRef = useRef<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const working = state.phase === 'starting' || state.phase === 'processing'
  useEffect(() => {
    if (!working) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the elapsed-timer display alongside entering the working phase, not a response to another render (same pattern as PhotoCleaningWizard's own identical effect)
    setElapsedSec(0)
    setPhraseIndex(0)
    const tick = setInterval(() => setElapsedSec(s => s + 1), 1000)
    const rotate = setInterval(() => setPhraseIndex(i => i + 1), PHRASE_INTERVAL_MS)
    return () => { clearInterval(tick); clearInterval(rotate) }
  }, [working])
  const longWait = elapsedSec >= LONG_WAIT_THRESHOLD_SEC

  async function poll(jobId: string, attempt: number) {
    if (jobIdRef.current !== jobId) return
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/clean-photo/job/${jobId}`)
      const data = await res.json().catch(() => ({}))
      if (jobIdRef.current !== jobId) return
      if (!res.ok || data.status === 'error') {
        setState({ phase: 'error', message: data.error || 'Could not generate a high-res version — please try again.' })
        return
      }
      if (data.status === 'processing') {
        if (attempt >= POLL_MAX_ATTEMPTS) {
          setState({ phase: 'error', message: 'This is taking much longer than usual — please try again.' })
          return
        }
        setTimeout(() => poll(jobId, attempt + 1), POLL_INTERVAL_MS)
        return
      }
      const pendingUrl = data.result?.pending_photo_url
      if (!pendingUrl) { setState({ phase: 'error', message: 'No result came back — please try again.' }); return }
      setState({ phase: 'ready', pendingUrl, pendingProcessedUrl: data.result?.pending_processed_url ?? null })
    } catch {
      if (jobIdRef.current !== jobId) return
      if (attempt >= POLL_MAX_ATTEMPTS) {
        setState({ phase: 'error', message: 'Could not generate a high-res version — check your connection and try again.' })
        return
      }
      setTimeout(() => poll(jobId, attempt + 1), POLL_INTERVAL_MS)
    }
  }

  async function start() {
    setState({ phase: 'starting' })
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/make-high-res`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.job_id) {
      setState({ phase: 'error', message: data.error ?? 'Could not start the high-res pass.' })
      return
    }
    jobIdRef.current = data.job_id
    setState({ phase: 'processing' })
    poll(data.job_id, 0)
  }

  async function applyResult(pendingUrl: string, pendingProcessedUrl: string | null) {
    setState({ phase: 'applying' })
    const body: Record<string, string> = { photo_url: pendingUrl }
    if (pendingProcessedUrl) body.photo_processed_url = pendingProcessedUrl
    // This route's own PATCH, not the generic .../speakers/[id] one — see
    // make-high-res/route.ts's own doc comment for why (that route only
    // accepts its own closed field allowlist and 400s on anything else,
    // real bug caught live testing this).
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/make-high-res`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setState({ phase: 'error', message: data.error ?? 'Could not save the high-res photo.' })
      return
    }
    onApplied(pendingUrl, pendingProcessedUrl)
    await onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '720px', maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Make it High-Res</div>

        {state.phase === 'confirm' && (
          <>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '18px', lineHeight: 1.6 }}>
              Increases resolution and sharpness on the raw photo — nothing else about it should change. This also re-runs background removal on the sharper result, since it usually works better on a clearer image.
            </div>
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'color-mix(in srgb, var(--amber) 12%, transparent)', color: 'var(--ink)', fontSize: '12.5px', lineHeight: 1.6, marginBottom: '20px' }}>
              ⚠ This calls a paid AI service and takes a minute or two — only use it when the photo is genuinely low-resolution or missing body parts. For a normal photo, skip this and go straight to Compose below.
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={onClose}>Skip</Button>
              <Button variant="lime" onClick={start}>Generate High-Res Version</Button>
            </div>
          </>
        )}

        {working && (
          <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '30px', fontWeight: 800, color: longWait ? 'var(--amber)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{elapsedSec}s</div>
            <div style={{ fontSize: '13px', color: longWait ? 'var(--amber)' : 'var(--ink3)', marginTop: '8px', minHeight: '18px' }}>
              {longWait
                ? "Still working — this one's taking a bit longer than usual, hang tight…"
                : WORKING_PHRASES[phraseIndex % WORKING_PHRASES.length]}
            </div>
          </div>
        )}

        {state.phase === 'error' && (
          <div style={{ padding: '16px', borderRadius: '10px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)', fontSize: '13px', marginBottom: '16px' }}>
            {state.message}
          </div>
        )}

        {(state.phase === 'ready' || state.phase === 'applying') && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Before</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentPhotoUrl} alt="Before" style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border-light)' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>After</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={(state as { pendingUrl: string }).pendingUrl} alt="After" style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border-light)' }} />
            </div>
          </div>
        )}
        {state.phase === 'ready' && !state.pendingProcessedUrl && (
          <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '-10px', marginBottom: '16px' }}>
            ⚠ Background removal on the sharper version didn&apos;t succeed — the existing background-removed photo (if any) is left untouched; only the raw photo above would be replaced.
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {state.phase === 'ready' && (
            <>
              <Button variant="ghost" onClick={onClose}>Discard</Button>
              <Button variant="lime" onClick={() => applyResult(state.pendingUrl, state.pendingProcessedUrl)}>Use This</Button>
            </>
          )}
          {state.phase === 'applying' && <Button variant="lime" disabled>Saving…</Button>}
          {(state.phase === 'error' || state.phase === 'starting' || state.phase === 'processing') && (
            <Button variant="ghost" onClick={onClose}>Close</Button>
          )}
        </div>
      </div>
    </div>
  )
}
