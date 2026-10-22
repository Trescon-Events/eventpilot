'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Textarea } from '@/app/components/ui'

/* "Request media interest" (PR & Media): asks the selected speakers whether they will give media bites / interviews, each by email from their own producer,
   with a private link to a short form. Review (one sample + an optional note for everyone) → send in chunks → per-speaker result. The server re-checks
   everything: speakers already asked or answered, no email, and PR not set up yet are skipped and reported, never failed. */

type Result = { id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }
const CHUNK = 8

export default function MediaRequestDialog({ eventId, speakers, onClose, onFinished }: { eventId: string; speakers: { id: string; name: string }[]; onClose: () => void; onFinished: () => void }) {
  const [stage, setStage] = useState<'review' | 'sending' | 'done'>('review')
  const [note, setNote] = useState('')
  const [sample, setSample] = useState<{ html: string; subject: string; sender: string; to: string; speaker: string } | { error: string } | null>(null)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [fatal, setFatal] = useState<string | null>(null)
  const stopRef = useRef(false)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const first = speakers[0]; if (!first) return
    const t = setTimeout(() => {
      fetch('/api/events/pr/requests/compose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, speaker_id: first.id, note }) })
        .then(async r => { const d = await r.json().catch(() => ({})); setSample(r.ok ? { html: d.html, subject: d.subject, sender: `${d.sender_name} <${d.sender_email}>`, to: d.to, speaker: first.name } : { error: d.error ?? 'Could not preview.' }) })
        .catch(() => setSample({ error: 'Could not preview.' }))
    }, 350)
    return () => clearTimeout(t)
  }, [eventId, speakers, note])

  async function run() {
    setStage('sending'); stopRef.current = false; setFatal(null)
    const ids = speakers.map(s => s.id)
    for (let i = 0; i < ids.length; i += CHUNK) {
      if (stopRef.current) break
      const res = await fetch('/api/events/pr/requests/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, speaker_ids: ids.slice(i, i + CHUNK), note }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFatal(d.error ?? 'Could not send.'); break }
      setResults(prev => { const n = { ...prev }; for (const r of d.results as Result[]) n[r.id] = r; return n })
    }
    setStage('done')
  }

  const sent = Object.values(results).filter(r => r.status === 'sent').length
  const skipped = Object.values(results).filter(r => r.status === 'skipped')
  const failed = Object.values(results).filter(r => r.status === 'failed')
  const nameOf = (id: string) => speakers.find(s => s.id === id)?.name ?? id

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', width: 'min(720px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '18px', fontWeight: 900, marginBottom: '4px' }}>Request media interest</div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '14px', lineHeight: 1.5 }}>
          {speakers.length} speaker{speakers.length === 1 ? '' : 's'} will be asked whether they will give media bites or interviews, and when they are free. Each email comes from that speaker’s own producer.
        </div>

        {stage === 'review' && (
          <>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Extra note for everyone (optional)</label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={600} placeholder="e.g. Several TV channels have confirmed." />
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', margin: '14px 0 6px' }}>Sample{sample && !('error' in sample) ? ` — for ${sample.speaker}` : ''}</div>
            {!sample ? <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Preparing the preview…</div>
              : 'error' in sample ? <div style={{ color: 'var(--red)', fontSize: '13.5px' }}>{sample.error}</div>
              : (
                <>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '6px' }}>From {sample.sender} · To {sample.to} · {sample.subject}</div>
                  <iframe title="Email preview" srcDoc={sample.html} sandbox="" style={{ width: '100%', height: '280px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }} />
                </>
              )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="teal" onClick={run} disabled={!sample || 'error' in sample}>Send to {speakers.length}</Button>
            </div>
          </>
        )}

        {stage !== 'review' && (
          <>
            <div style={{ fontSize: '14px', marginBottom: '8px' }}>{stage === 'sending' ? `Sending… ${Object.keys(results).length} of ${speakers.length}` : `Done: ${sent} sent${skipped.length ? `, ${skipped.length} skipped` : ''}${failed.length ? `, ${failed.length} failed` : ''}.`}</div>
            {fatal && <div style={{ color: 'var(--red)', fontSize: '13.5px', marginBottom: '8px' }}>{fatal}</div>}
            {[...skipped, ...failed].map(r => <div key={r.id} style={{ fontSize: '13px', color: r.status === 'failed' ? 'var(--red)' : 'var(--ink3)', marginBottom: '3px' }}>{nameOf(r.id)}: {r.status === 'failed' ? 'could not send' : 'skipped'} — {r.reason}</div>)}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              {stage === 'sending' && <Button variant="ghost" onClick={() => { stopRef.current = true; setStopping(true) }} disabled={stopping}>{stopping ? 'Stopping after this batch…' : 'Stop after this batch'}</Button>}
              {stage === 'done' && <Button variant="teal" onClick={() => { onFinished(); onClose() }}>Close</Button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
