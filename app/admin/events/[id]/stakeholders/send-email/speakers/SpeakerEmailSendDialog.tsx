'use client'

import ExtraCcField from '@/app/components/ExtraCcField'
import { parseExtraCc } from '@/app/lib/email/extra-cc'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/app/components/ui'

/* Review & send for Speaker Emails — same shape as the Guest Invites / Media Interview bulk sends: a table first (who each email goes to, who it comes from, what will happen),
   then sending in chunks with a per-speaker result. Skipped speakers (no email) are shown and left out. The server re-checks everything, including the content rules. */

export type Attachment = { name: string; url: string; size: number; type: string }
type Plan = { speaker_id: string; name: string; to: string; cc: string[]; from: string; from_name: string; subject: string; state: 'ready' | 'no_email' }
type Result = { id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }
type Finding = { message: string; match: string }
const CHUNK = 8

export default function SpeakerEmailSendDialog({ eventId, speakerIds, bodyHtml, polished, originalHtml, attachments, onClose, onFinished }: {
  eventId: string; speakerIds: string[]; bodyHtml: string; polished: boolean; originalHtml: string | null; attachments: Attachment[]; onClose: () => void; onFinished: (sentAny: boolean) => void
}) {
  const [stage, setStage] = useState<'review' | 'sending' | 'done'>('review')
  const [plan, setPlan] = useState<Plan[] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string>('')
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [fatal, setFatal] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Finding[]>([])
  const stopRef = useRef(false)
  const [stopping, setStopping] = useState(false)
  const [ccText, setCcText] = useState('')
  const extra = parseExtraCc(ccText)
  const batchRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetch('/api/events/stakeholders/speaker-emails/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, speaker_ids: speakerIds, body_html: bodyHtml }) })
      .then(async r => {
        const d = await r.json().catch(() => ({})); if (cancelled) return
        if (!r.ok) { setPlanError(d.error ?? 'Could not check the speakers.'); return }
        const rows = d.rows as Plan[]; setPlan(rows); setPreviewId(rows.find(p => p.state === 'ready')?.speaker_id ?? '')
      })
      .catch(() => { if (!cancelled) setPlanError('Could not check the speakers.') })
    return () => { cancelled = true }
  }, [eventId, speakerIds, bodyHtml])

  useEffect(() => {
    if (!previewId) return
    let cancelled = false
    fetch('/api/events/stakeholders/speaker-emails/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, speaker_ids: [previewId], body_html: bodyHtml, preview_speaker_id: previewId }) })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!cancelled) setPreviewHtml(r.ok ? d.preview_html : null) })
      .catch(() => { if (!cancelled) setPreviewHtml(null) })
    return () => { cancelled = true }
  }, [eventId, previewId, bodyHtml])

  const toSend = useMemo(() => (plan ?? []).filter(p => p.state === 'ready'), [plan])

  async function run() {
    setStage('sending'); stopRef.current = false; setFatal(null); setBlocked([])
    const ids = toSend.map(p => p.speaker_id)
    for (let i = 0; i < ids.length; i += CHUNK) {
      if (stopRef.current) break
      const res = await fetch('/api/events/stakeholders/speaker-emails/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, speaker_ids: ids.slice(i, i + CHUNK), body_html: bodyHtml, batch_id: batchRef.current, polished, original_html: originalHtml, attachments, extra_cc: 'emails' in extra ? extra.emails : [] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFatal(d.error ?? 'Could not send.'); if (Array.isArray(d.errors)) setBlocked(d.errors); stopRef.current = true; break }
      batchRef.current = d.batch_id
      setResults(prev => { const n = { ...prev }; for (const r of d.results as Result[]) n[r.id] = r; return n })
    }
    setStage('done')
  }

  const count = (s: Result['status']) => Object.values(results).filter(r => r.status === s).length
  const stateCell = (p: Plan) => {
    const r = results[p.speaker_id]
    if (r) return r.status === 'sent' ? <span style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>✓ Sent</span> : <span style={{ color: r.status === 'failed' ? 'var(--red)' : 'var(--amber)' }}>{r.status === 'failed' ? 'Failed' : 'Skipped'} — {r.reason}</span>
    if (stage === 'sending') return <span style={{ color: 'var(--ink4)' }}>Waiting…</span>
    return p.state === 'ready' ? <span style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Will be sent</span> : <span style={{ color: 'var(--red)' }}>No email address — can’t send</span>
  }
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--ink3)', textTransform: 'uppercase' }
  const td: React.CSSProperties = { padding: '8px', fontSize: '13.5px', borderTop: '1px solid var(--border-light)', verticalAlign: 'top' }
  const current = plan?.find(p => p.speaker_id === previewId)

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', width: 'min(900px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '19px', fontWeight: 900, marginBottom: '4px' }}>Review &amp; send</div>
        <div style={{ fontSize: '14px', color: 'var(--ink3)', marginBottom: '14px', lineHeight: 1.5 }}>
          Each speaker gets their own email, from their own producer, in their one Outlook thread. Check who it goes to, then send.
        </div>
        {planError && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '12px' }}>{planError}</div>}
        {!plan && !planError && <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>Checking the speakers…</div>}
        {plan && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
                <thead><tr><th style={th}>Speaker</th><th style={th}>To / Cc</th><th style={th}>From</th><th style={th}>{stage === 'review' ? 'What will happen' : 'Result'}</th></tr></thead>
                <tbody>
                  {plan.map(p => (
                    <tr key={p.speaker_id}>
                      <td style={{ ...td, fontWeight: 700 }}>{p.name}</td>
                      <td style={{ ...td, color: 'var(--ink2)', overflowWrap: 'anywhere' }}>{p.to || '—'}{p.cc.length > 0 && <span style={{ color: 'var(--ink4)' }}> · cc {p.cc.join(', ')}</span>}</td>
                      <td style={{ ...td, color: 'var(--ink2)' }}>{p.from}</td>
                      <td style={td}>{stateCell(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {attachments.length > 0 && <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '12px' }}>📎 {attachments.map(a => a.name).join(', ')}</div>}
            {stage === 'review' && <ExtraCcField value={ccText} onChange={setCcText} />}
            {stage === 'review' && toSend.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '16px 0 6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Preview as</span>
                  <select value={previewId} onChange={e => setPreviewId(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }}>
                    {toSend.map(p => <option key={p.speaker_id} value={p.speaker_id}>{p.name}</option>)}
                  </select>
                  {current && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Subject: <strong>{current.subject}</strong></span>}
                </div>
                {previewId && previewHtml ? <iframe title="Email preview" srcDoc={previewHtml} sandbox="" style={{ width: '100%', height: '320px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }} />
                  : <div style={{ color: 'var(--ink3)', fontSize: '13.5px' }}>Preparing the preview…</div>}
              </>
            )}
            {fatal && (
              <div style={{ color: 'var(--red)', fontSize: '14px', marginTop: '12px' }}>
                {fatal}
                {blocked.length > 0 && <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>{blocked.map((b, i) => <li key={i}>{b.message}{b.match ? ` — “${b.match}”` : ''}</li>)}</ul>}
              </div>
            )}
          </>
        )}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          {stage === 'done' && <div style={{ flex: 1, fontSize: '14.5px' }}><strong>{count('sent')}</strong> sent{count('skipped') > 0 && <> · <strong>{count('skipped')}</strong> skipped</>}{count('failed') > 0 && <> · <strong style={{ color: 'var(--red)' }}>{count('failed')}</strong> failed</>}</div>}
          {stage === 'review' && <Button variant="ghost" onClick={onClose}>Back to editing</Button>}
          {stage === 'review' && <Button variant="teal" onClick={run} disabled={!plan || toSend.length === 0 || 'error' in extra}>{toSend.length === 0 ? 'Nobody to send to' : `Send to ${toSend.length}`}</Button>}
          {stage === 'sending' && <Button variant="ghost" onClick={() => { stopRef.current = true; setStopping(true) }} disabled={stopping}>{stopping ? 'Stopping after this batch…' : 'Stop after this batch'}</Button>}
          {stage === 'done' && <Button variant="teal" onClick={() => { onFinished(count('sent') > 0); onClose() }}>Close</Button>}
        </div>
      </div>
    </div>
  )
}
