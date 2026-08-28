'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/app/components/ui'
import { PLATFORM_LABELS, type PostizChannel, type AnnouncementListItem, type AnnouncementStatus } from './page'

/* Live "Post Now" progress popup (2026-08-27, per Madhu — producers want
   to watch each channel go from "publishing" to a tick + the real link,
   right when they click, not just find out later). Opens in a 'confirm'
   phase first (2026-08-28, per Madhu — Post Now was firing immediately on
   click with no "are you sure," which is one-way and irreversible; Retry
   gets the same treatment for the same reason) — only once confirmed does
   it fire the actual publish-now/retry call (so a same-request failure
   shows here too), then polls the new on-demand publish-check route every
   few seconds — Postiz confirmation is NOT synchronous (see
   postiz-publish.ts's checkAnnouncementPublishStatus), so this is real
   polling, not a fake progress bar. Stops after MAX_POLLS with a "still
   confirming" note rather than spinning forever — the 15-min sync-status
   cron is the eventual-consistency fallback for anything still pending
   when this closes. Every result here is also persisted server-side
   (same table the cron writes to), so the panel's "Delivered to" section
   is this same data, still there after the popup is closed — nothing
   shown here is only visible transiently. */

type ChannelResult = { success: boolean; postId: string; state?: string; url?: string }

const POLL_INTERVAL_MS = 4000
const MAX_POLLS = 22 // ~88s

type Props = {
  announcementId: string
  channelIds: string[]
  postizChannels: PostizChannel[]
  mode: 'now' | 'retry'
  onClose: () => void
  onDone: (patch: Partial<AnnouncementListItem>) => void
}

export default function PublishProgressModal({ announcementId, channelIds, postizChannels, mode, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<'confirm' | 'starting' | 'polling' | 'settled'>('confirm')
  const [results, setResults] = useState<Record<string, ChannelResult>>({})
  const [status, setStatus] = useState<AnnouncementStatus | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const pollCount = useRef(0)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  const unmountedRef = useRef(false)
  useEffect(() => () => { unmountedRef.current = true }, [])

  async function confirmAndStart() {
    setPhase('starting')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/publish-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postiz_channel_ids: channelIds }),
    })
    const data = await res.json().catch(() => ({}))
    if (unmountedRef.current) return
    if (!res.ok) {
      setStartError(data.error || 'Could not publish this announcement.')
      setPhase('settled')
      return
    }
    setResults(data.publish_results ?? {})
    setStatus(data.status ?? null)
    onDoneRef.current({ status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results, postiz_channel_ids: channelIds })
    setPhase('polling')
  }

  useEffect(() => {
    if (phase !== 'polling') return
    let cancelled = false
    const timer = setInterval(async () => {
      pollCount.current += 1
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/publish-check`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (cancelled || !res.ok) return
      setResults(data.publish_results ?? {})
      setStatus(data.status ?? null)
      onDoneRef.current({ status: data.status, publish_results: data.publish_results, ...(data.published_at ? { published_at: data.published_at } : {}) })
      if (data.status === 'published' || data.status === 'failed') {
        setPhase('settled')
      } else if (pollCount.current >= MAX_POLLS) {
        setTimedOut(true)
        setPhase('settled')
      }
    }, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [phase, announcementId])

  const rows = channelIds.map(id => {
    const ch = postizChannels.find(c => c.id === id)
    const label = (ch && PLATFORM_LABELS[ch.identifier]) || ch?.name || id
    const r = results[id]
    const state = r?.state ?? (r?.success === false ? 'ERROR' : 'QUEUE')
    return { id, label, url: r?.url, state }
  })

  const allTerminal = rows.length > 0 && rows.every(r => r.state === 'PUBLISHED' || r.state === 'ERROR')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '480px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>
            {phase === 'confirm' ? (mode === 'retry' ? 'Retry Publish?' : 'Post Now?') : mode === 'retry' ? 'Retrying Publish' : 'Publishing'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {phase === 'confirm' && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '12px' }}>
              This publishes live right now, immediately, on:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
              {channelIds.map(id => {
                const ch = postizChannels.find(c => c.id === id)
                const label = (ch && PLATFORM_LABELS[ch.identifier]) || ch?.name || id
                return (
                  <span key={id} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', padding: '4px 9px', borderRadius: '7px', border: '1px solid var(--border)' }}>{label}</span>
                )
              })}
            </div>
          </div>
        )}

        {phase === 'starting' && !startError && (
          <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '12px' }}>Sending to Postiz…</div>
        )}

        {startError && (
          <div style={{ fontSize: '13.5px', color: 'var(--red)', marginTop: '12px', lineHeight: 1.5 }}>{startError}</div>
        )}

        {(phase === 'polling' || (phase === 'settled' && !startError)) && (
          <div style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>
            {rows.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '9px', border: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', minWidth: '90px' }}>{r.label}</span>
                {r.state === 'PUBLISHED' && r.url ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}>
                    <span style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>✓</span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>View post ↗</a>
                  </span>
                ) : r.state === 'ERROR' ? (
                  <span style={{ fontSize: '12.5px', color: 'var(--red)', fontWeight: 700 }}>✗ Failed</span>
                ) : r.state === 'PUBLISHED' ? (
                  <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Confirmed, link pending…</span>
                ) : (
                  <span style={{ fontSize: '12.5px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="publish-spinner" style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--teal-mid)', display: 'inline-block', animation: 'publish-spin 0.8s linear infinite' }} />
                    Publishing…
                  </span>
                )}
              </div>
            ))}
            <style>{'@keyframes publish-spin { to { transform: rotate(360deg); } }'}</style>
          </div>
        )}

        {phase === 'settled' && !startError && (
          <div style={{ fontSize: '12.5px', color: allTerminal ? 'var(--ink3)' : 'var(--amber)', marginTop: '14px', lineHeight: 1.5 }}>
            {allTerminal
              ? status === 'failed' ? 'One or more channels failed — see above.' : '✓ All channels confirmed.'
              : timedOut
                ? 'Still confirming on some channels — this can take a few minutes on slower platforms. You can close this now; the status will keep updating automatically and the links will appear below once ready.'
                : ''}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
          {phase === 'confirm' ? (
            <>
              <Button variant="lime" onClick={confirmAndStart}>{mode === 'retry' ? 'Retry Publish' : 'Post Now'}</Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>{phase === 'settled' ? 'Close' : 'Close (keeps running)'}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
