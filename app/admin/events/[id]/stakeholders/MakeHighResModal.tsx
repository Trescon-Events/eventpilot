'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/app/components/ui'

/* "Make it High-Res" (2026-09-28, per Madhu) — a small, standalone modal,
   deliberately separate from PhotoCleaningWizard's own multi-step state
   machine (this touches only photo_url, before Clean Photo ever runs, and
   has nothing to do with head position/AI Fill/Website Photo) — see
   generateHighResPhoto's own doc comment in photo-cleaning-pipeline.ts for
   why this exists as its own step rather than folded into AI Fill +
   Enhance.

   Same background-job + poll pattern as PhotoCleaningWizard's own
   pollCleanJob (job_id -> GET .../clean-photo/job/[jobId] every few
   seconds) since this reuses that same speaker_photo_clean_jobs table —
   see .../make-high-res/route.ts's own doc comment.

   Propose-only: "Use This" PATCHes photo_url via the ordinary speaker
   PATCH route (a plain SAE-owned field, no bespoke apply endpoint) and
   calls onSaved (the parent's full record refetch); "Discard" just closes
   without touching anything. The original raw photo is never deleted from
   storage either way — only the DB pointer would move. */

type Props = {
  speakerId: string
  currentPhotoUrl: string
  onSaved: () => void | Promise<void>
  onClose: () => void
}

type State =
  | { phase: 'starting' }
  | { phase: 'processing' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; pendingUrl: string }
  | { phase: 'applying' }

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 200 // ~10 min ceiling, same backstop as PhotoCleaningWizard's clean-photo poll

export default function MakeHighResModal({ speakerId, currentPhotoUrl, onSaved, onClose }: Props) {
  const [state, setState] = useState<State>({ phase: 'starting' })
  const jobIdRef = useRef<string | null>(null)

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
      setState({ phase: 'ready', pendingUrl })
    } catch {
      if (jobIdRef.current !== jobId) return
      if (attempt >= POLL_MAX_ATTEMPTS) {
        setState({ phase: 'error', message: 'Could not generate a high-res version — check your connection and try again.' })
        return
      }
      setTimeout(() => poll(jobId, attempt + 1), POLL_INTERVAL_MS)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/make-high-res`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok || !data.job_id) {
        setState({ phase: 'error', message: data.error ?? 'Could not start the high-res pass.' })
        return
      }
      jobIdRef.current = data.job_id
      setState({ phase: 'processing' })
      poll(data.job_id, 0)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function applyResult(pendingUrl: string) {
    setState({ phase: 'applying' })
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo_url: pendingUrl }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setState({ phase: 'error', message: data.error ?? 'Could not save the high-res photo.' })
      return
    }
    await onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '720px', maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Make it High-Res</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '18px' }}>
          Increases resolution and sharpness on the raw photo only — nothing else about it should change. This replaces the raw photo used by Clean Photo; it doesn&apos;t touch anything already cleaned.
        </div>

        {(state.phase === 'starting' || state.phase === 'processing') && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>
            Generating a higher-resolution version… this can take a minute or two.
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

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {state.phase === 'ready' && (
            <>
              <Button variant="ghost" onClick={onClose}>Discard</Button>
              <Button variant="lime" onClick={() => applyResult(state.pendingUrl)}>Use This</Button>
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
