'use client'

import { useEffect, useState, use } from 'react'

/* Client approval page for a Copy Library bundle (docs/build_suggestions/copy-library.md §3). Token link, read-only list of items, Approve all or Request changes
   with a comment. Same public-route family as the announcement review page. Responsive: fluid type, wrapping buttons, no fixed widths. */

type Data = { status: string; sent_at: string; decided_at: string | null; client_comment: string | null; owner_name: string | null; items: Array<{ id: string; label: string; length: string; phase: string; text: string }> }
const PHASE = { pre: 'before the event', post: 'after the event', any: '' } as const
const LEN: Record<string, string> = { one_liner: 'one-liner', short: 'short', medium: 'medium', long: 'long', x: 'X', 'n/a': '' }

export default function CopyReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/public/copy-review/${encodeURIComponent(token)}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Not found.'); setData(j) }).catch(e => setErr(e.message))
  }, [token])

  async function decide(decision: 'approved' | 'changes_requested') {
    setBusy(true)
    try {
      const r = await fetch(`/api/public/copy-review/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, comment }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'That did not work.'); return }
      setDone(decision === 'approved' ? 'Thank you. The copy is approved.' : 'Thank you. We will revise it and send it back to you.')
    } finally { setBusy(false) }
  }

  const decided = data && data.status !== 'sent'
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: 'clamp(12px, 4vw, 40px)', fontFamily: 'system-ui, sans-serif', color: 'var(--ink)' }}>
      <style>{`.cl-card{background:var(--card);border:1px solid var(--border-light);border-radius:12px;padding:clamp(12px,2.5vw,20px)} .cl-btn{padding:10px 18px;border-radius:8px;border:none;font-weight:700;font-size:clamp(13px,2.4vw,15px);cursor:pointer} .cl-btn:disabled{opacity:.5;cursor:default}`}</style>
      <div style={{ maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '14px' }}>
        <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', margin: 0 }}>Copy for your approval{data?.owner_name ? `: ${data.owner_name}` : ''}</h1>
        {err && <div className="cl-card" style={{ color: 'var(--red)' }}>{err}</div>}
        {!data && !err && <div className="cl-card">Loading…</div>}
        {data && (
          <>
            <p style={{ margin: 0, color: 'var(--ink2)', fontSize: 'clamp(13px, 2.4vw, 15px)' }}>Please read each item below. Once approved, this wording is the only version our tools will use. You can approve all of it, or ask for changes with one comment.</p>
            {data.items.map(i => (
              <div key={i.id} className="cl-card">
                <div style={{ fontWeight: 800, fontSize: 'clamp(14px, 2.6vw, 16px)' }}>{i.label}{(LEN[i.length] || PHASE[i.phase as keyof typeof PHASE]) ? <span style={{ fontWeight: 500, color: 'var(--ink3)' }}> · {[LEN[i.length], PHASE[i.phase as keyof typeof PHASE]].filter(Boolean).join(', ')}</span> : null}</div>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: '8px', lineHeight: 1.55, fontSize: 'clamp(13px, 2.4vw, 15px)' }}>{i.text}</div>
              </div>
            ))}
            {done || decided ? (
              <div className="cl-card" style={{ fontWeight: 700 }}>
                {done ?? (data.status === 'approved' ? 'This copy has been approved.' : 'Changes were requested on this copy.')}
                {!done && data.client_comment && <div style={{ fontWeight: 400, marginTop: '6px', whiteSpace: 'pre-wrap' }}>“{data.client_comment}”</div>}
              </div>
            ) : (
              <div className="cl-card" style={{ display: 'grid', gap: '10px' }}>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} placeholder="Comment (required if you request changes)" style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', font: 'inherit' }} />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button className="cl-btn" style={{ background: 'var(--teal-mid)', color: 'var(--card)' }} disabled={busy} onClick={() => decide('approved')}>Approve all</button>
                  <button className="cl-btn" style={{ background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--border)' }} disabled={busy || !comment.trim()} onClick={() => decide('changes_requested')}>Request changes</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
