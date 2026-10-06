'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/app/components/ui'

/* Review-then-send for a bulk invite / reminder. The emails are the event's saved template, rendered per speaker
   (nothing is edited here — edit one speaker's email from their own Guest Invite tab). The server re-validates every
   speaker and re-reads KonfHub before each send, so anyone who has become ineligible is skipped and reported. */

export type BulkRow = { id: string; name: string; to: string | null; cc: string[]; available: number | null; limit: number | null; sent_at: string | null }
type Result = { id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }
const CHUNK = 8

export default function BulkSendDialog({ eventId, kind, rows, deadlineText, onClose, onFinished }: {
  eventId: string; kind: 'invite' | 'reminder'; rows: BulkRow[]; deadlineText: string; onClose: () => void; onFinished: () => void
}) {
  const [stage, setStage] = useState<'review' | 'sending' | 'done'>('review')
  const [sample, setSample] = useState<{ html: string; subject: string; sender: string; speaker: string } | { error: string } | null>(null)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [stop, setStop] = useState(false)
  const stopRef = useRef(false)
  const noun = kind === 'invite' ? 'invite' : 'reminder'

  useEffect(() => {
    const first = rows[0]
    if (!first) return
    fetch(`/api/events/stakeholders/speakers/${first.id}/guest-invite/compose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
      .then(async r => { const d = await r.json().catch(() => ({})); setSample(r.ok ? { html: d.html, subject: d.subject, sender: `${d.sender_name} <${d.sender_email}>`, speaker: first.name } : { error: d.error ?? 'Could not preview.' }) })
      .catch(() => setSample({ error: 'Could not preview.' }))
  }, [rows, kind])

  async function run() {
    setStage('sending'); stopRef.current = false
    const batchId = crypto.randomUUID()
    const ids = rows.map(r => r.id)
    for (let i = 0; i < ids.length; i += CHUNK) {
      if (stopRef.current) break
      const chunk = ids.slice(i, i + CHUNK)
      const res = await fetch('/api/events/guest-invites/bulk-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, kind, speaker_ids: chunk, batch_id: batchId }) })
      const d = await res.json().catch(() => ({}))
      const out: Result[] = res.ok ? d.results : chunk.map(id => ({ id, status: 'failed' as const, reason: d.error ?? 'Request failed' }))
      setResults(prev => ({ ...prev, ...Object.fromEntries(out.map(r => [r.id, r])) }))
      if (!res.ok) break
    }
    setStage('done'); onFinished()
  }

  const done = Object.values(results)
  const count = (s: Result['status']) => done.filter(r => r.status === s).length
  const sendable = rows.filter(r => r.to).length
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={stage === 'sending' ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '760px', maxWidth: '96%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', display: 'grid', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>{stage === 'review' ? `Send ${rows.length} ${noun}${rows.length === 1 ? '' : 's'}` : stage === 'sending' ? `Sending… ${done.length} of ${rows.length}` : 'Finished'}</div>
          {stage !== 'sending' && <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>}
        </div>

        {stage === 'review' && (
          <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
            Each speaker gets the event’s saved {noun} email from their own producer, in their one email thread, with their Additional Contacts on Cc. Registration closes {deadlineText}.
            {kind === 'reminder' && ' Each reminder is worded to match how many places that speaker has used right now.'} Places are re-read from KonfHub as each email goes out; anyone who is no longer eligible is skipped.
          </div>
        )}

        {stage === 'review' && (
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>Sample{sample && 'speaker' in sample ? ` — ${sample.speaker}` : ''}</div>
            {!sample ? <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading preview…</div>
              : 'error' in sample ? <div style={{ fontSize: '13px', color: 'var(--red)' }}>{sample.error}</div>
              : <>
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '8px' }}>From <strong>{sample.sender}</strong> · Subject <strong>{sample.subject}</strong></div>
                {/* eslint-disable-next-line no-restricted-syntax -- always-white email paper, matches EmailComposeFields */}
                <iframe srcDoc={sample.html} title="Sample email" sandbox="" style={{ width: '100%', height: '320px', border: 'none', borderRadius: '6px', background: '#fff' }} />
              </>}
          </div>
        )}

        <div style={{ display: 'grid', gap: '4px' }}>
          {rows.map(r => {
            const res = results[r.id]
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,2fr) auto', gap: '10px', fontSize: '12.5px', padding: '6px 10px', borderRadius: '8px', background: 'var(--card-hi)', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}</span>
                <span style={{ color: 'var(--ink3)', overflowWrap: 'anywhere' }}>{r.to ?? '—'}{r.cc.length > 0 && <span style={{ color: 'var(--ink4)' }}> · cc {r.cc.join(', ')}</span>}</span>
                <span style={{ color: res?.status === 'sent' ? 'var(--teal-mid)' : res?.status === 'failed' ? 'var(--red)' : res?.status === 'skipped' ? 'var(--amber)' : 'var(--ink4)', textAlign: 'right' }}>
                  {res ? (res.status === 'sent' ? '✓ Sent' : res.status === 'skipped' ? `Skipped — ${res.reason}` : `Failed — ${res.reason}`) : stage === 'sending' ? 'Waiting…' : r.available !== null && r.limit !== null ? `${r.available} of ${r.limit} left` : ''}
                </span>
              </div>
            )
          })}
        </div>

        {stage === 'done' && <div style={{ fontSize: '14px', color: 'var(--ink2)' }}><strong>{count('sent')}</strong> sent{count('skipped') > 0 && <> · <strong>{count('skipped')}</strong> skipped</>}{count('failed') > 0 && <> · <strong style={{ color: 'var(--red)' }}>{count('failed')}</strong> failed</>}{done.length < rows.length && <> · {rows.length - done.length} not attempted</>}. Everything sent is in the send history below.</div>}

        <div style={{ display: 'flex', gap: '8px' }}>
          {stage === 'review' && <Button variant="teal" onClick={run} disabled={sendable === 0}>{`Send ${rows.length} ${noun}${rows.length === 1 ? '' : 's'}`}</Button>}
          {stage === 'review' && <Button variant="ghost" onClick={onClose}>Cancel</Button>}
          {stage === 'sending' && <Button variant="ghost" onClick={() => { stopRef.current = true; setStop(true) }} disabled={stop}>{stop ? 'Stopping after this batch…' : 'Stop after this batch'}</Button>}
          {stage === 'done' && <Button variant="teal" onClick={onClose}>Close</Button>}
        </div>
      </div>
    </div>
  )
}
