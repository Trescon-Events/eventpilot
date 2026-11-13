'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { categoryLabel } from '@/app/lib/content/public-figures-catalogue'

/* Review page for public figures (docs/build_suggestions/public-figures.md §6.3). Token link, no login. The reviewer sees label, value (or breakdown rows, or outcome text)
   and whether a figure is an estimate. Never the source, notes, evidence or owner. Per item: Approve, Reject (comment required) or Suggest an edit. Progress saves as they go;
   the round closes on Submit. Responsive, fluid type. */

type Row = { label: string; display: string; percent?: number }
type Payload = { display?: string; title?: string; rows?: Row[]; text?: string }
type Decision = { decision: 'approve' | 'reject' | 'suggest'; suggested_label: string | null; suggested_payload: Payload | null; comment: string | null }
type Item = { id: string; kind: 'figure' | 'breakdown' | 'outcome'; category: string; group_label: string | null; label: string; payload: Payload; basis: string; decision: Decision | null }
type View = { status: 'open' | 'closed'; audience: 'internal' | 'client'; event_name: string | null; reviewer_name: string | null; items: Item[] }

export default function FiguresReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<View | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const url = `/api/public/figures-review/${encodeURIComponent(token)}`

  const load = useCallback(async () => {
    const r = await fetch(url, { cache: 'no-store' }); const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Not found.'); return }
    setData(j); setErr(null)
  }, [url])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label); setErr(null)
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'That did not work.'); return null }
      return j
    } finally { setBusy(null) }
  }

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of data?.items ?? []) { const k = `${i.category}|${i.group_label ?? ''}`; m.set(k, [...(m.get(k) ?? []), i]) }
    return [...m.entries()]
  }, [data])

  if (err && !data) return <Shell><div className="fr-card" style={{ color: 'var(--red)' }}>{err}</div></Shell>
  if (!data) return <Shell><div className="fr-card">Loading…</div></Shell>
  const closed = data.status === 'closed' || !!done
  const decided = data.items.filter(i => i.decision).length

  return (
    <Shell>
      <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', margin: 0 }}>Figures for your approval{data.event_name ? `: ${data.event_name}` : ''}</h1>
      <div className="fr-card" style={{ fontSize: '14px', lineHeight: 1.6 }}>
        These are the figures and facts we would like to use in public documents (reports, the website, social posts, press). For each one, approve it, reject it with a reason, or suggest the wording you would like. Your progress is saved as you go; press <strong>Submit</strong> when you are finished.
      </div>
      {err && <div className="fr-card" style={{ color: 'var(--red)' }}>{err}</div>}
      {done && <div className="fr-card" style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>{done}</div>}
      {data.status === 'closed' && !done && <div className="fr-card">This review has already been submitted. Thank you.</div>}

      {groups.map(([key, items]) => {
        const [cat, group] = key.split('|')
        return (
          <section key={key} style={{ display: 'grid', gap: '10px' }}>
            <h2 style={{ fontSize: '13px', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', margin: '8px 0 0' }}>{categoryLabel(cat)}{group ? ` · ${group}` : ''}</h2>
            {items.map(i => (
              <ItemCard key={i.id} item={i} closed={closed} editing={editing === i.id} setEditing={v => setEditing(v ? i.id : null)} busy={!!busy}
                onDecide={async (b) => { if (await post({ action: 'decide', figure_id: i.id, ...b }, i.id)) { setEditing(null); await load() } }} />
            ))}
          </section>
        )
      })}

      {!closed && (
        <div className="fr-card" style={{ display: 'grid', gap: '10px' }}>
          <div style={{ fontSize: '13.5px' }}>{decided} of {data.items.length} decided.</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="fr-btn fr-ghost" disabled={!!busy || decided === data.items.length} onClick={async () => { if (await post({ action: 'approve_all' }, 'all')) await load() }}>Approve all remaining</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <input className="fr-in" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} aria-label="Your name" />
            <input className="fr-in" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Your email" type="email" />
          </div>
          <div><button className="fr-btn fr-go" disabled={!!busy || !name.trim() || !email.trim()} onClick={async () => {
            const j = await post({ action: 'submit', reviewer_name: name, reviewer_email: email }, 'submit')
            if (j) setDone(`Thank you. ${j.approved} approved${j.suggested ? `, ${j.suggested} with a suggestion` : ''}${j.rejected ? `, ${j.rejected} rejected` : ''}${j.undecided ? `, ${j.undecided} left undecided` : ''}.`)
          }}>{busy === 'submit' ? 'Submitting…' : 'Submit'}</button></div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: 'clamp(12px, 4vw, 40px)', fontFamily: 'system-ui, sans-serif', color: 'var(--ink)' }}>
      <style>{`.fr-card{background:var(--card);border:1px solid var(--border-light);border-radius:12px;padding:clamp(12px,2.5vw,20px)} .fr-btn{padding:9px 16px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--ink);font-weight:700;font-size:clamp(13px,2.4vw,14px);cursor:pointer} .fr-btn:disabled{opacity:.5;cursor:default} .fr-go{background:var(--teal-mid);color:var(--card);border-color:var(--teal-mid)} .fr-ghost{background:none} .fr-in{padding:9px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--card);color:var(--ink);width:100%;box-sizing:border-box}`}</style>
      <div style={{ maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '14px' }}>{children}</div>
    </div>
  )
}

function Value({ item, payload, label }: { item: Pick<Item, 'kind' | 'basis'>; payload: Payload; label: string }) {
  return (
    <div>
      <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{label}</div>
      {item.kind === 'figure' && <div style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800 }}>{payload.display || '–'}</div>}
      {item.kind === 'outcome' && <div style={{ fontSize: '15px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{payload.text || '–'}</div>}
      {item.kind === 'breakdown' && (
        <div>
          {payload.title && <div style={{ fontWeight: 700, fontSize: '14px', margin: '2px 0 4px' }}>{payload.title}</div>}
          <table style={{ borderCollapse: 'collapse', fontSize: '14px' }}><tbody>{(payload.rows ?? []).map((r, i) => <tr key={i}><td style={{ padding: '2px 16px 2px 0' }}>{r.label}</td><td style={{ fontWeight: 700 }}>{r.display}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  )
}

function ItemCard({ item, closed, editing, setEditing, onDecide, busy }: { item: Item; closed: boolean; editing: boolean; setEditing: (v: boolean) => void; busy: boolean; onDecide: (b: Record<string, unknown>) => Promise<void> }) {
  const [comment, setComment] = useState(item.decision?.comment ?? '')
  const [label, setLabel] = useState(item.decision?.suggested_label ?? item.label)
  const [payload, setPayload] = useState<Payload>(item.decision?.suggested_payload ?? item.payload)
  const [rejecting, setRejecting] = useState(false)
  const d = item.decision
  const chip = d ? { approve: ['Approved', 'var(--teal-mid)'], reject: ['Rejected', 'var(--red)'], suggest: ['Suggestion sent', 'var(--amber)'] }[d.decision] : null

  return (
    <div className="fr-card" style={{ display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: '15px' }}>{item.label}</strong>
        <span style={{ display: 'flex', gap: '8px', fontSize: '12px', fontWeight: 800 }}>
          {item.basis === 'estimate' && <span style={{ color: 'var(--amber)' }}>Estimate</span>}
          {chip && <span style={{ color: chip[1] }}>{chip[0]}</span>}
        </span>
      </div>
      <Value item={item} payload={item.payload} label="As we would like to publish it" />
      {d?.decision === 'suggest' && d.suggested_payload && <Value item={item} payload={d.suggested_payload} label={`Your suggestion${d.suggested_label && d.suggested_label !== item.label ? ` (“${d.suggested_label}”)` : ''}`} />}
      {d?.comment && <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>Your comment: {d.comment}</div>}

      {!closed && !editing && !rejecting && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="fr-btn fr-go" disabled={busy} onClick={() => onDecide({ decision: 'approve' })}>Approve</button>
          <button className="fr-btn" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>
          <button className="fr-btn" disabled={busy} onClick={() => setEditing(true)}>Suggest an edit</button>
        </div>
      )}
      {!closed && rejecting && (
        <div style={{ display: 'grid', gap: '8px' }}>
          <textarea className="fr-in" rows={3} placeholder="Why should this not be used? (required)" value={comment} onChange={e => setComment(e.target.value)} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="fr-btn fr-go" disabled={busy || !comment.trim()} onClick={() => onDecide({ decision: 'reject', comment })}>Reject</button>
            <button className="fr-btn fr-ghost" onClick={() => setRejecting(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!closed && editing && (
        <div style={{ display: 'grid', gap: '8px' }}>
          <input className="fr-in" value={label} onChange={e => setLabel(e.target.value)} aria-label="Label" />
          {item.kind === 'figure' && <input className="fr-in" value={payload.display ?? ''} onChange={e => setPayload({ display: e.target.value })} aria-label="Value" />}
          {item.kind === 'outcome' && <textarea className="fr-in" rows={4} value={payload.text ?? ''} onChange={e => setPayload({ text: e.target.value })} aria-label="Wording" />}
          {item.kind === 'breakdown' && (
            <div style={{ display: 'grid', gap: '6px' }}>
              <input className="fr-in" value={payload.title ?? ''} onChange={e => setPayload({ ...payload, title: e.target.value })} aria-label="Title" />
              {(payload.rows ?? []).map((r, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '6px' }}>
                  <input className="fr-in" value={r.label} onChange={e => setPayload({ ...payload, rows: (payload.rows ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label="Row label" />
                  <input className="fr-in" value={r.display} onChange={e => setPayload({ ...payload, rows: (payload.rows ?? []).map((x, j) => (j === i ? { ...x, display: e.target.value, percent: undefined } : x)) })} aria-label="Row value" />
                </div>
              ))}
            </div>
          )}
          <textarea className="fr-in" rows={2} placeholder="Comment (optional)" value={comment} onChange={e => setComment(e.target.value)} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="fr-btn fr-go" disabled={busy} onClick={() => onDecide({ decision: 'suggest', suggested_label: label, suggested_payload: payload, comment })}>Send suggestion</button>
            <button className="fr-btn fr-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!closed && d && !editing && !rejecting && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>You can change your decision until you submit.</div>}
    </div>
  )
}
