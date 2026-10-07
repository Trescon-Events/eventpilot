'use client'

import { useState } from 'react'
import { Button, ProcessingOverlay } from '@/app/components/ui'
import type { AnnouncementListItem } from './page'

/* Cancel or reschedule a still-future scheduled post (2026-10-07). Postiz can't edit a post, so a reschedule is "remove
   the old schedule, then schedule again at the new time on the same channels" (see lib/events/postiz-unschedule.ts for why
   it's in that order). Either way the producer — and whoever had scheduled it — gets an email once it's done. */

type Props = {
  mode: 'cancel' | 'reschedule'
  announcementId: string
  scheduledFor: string
  channelLabels: string[]
  onClose: () => void
  onDone: (patch: Partial<AnnouncementListItem>) => void
}

// <input type="datetime-local"> wants local time without a zone.
const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }

export default function ManageScheduleModal({ mode, announcementId, scheduledFor, channelLabels, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<'confirm' | 'working' | 'done' | 'error'>('confirm')
  const [error, setError] = useState<string | null>(null)
  const [when, setWhen] = useState(toLocalInput(scheduledFor))
  const [doneLabel, setDoneLabel] = useState('')
  const current = new Date(scheduledFor).toLocaleString()
  const newTooSoon = mode === 'reschedule' && (!when || new Date(when).getTime() - new Date().getTime() < 5 * 60 * 1000)
  const unchanged = mode === 'reschedule' && when === toLocalInput(scheduledFor)

  async function go() {
    setPhase('working')
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/${mode === 'cancel' ? 'unschedule' : 'reschedule'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: mode === 'reschedule' ? JSON.stringify({ scheduled_for: new Date(when).toISOString() }) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || (mode === 'cancel' ? 'Could not cancel the schedule.' : 'Could not reschedule.'))
      onDone(data)
      setDoneLabel(mode === 'reschedule' ? new Date(when).toLocaleString() : '')
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setPhase('error')
    }
  }

  const title = phase === 'done' ? (mode === 'cancel' ? 'Schedule Cancelled' : 'Rescheduled') : mode === 'cancel' ? 'Cancel This Schedule?' : 'Reschedule Post'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '460px', maxWidth: '95%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {(phase === 'confirm' || phase === 'error') && (
          <>
            <div style={{ fontSize: '13.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '12px' }}>
              Currently scheduled for <strong style={{ color: 'var(--ink2)' }}>{current}</strong>{channelLabels.length > 0 && <> on <strong style={{ color: 'var(--ink2)' }}>{channelLabels.join(', ')}</strong></>}.
              {mode === 'cancel'
                ? ' Cancelling removes it from every channel. The post goes back to ready-to-publish with its approvals intact — nothing is lost and you can schedule it again any time.'
                : ' It stays on the same channels. To change the channels, cancel the schedule and schedule again.'}
            </div>
            {mode === 'reschedule' && (
              <label style={{ display: 'grid', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '12px' }}>New date and time
                <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '14px' }} />
                {newTooSoon && <span style={{ fontWeight: 600, color: 'var(--amber)' }}>Pick a time at least 5 minutes from now.</span>}
              </label>
            )}
            <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '14px' }}>You’ll get an email confirming this once it’s done.</div>
            {error && <div style={{ fontSize: '13px', color: 'var(--red)', lineHeight: 1.5, marginBottom: '12px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              {mode === 'cancel'
                ? <Button variant="red" onClick={go}>{phase === 'error' ? 'Try again' : 'Cancel the schedule'}</Button>
                : <Button variant="teal" onClick={go} disabled={newTooSoon || unchanged}>{phase === 'error' ? 'Try again' : 'Reschedule'}</Button>}
              <Button variant="ghost" onClick={onClose}>{mode === 'cancel' ? 'Keep it scheduled' : 'Close'}</Button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div style={{ fontSize: '13.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '16px' }}>
              {mode === 'cancel'
                ? 'The scheduled post was removed from every channel. It’s ready to publish again whenever you want.'
                : <>It will now go out at <strong style={{ color: 'var(--ink2)' }}>{doneLabel}</strong>.</>} A confirmation email is on its way to you.
            </div>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </>
        )}
      </div>
      <ProcessingOverlay active={phase === 'working'} label={mode === 'cancel' ? 'Cancelling…' : 'Rescheduling…'} estimatedMs={4000} />
    </div>
  )
}
