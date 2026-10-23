'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ExtraCcField from '@/app/components/ExtraCcField'
import { parseExtraCc } from '@/app/lib/email/extra-cc'
import { Button, Textarea } from '@/app/components/ui'

/* "Media interview request" (PR & Media): asks the selected speakers whether they will give media bites / interviews, each by email from their own producer,
   with a private link to a short form. Same shape as the Guest Invites bulk send: a review table first (who it goes to, from whom, and what will happen to each
   speaker — nothing is a surprise after pressing Send), then send in chunks with a per-speaker result. Speakers already asked can be sent again on purpose
   (tick "Send again"); speakers who already answered, or have no email, are shown and left out. The server re-checks everything. */

type Plan = { id: string; name: string; to: string | null; cc: string[]; from: string | null; state: 'ready' | 'asked' | 'answered' | 'no_email'; asked_at: string | null }
type Result = { id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }
const CHUNK = 8
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function MediaRequestDialog({ eventId, speakers, onClose, onFinished }: { eventId: string; speakers: { id: string; name: string }[]; onClose: () => void; onFinished: () => void }) {
  const [stage, setStage] = useState<'review' | 'sending' | 'done'>('review')
  const [plan, setPlan] = useState<Plan[] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [again, setAgain] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [ccText, setCcText] = useState('')
  const extra = parseExtraCc(ccText)
  const [sample, setSample] = useState<{ html: string; subject: string; speaker: string } | { error: string } | null>(null)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [fatal, setFatal] = useState<string | null>(null)
  const stopRef = useRef(false)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/events/pr/requests/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, speaker_ids: speakers.map(s => s.id) }) })
      .then(async r => { const d = await r.json().catch(() => ({})); if (cancelled) return; if (r.ok) setPlan(d.rows as Plan[]); else setPlanError(d.error ?? 'Could not check the speakers.') })
      .catch(() => { if (!cancelled) setPlanError('Could not check the speakers.') })
    return () => { cancelled = true }
  }, [eventId, speakers])

  const toSend = useMemo(() => (plan ?? []).filter(p => p.state === 'ready' || (p.state === 'asked' && again.has(p.id))), [plan, again])
  const sampleId = toSend[0]?.id

  useEffect(() => {
    if (!sampleId) return
    const t = setTimeout(() => {
      fetch('/api/events/pr/requests/compose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, speaker_id: sampleId, note }) })
        .then(async r => { const d = await r.json().catch(() => ({})); setSample(r.ok ? { html: d.html, subject: d.subject, speaker: speakers.find(s => s.id === sampleId)?.name ?? '' } : { error: d.error ?? 'Could not preview.' }) })
        .catch(() => setSample({ error: 'Could not preview.' }))
    }, 350)
    return () => clearTimeout(t)
  }, [eventId, sampleId, note, speakers])

  async function run() {
    setStage('sending'); stopRef.current = false; setFatal(null)
    // Two passes so "send again" speakers carry the resend flag and first-time ones never do.
    const groups: { ids: string[]; resend: boolean }[] = [
      { ids: toSend.filter(p => p.state === 'ready').map(p => p.id), resend: false },
      { ids: toSend.filter(p => p.state === 'asked').map(p => p.id), resend: true },
    ]
    for (const g of groups) {
      for (let i = 0; i < g.ids.length; i += CHUNK) {
        if (stopRef.current) break
        const res = await fetch('/api/events/pr/requests/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, speaker_ids: g.ids.slice(i, i + CHUNK), note, resend: g.resend, extra_cc: 'emails' in extra ? extra.emails : [] }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { setFatal(d.error ?? 'Could not send.'); stopRef.current = true; break }
        setResults(prev => { const n = { ...prev }; for (const r of d.results as Result[]) n[r.id] = r; return n })
      }
    }
    setStage('done')
  }

  const count = (s: Result['status']) => Object.values(results).filter(r => r.status === s).length
  const stateCell = (p: Plan) => {
    const r = results[p.id]
    if (r) return r.status === 'sent' ? <span style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>✓ Sent</span> : <span style={{ color: r.status === 'failed' ? 'var(--red)' : 'var(--amber)' }}>{r.status === 'failed' ? 'Failed' : 'Skipped'} — {r.reason}</span>
    if (stage === 'sending') return <span style={{ color: 'var(--ink4)' }}>{toSend.some(t => t.id === p.id) ? 'Waiting…' : '—'}</span>
    if (p.state === 'ready') return <span style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Will be sent</span>
    if (p.state === 'no_email') return <span style={{ color: 'var(--red)' }}>No email address — can’t send</span>
    if (p.state === 'answered') return <span style={{ color: 'var(--ink3)' }}>Already answered — left out</span>
    return (
      <label style={{ color: 'var(--amber)', display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={again.has(p.id)} onChange={() => setAgain(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} />
        Asked{p.asked_at ? ` on ${fmtDate(p.asked_at)}` : ''} — send again
      </label>
    )
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--ink3)', textTransform: 'uppercase' }
  const td: React.CSSProperties = { padding: '8px', fontSize: '13px', borderTop: '1px solid var(--border-light)', verticalAlign: 'top' }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', width: 'min(860px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '18px', fontWeight: 900, marginBottom: '4px' }}>Media interview request</div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '14px', lineHeight: 1.5 }}>
          Asks each speaker whether they will give media bites or interviews at the event, and when they are free. Each email comes from that speaker’s own producer (or from you when none is set) and has a private link to a short form.
        </div>

        {planError && <div style={{ color: 'var(--red)', fontSize: '13.5px', marginBottom: '12px' }}>{planError}</div>}
        {!plan && !planError && <div style={{ color: 'var(--ink3)', fontSize: '13.5px' }}>Checking the speakers…</div>}

        {plan && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
                <thead><tr><th style={th}>Speaker</th><th style={th}>To / Cc</th><th style={th}>From</th><th style={th}>{stage === 'review' ? 'What will happen' : 'Result'}</th></tr></thead>
                <tbody>
                  {plan.map(p => (
                    <tr key={p.id}>
                      <td style={{ ...td, fontWeight: 700 }}>{p.name}</td>
                      <td style={{ ...td, color: 'var(--ink2)', overflowWrap: 'anywhere' }}>{p.to ?? '—'}{p.cc.length > 0 && <span style={{ color: 'var(--ink4)' }}> · cc {p.cc.join(', ')}</span>}</td>
                      <td style={{ ...td, color: 'var(--ink2)' }}>{p.from ?? '—'}</td>
                      <td style={td}>{stateCell(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {stage === 'review' && (
              <>
                <ExtraCcField value={ccText} onChange={setCcText} />
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', margin: '16px 0 4px' }}>Extra note for everyone (optional)</label>
                <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={600} placeholder="e.g. Several TV channels have confirmed." />
                {sampleId && (
                  <>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', margin: '14px 0 6px' }}>
                      Preview{sample && !('error' in sample) ? ` — ${sample.speaker}` : ''}
                      {sample && !('error' in sample) && <span style={{ fontWeight: 500 }}> · Subject: <strong>{sample.subject}</strong></span>}
                    </div>
                    {!sample ? <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Preparing the preview…</div>
                      : 'error' in sample ? <div style={{ color: 'var(--red)', fontSize: '13.5px' }}>{sample.error}</div>
                      : <iframe title="Email preview" srcDoc={sample.html} sandbox="" style={{ width: '100%', height: '260px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }} />}
                    <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '6px' }}>
                      The subject is the speaker’s one thread per event, so this email joins their existing Outlook conversation with the producer. To change the wording for good, edit the template “Media Interview Interest Request” in <a href="/admin/email-templates" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>Admin → Email Templates ↗</a>; it applies to every request sent after you save.
                    </div>
                  </>
                )}
              </>
            )}
            {fatal && <div style={{ color: 'var(--red)', fontSize: '13.5px', marginTop: '10px' }}>{fatal}</div>}
          </>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          {stage === 'done' && <div style={{ flex: 1, fontSize: '14px' }}><strong>{count('sent')}</strong> sent{count('skipped') > 0 && <> · <strong>{count('skipped')}</strong> skipped</>}{count('failed') > 0 && <> · <strong style={{ color: 'var(--red)' }}>{count('failed')}</strong> failed</>}</div>}
          {stage === 'review' && <Button variant="ghost" onClick={onClose}>Cancel</Button>}
          {stage === 'review' && <Button variant="teal" onClick={run} disabled={!plan || toSend.length === 0 || !sample || 'error' in sample || 'error' in extra}>{toSend.length === 0 ? 'Nobody to send to' : `Send to ${toSend.length}`}</Button>}
          {stage === 'sending' && <Button variant="ghost" onClick={() => { stopRef.current = true; setStopping(true) }} disabled={stopping}>{stopping ? 'Stopping after this batch…' : 'Stop after this batch'}</Button>}
          {stage === 'done' && <Button variant="teal" onClick={() => { onFinished(); onClose() }}>Close</Button>}
        </div>
      </div>
    </div>
  )
}
