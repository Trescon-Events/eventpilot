'use client'

import { useState } from 'react'
import { Button, ProcessingOverlay } from '@/app/components/ui'
import type { AnnouncementListItem } from './page'

/* "Remove Post" (2026-09-21, Madhu) — clears a published announcement's
   record in EventPilot and Postiz so it's ready to post again, no
   approvals to redo.

   IMPORTANT, corrected same day after a live test: this does NOT take the
   live post down from LinkedIn/etc. Confirmed against Postiz's own docs
   (docs.postiz.com via mintlify mirror, since found) — "You cannot delete
   posts that have already been published to social media platforms. The
   API only manages scheduled and draft posts." Live-tested: DELETE
   /posts/:id returns success and the post vanishes from Postiz's own
   list, but the actual LinkedIn share stayed fully visible and reachable
   at its real URL. There is no public-API way to retract already-live
   content — only Postiz's own DELETE, which doesn't do it for a
   published post. The copy below says exactly that; do not soften it
   back to implying a live takedown without re-confirming Postiz has
   actually added that capability.

   Same confirm-then-act shape as PublishProgressModal's own 'confirm'
   phase, deliberately simpler — no per-channel polling, this is a single
   synchronous call (see remove-post/route.ts). A dedicated component
   rather than a third PublishProgressModal mode — that component's
   per-channel polling render doesn't apply here at all. */

type Props = {
  announcementId: string
  onClose: () => void
  onDone: (patch: Partial<AnnouncementListItem>) => void
}

export default function RemovePostModal({ announcementId, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<'confirm' | 'removing' | 'done' | 'error'>('confirm')
  const [error, setError] = useState<string | null>(null)

  async function confirmRemove() {
    setPhase('removing')
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/remove-post`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not remove this post.')
      onDone(data)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove this post.')
      setPhase('error')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '440px', maxWidth: '95%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>
            {phase === 'done' ? 'Post Cleared' : 'Clear This Post?'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {phase === 'confirm' && (
          <>
            <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: '12.5px', fontWeight: 700, marginBottom: '12px', lineHeight: 1.5 }}>
              ⚠ This does NOT take the live post down from LinkedIn or wherever it was published — Postiz&apos;s own API can&apos;t retract already-published content. If you need it actually gone, delete it directly on the platform first.
            </div>
            <div style={{ fontSize: '13.5px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '16px' }}>
              This clears EventPilot&apos;s (and Postiz&apos;s) record of it and resets this announcement to ready-to-publish — no approvals to redo, so you can post a fresh one right away if needed.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="red" onClick={confirmRemove}>Clear This Post</Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div style={{ fontSize: '13.5px', color: 'var(--red)', lineHeight: 1.5, marginBottom: '16px' }}>{error}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="red" onClick={confirmRemove}>Retry</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div style={{ fontSize: '13.5px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '16px' }}>
              Cleared from EventPilot and Postiz — ready to publish again whenever you want. Remember: the original post is still live on the platform itself unless you&apos;ve deleted it there directly.
            </div>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </>
        )}
      </div>
      <ProcessingOverlay active={phase === 'removing'} label="Clearing…" estimatedMs={2500} />
    </div>
  )
}
