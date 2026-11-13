'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { categoryLabel } from '@/app/lib/content/public-figures-catalogue'

/* The review screen for public figures, shared by colleagues (signed in) and client approvers (personal link). Every answer saves at once and the page refreshes itself, so
   each reviewer sees what the others have said about each item as they say it. Answers are advice; the producer takes the final action. */

type Row = { label: string; display: string; percent?: number }
type Payload = { display?: string; title?: string; rows?: Row[]; text?: string }
type Kind = 'figure' | 'breakdown' | 'outcome'
type Decision = { reviewer_id: string; reviewer_name: string; mine: boolean; decision: 'approve' | 'reject' | 'suggest'; suggested_label: string | null; suggested_payload: Payload | null; comment: string | null; seen_label: string | null; seen_payload: Payload | null; decided_at: string }
type Item = { id: string; kind: Kind; category: string; group_label: string | null; label: string; payload: Payload; basis: string; source: string | null; decisions: Decision[] }
type View = {
  round: { id: string; audience: 'internal' | 'client'; status: 'open' | 'closed'; event_name: string | null }
  me: { id: string; name: string; done: boolean }
  reviewers: Array<{ id: string; name: string; done: boolean; answered: number }>
  items: Item[]
}

const summary = (kind: Kind, p: Payload): string => (kind === 'figure' ? (p.display || '–') : kind === 'outcome' ? (p.text || '–') : (p.rows ?? []).map(r => `${r.label} ${r.display}`).join(' · ') || '–')
const VERB = { approve: ['approved', 'var(--teal-mid)'], reject: ['rejected', 'var(--red)'], suggest: ['suggested a change', 'var(--amber)'] } as const

export default function FiguresReviewView({ url, onUnauthed }: { url: string; onUnauthed?: () => void }) {
  const [data, setData] = useState<View | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(url, { cache: 'no-store' }); const j = await r.json().catch(() => ({}))
    if (r.status === 401 || r.redirected) { onUnauthed?.(); return }
    if (!r.ok) { setErr(j.error || 'Could not load.'); return }
    setData(j); setErr(null)
  }, [url, onUnauthed])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
  useEffect(() => { void load() }, [load])
  // live: everyone's answers appear without a reload
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 6000)
    return () => clearInterval(t)
  }, [load])

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label); setErr(null)
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'That did not work.'); return null }
      await load(); return j
    } finally { setBusy(null) }
  }

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of data?.items ?? []) { const k = `${i.category}|${i.group_label ?? ''}`; m.set(k, [...(m.get(k) ?? []), i]) }
    return [...m.entries()]
  }, [data])

  if (err && !data) return <Shell><div className="fr-card" style={{ color: 'var(--red)' }}>{err}</div></Shell>
  if (!data) return <Shell><div className="fr-card">Loading…</div></Shell>
  const closed = data.round.status === 'closed'
  const mine = data.items.filter(i => i.decisions.some(d => d.mine)).length
  const internal = data.round.audience === 'internal'

  return (
    <Shell>
      <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', margin: 0 }}>{internal ? 'Review the post-event figures' : 'Figures for your approval'}{data.round.event_name ? `: ${data.round.event_name}` : ''}</h1>
      <div className="fr-card" style={{ fontSize: '14px', lineHeight: 1.6 }}>
        {internal
          ? 'For each figure, approve it, reject it with a reason, or suggest a different value. Your answer is saved as soon as you give it, and you can see what your colleagues have said. The producer makes the final decision.'
          : 'These are the figures and facts we would like to use in public documents (reports, the website, social posts, press). For each one, approve it, reject it with a reason, or suggest the wording you would like. Your answer is saved as soon as you give it, and you can see what your colleagues at the client have said.'}
        <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--ink3)' }}>
          You are signed in as <strong style={{ color: 'var(--ink)' }}>{data.me.name}</strong>. {data.reviewers.length > 1 && <>Also asked: {data.reviewers.filter(r => r.id !== data.me.id).map(r => `${r.name} (${r.answered}/${data.items.length}${r.done ? ', done' : ''})`).join(', ')}.</>}
        </div>
      </div>
      {err && <div className="fr-card" style={{ color: 'var(--red)' }}>{err}</div>}
      {closed && <div className="fr-card" style={{ fontWeight: 700 }}>This round has been closed. Thank you. Your answers are recorded.</div>}

      {groups.map(([key, items]) => {
        const [cat, group] = key.split('|')
        return (
          <section key={key} style={{ display: 'grid', gap: '10px' }}>
            <h2 style={{ fontSize: '13px', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', margin: '8px 0 0' }}>{categoryLabel(cat)}{group ? ` · ${group}` : ''}</h2>
            {items.map(i => <ItemCard key={i.id} item={i} closed={closed} editing={editing === i.id} setEditing={v => setEditing(v ? i.id : null)} busy={!!busy}
              onDecide={async b => { if (await post({ action: 'decide', figure_id: i.id, ...b }, i.id)) setEditing(null) }} />)}
          </section>
        )
      })}

      {!closed && (
        <div className="fr-card" style={{ display: 'grid', gap: '10px' }}>
          <div style={{ fontSize: '13.5px' }}>You have answered {mine} of {data.items.length}.{data.me.done && ' You marked yourself as done; you can still change an answer until the round closes.'}</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="fr-btn fr-ghost" disabled={!!busy || mine === data.items.length} onClick={() => post({ action: 'approve_all' }, 'all')}>Approve all remaining</button>
            <button className="fr-btn fr-go" disabled={!!busy || data.me.done} onClick={() => post({ action: 'done' }, 'done')}>{data.me.done ? 'Marked as done' : 'I am done'}</button>
          </div>
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

function Value({ kind, payload, label }: { kind: Kind; payload: Payload; label: string }) {
  return (
    <div>
      <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{label}</div>
      {kind === 'figure' && <div style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800 }}>{payload.display || '–'}</div>}
      {kind === 'outcome' && <div style={{ fontSize: '15px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{payload.text || '–'}</div>}
      {kind === 'breakdown' && (
        <div>
          {payload.title && <div style={{ fontWeight: 700, fontSize: '14px', margin: '2px 0 4px' }}>{payload.title}</div>}
          <table style={{ borderCollapse: 'collapse', fontSize: '14px' }}><tbody>{(payload.rows ?? []).map((r, i) => <tr key={i}><td style={{ padding: '2px 16px 2px 0' }}>{r.label}</td><td style={{ fontWeight: 700 }}>{r.display}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  )
}

function ItemCard({ item, closed, editing, setEditing, onDecide, busy }: { item: Item; closed: boolean; editing: boolean; setEditing: (v: boolean) => void; busy: boolean; onDecide: (b: Record<string, unknown>) => Promise<void> }) {
  const my = item.decisions.find(d => d.mine) ?? null
  const others = item.decisions.filter(d => !d.mine)
  const [comment, setComment] = useState(my?.comment ?? '')
  const [label, setLabel] = useState(my?.suggested_label ?? item.label)
  const [payload, setPayload] = useState<Payload>(my?.suggested_payload ?? item.payload)
  const [rejecting, setRejecting] = useState(false)
  const chip = my ? VERB[my.decision] : null
  const changedSince = (d: Decision) => !!d.seen_payload && JSON.stringify(d.seen_payload) !== JSON.stringify(item.payload)

  return (
    <div className="fr-card" style={{ display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: '15px' }}>{item.label}</strong>
        <span style={{ display: 'flex', gap: '8px', fontSize: '12px', fontWeight: 800 }}>
          {item.basis === 'estimate' && <span style={{ color: 'var(--amber)' }}>Estimate</span>}
          {chip && <span style={{ color: chip[1] }}>You {chip[0]}</span>}
        </span>
      </div>
      <Value kind={item.kind} payload={item.payload} label="As we would like to publish it" />
      {item.source && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Source: {item.source}</div>}

      {others.length > 0 && (
        <div style={{ display: 'grid', gap: '6px', borderTop: '1px solid var(--border-light)', paddingTop: '8px' }}>
          {others.map(d => (
            <div key={d.reviewer_id} style={{ fontSize: '13px', lineHeight: 1.5 }}>
              <strong>{d.reviewer_name}</strong> <span style={{ color: VERB[d.decision][1], fontWeight: 700 }}>{VERB[d.decision][0]}</span>
              {d.decision === 'suggest' && d.suggested_payload && <>: <strong>{summary(item.kind, d.suggested_payload)}</strong>{d.suggested_label && d.suggested_label !== item.label ? ` (as “${d.suggested_label}”)` : ''}</>}
              {d.comment && <span style={{ color: 'var(--ink2)' }}> — “{d.comment}”</span>}
              {changedSince(d) && <span style={{ color: 'var(--ink3)' }}> (they saw “{summary(item.kind, d.seen_payload as Payload)}”)</span>}
            </div>
          ))}
        </div>
      )}
      {my?.decision === 'suggest' && my.suggested_payload && <Value kind={item.kind} payload={my.suggested_payload} label={`Your suggestion${my.suggested_label && my.suggested_label !== item.label ? ` (“${my.suggested_label}”)` : ''}`} />}
      {my?.comment && <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>Your comment: {my.comment}</div>}

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
            <button className="fr-btn fr-go" disabled={busy || !comment.trim()} onClick={async () => { await onDecide({ decision: 'reject', comment }); setRejecting(false) }}>Reject</button>
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
    </div>
  )
}
