'use client'

import { useState } from 'react'
import { Button } from '@/app/components/ui'
import { PLATFORM_LABELS, type PostizChannel, type AnnouncementListItem } from './page'

/* Schedule confirmation popup (2026-08-29, per Madhu — "similar to how we
   get a confirmation popup for Post Now, clicking on Schedule also should
   have one"). Simpler than PublishProgressModal — a real future schedule
   is a single Postiz call with no live-confirmation polling to watch (the
   post isn't going out this second), so this is just confirm → one fetch
   → done/error, no per-channel progress list. */

type Props = {
  announcementId: string
  channelIds: string[]
  postizChannels: PostizChannel[]
  scheduledForIso: string
  scheduledForLabel: string
  onClose: () => void
  onDone: (patch: Partial<AnnouncementListItem>) => void
}

export default function ScheduleConfirmModal({ announcementId, channelIds, postizChannels, scheduledForIso, scheduledForLabel, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<'confirm' | 'sending' | 'done' | 'error'>('confirm')
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPhase('sending')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/schedule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_for: scheduledForIso, postiz_channel_ids: channelIds }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not schedule this announcement.')
      setPhase('error')
      return
    }
    onDone({ status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results, postiz_channel_ids: channelIds })
    setPhase('done')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '440px', maxWidth: '95%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>
            {phase === 'done' ? 'Scheduled' : 'Schedule Post?'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {phase !== 'done' && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5, margin: '12px 0 6px' }}>
              This will go live automatically at <strong style={{ color: 'var(--ink2)' }}>{scheduledForLabel}</strong> on:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {channelIds.map(id => {
                const ch = postizChannels.find(c => c.id === id)
                const label = (ch && PLATFORM_LABELS[ch.identifier]) || ch?.name || id
                return (
                  <span key={id} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', padding: '4px 9px', borderRadius: '7px', border: '1px solid var(--border)' }}>{label}</span>
                )
              })}
            </div>
          </>
        )}

        {phase === 'error' && (
          <div style={{ fontSize: '13.5px', color: 'var(--red)', marginTop: '12px', lineHeight: 1.5 }}>{error}</div>
        )}

        {phase === 'done' && (
          <div style={{ fontSize: '13px', color: 'var(--teal-mid)', fontWeight: 700, marginTop: '12px' }}>
            ✓ Scheduled for {scheduledForLabel} — links will appear here once each channel confirms.
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
          {phase === 'confirm' && (
            <>
              <Button variant="lime" onClick={confirm}>Schedule</Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </>
          )}
          {phase === 'sending' && <Button variant="lime" disabled>Scheduling…</Button>}
          {(phase === 'error' || phase === 'done') && <Button variant="ghost" onClick={onClose}>Close</Button>}
        </div>
      </div>
    </div>
  )
}
