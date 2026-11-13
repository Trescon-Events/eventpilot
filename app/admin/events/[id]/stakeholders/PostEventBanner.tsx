'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/app/components/ui'

/* Post-event prompt (2026-11-10; made persistent 2026-11-12). Once an event has ended, a producer opening the Speakers tab is asked, every time until it is done, whether the confirmed speakers actually spoke.
   Nothing changes until they press Apply: every speaker defaults to "Spoke", and a no-show can be set (or left alone) before applying.
   Why a prompt and not automatic: a confirmed speaker who did not turn up would otherwise be counted as having spoken. Applied changes are logged by name and time. */

type Candidate = { id: string; name: string; company: string | null; status: string }
type Choice = 'Spoke' | 'No-show' | 'leave'

export default function PostEventBanner({ eventId, canEdit, onApplied }: { eventId: string; canEdit: boolean; onApplied: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<Record<string, Choice>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let gone = false
    fetch(`/api/events/stakeholders/speaker-lifecycle?event_id=${eventId}`).then(r => r.json()).then(d => {
      if (gone || !Array.isArray(d?.candidates) || d.candidates.length === 0) return
      setCandidates(d.candidates)
    }).catch(() => {})
    return () => { gone = true }
  }, [eventId])

  if (!canEdit || candidates.length === 0) return null

  const get = (id: string): Choice => choice[id] ?? 'Spoke'
  const spoke = candidates.filter(c => get(c.id) === 'Spoke').length
  const noShow = candidates.filter(c => get(c.id) === 'No-show').length

  async function apply() {
    setBusy(true); setError(null)
    const outcomes = candidates.filter(c => get(c.id) !== 'leave').map(c => ({ id: c.id, to: get(c.id) as 'Spoke' | 'No-show' }))
    const res = await fetch('/api/events/stakeholders/speaker-lifecycle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post_event', event_id: eventId, outcomes }),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Could not save.'); return }
    setCandidates([]); onApplied()
  }

  const seg = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)',
    background: active ? 'var(--teal)' : 'var(--card)', color: active ? 'var(--card)' : 'var(--ink2)',
  })

  return (
    <div role="alert" style={{ margin: '0 0 16px', padding: '14px 16px', background: 'var(--amber-light)', border: '1px solid var(--amber)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.6, flex: '1 1 320px' }}>
          <strong>The event has ended.</strong> {candidates.length} speaker{candidates.length === 1 ? ' is' : 's are'} still marked Confirmed. Did they speak? Marking them keeps the speaker statistics and the thank-you note accurate.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="teal" onClick={() => setOpen(o => !o)}>{open ? 'Hide list' : 'Review and mark'}</Button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ maxHeight: '320px', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
            {candidates.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, fontSize: '13px', color: 'var(--ink)' }}>
                  <strong>{c.name}</strong>{c.company ? <span style={{ color: 'var(--ink3)' }}> · {c.company}</span> : null}
                </div>
                <div style={{ display: 'flex' }}>
                  {(['Spoke', 'No-show', 'leave'] as Choice[]).map((o, i) => (
                    <button key={o} type="button" onClick={() => setChoice(m => ({ ...m, [c.id]: o }))}
                      style={{ ...seg(get(c.id) === o), borderRadius: i === 0 ? '8px 0 0 8px' : i === 2 ? '0 8px 8px 0' : 0 }}>
                      {o === 'leave' ? 'Leave as is' : o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {error && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginTop: '8px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '10px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{spoke} Spoke · {noShow} No-show · {candidates.length - spoke - noShow} left as is</span>
            <Button variant="teal" onClick={apply} disabled={busy || spoke + noShow === 0}>{busy ? 'Saving…' : `Apply to ${spoke + noShow}`}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
