'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { looksLikeSkip } from '@/app/lib/badges/skip-intent'

/* Client approval of speaker badges (2026-10-21) — the page a client opens from the email link. No login; the private link in the URL is the key.
   A gallery of every badge (built for 50–100+ at a time, on a phone, a laptop or a large desktop), a comment box and a Reject button under each, and one
   approve button that reads "Approved with comments" once any comment is saved. Only one approver needs to act: whoever does first settles it, and
   anyone opening their own link afterwards sees who acted and what they decided (read-only).
   Responsive on purpose: the grid is auto-fill/minmax so it simply adds columns on big screens; the header collapses; nothing is a fixed width. */

type Item = { id: string; name: string | null; title: string | null; company: string | null; preview_url: string | null; comment: string | null; rejected: boolean }
type Data = {
  quantity?: number | null

  event_name: string; batch_name: string; sent_by_name: string | null; sent_at: string; message: string | null; recipient_name: string
  canvas: { width: number; height: number }; status: 'pending' | 'approved' | 'approved_with_comments'
  resolved: { by_name: string | null; at: string | null; status: string; rejected_count: number; comment_count: number; is_me: boolean } | null
  items: Item[]
}
type Filter = 'all' | 'commented' | 'rejected'

const STYLES = `
  .ba-shell { min-height: 100vh; background: var(--surface); font-family: var(--font-manrope), Manrope, sans-serif; color: var(--ink); }
  .ba-top { position: sticky; top: 0; z-index: 20; background: var(--card); border-bottom: 1px solid var(--border); padding: 10px clamp(12px, 3vw, 32px); display: grid; gap: 8px; }
  .ba-row { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; }
  .ba-title { font-size: clamp(16px, 2.4vw, 22px); font-weight: 900; margin: 0; line-height: 1.2; }
  .ba-sub { font-size: clamp(12px, 1.5vw, 13.5px); color: var(--ink3); }
  .ba-grow { flex: 1 1 auto; }
  .ba-input { padding: 9px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 14px; font-family: inherit; min-width: 0; }
  .ba-chip { padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--border); background: transparent; color: var(--ink2); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .ba-chip.on { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .ba-btn { padding: 10px 18px; border-radius: 10px; border: none; background: var(--teal); color: white; font-weight: 800; font-size: 14px; cursor: pointer; font-family: inherit; }
  .ba-btn[disabled] { opacity: 0.5; cursor: default; }
  .ba-btn.ghost { background: transparent; color: var(--ink2); border: 1.5px solid var(--border); }
  .ba-btn.red { background: transparent; color: var(--red); border: 1.5px solid var(--red); padding: 7px 12px; font-size: 12.5px; }
  .ba-btn.small { padding: 7px 12px; font-size: 12.5px; }
  .ba-body { padding: clamp(12px, 2.5vw, 28px) clamp(12px, 3vw, 32px) 80px; }
  .ba-banner { padding: 12px 16px; border-radius: 10px; font-size: 14px; line-height: 1.55; margin-bottom: 16px; }
  .ba-grid { display: grid; gap: clamp(12px, 1.6vw, 22px); grid-template-columns: repeat(auto-fill, minmax(clamp(200px, 21vw, 300px), 1fr)); }
  @media (max-width: 520px) { .ba-grid { grid-template-columns: 1fr; } }
  .ba-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
  .ba-card.rejected { border-color: var(--red); }
  .ba-card.rejected .ba-img { opacity: 0.35; filter: grayscale(1); }
  .ba-img { width: 100%; display: block; background: var(--surface2); object-fit: contain; cursor: zoom-in; }
  .ba-meta { padding: 10px 12px 12px; display: grid; gap: 8px; }
  .ba-name { font-size: 14px; font-weight: 800; line-height: 1.25; }
  .ba-co { font-size: 12px; color: var(--ink3); line-height: 1.3; }
  .ba-text { width: 100%; box-sizing: border-box; resize: vertical; min-height: 54px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 13px; font-family: inherit; }
  .ba-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ba-tag { font-size: 11.5px; font-weight: 800; }
  .ba-modal { position: fixed; inset: 0; background: rgba(0,0,0,.62); z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .ba-box { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 22px; width: min(480px, 100%); }
  .ba-light { position: fixed; inset: 0; background: rgba(0,0,0,.88); z-index: 70; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .ba-light img { max-width: 94vw; max-height: 88vh; object-fit: contain; background: white; border-radius: 6px; }
`

export default function BadgeApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})   // unsaved comment text per badge
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState('')   // optional overall note sent with the approval
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  const api = `/api/public/badge-approval/${token}`

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error ?? 'Could not load this page.'); return }
    setData(d); setItems(d.items)
  }, [api])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  const pending = data?.status === 'pending'
  const saved = (i: Item) => (i.comment ?? '').trim()
  const typed = (i: Item) => (drafts[i.id] ?? i.comment ?? '').trim()
  // comments that read like "no need to print this one" on a badge that is not rejected: the client may not realise Reject is what stops it being printed
  const skipLike = items.filter(i => !i.rejected && looksLikeSkip(typed(i)))
  const dirty = (i: Item) => drafts[i.id] !== undefined && drafts[i.id].trim() !== saved(i)
  const commentCount = items.filter(i => saved(i)).length
  const rejectedCount = items.filter(i => i.rejected).length
  const withComments = commentCount > 0 || Object.keys(drafts).some(id => (drafts[id] ?? '').trim())

  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok && d.already_actioned) { await load(); setNotice(null) }
    return { ok: res.ok, data: d }
  }
  async function saveComment(i: Item) {
    const text = (drafts[i.id] ?? saved(i)).trim()
    setSaving(s => ({ ...s, [i.id]: true }))
    const r = await post({ action: 'save', item_id: i.id, comment: text })
    setSaving(s => ({ ...s, [i.id]: false }))
    if (!r.ok) { setNotice(String(r.data.error ?? 'Could not save that comment.')); return false }
    setItems(prev => prev.map(x => (x.id === i.id ? { ...x, comment: text || null } : x)))
    setDrafts(d => { const n = { ...d }; delete n[i.id]; return n })
    return true
  }
  async function toggleReject(i: Item) {
    const next = !i.rejected
    setItems(prev => prev.map(x => (x.id === i.id ? { ...x, rejected: next } : x)))
    const r = await post({ action: 'save', item_id: i.id, rejected: next })
    if (!r.ok) { setItems(prev => prev.map(x => (x.id === i.id ? { ...x, rejected: !next } : x))); setNotice(String(r.data.error ?? 'Could not save that.')) }
  }
  async function submit() {
    setBusy(true); setNotice(null)
    for (const i of items.filter(dirty)) { if (!(await saveComment(i))) { setBusy(false); setConfirm(false); return } }
    const r = await post({ action: 'submit', note: note.trim() || null })
    setBusy(false); setConfirm(false)
    if (!r.ok) { setNotice(String(r.data.error ?? 'Could not submit.')); return }
    await load(); window.scrollTo({ top: 0 })
  }

  const shown = useMemo(() => items.filter(i => {
    if (search.trim() && !`${i.name ?? ''} ${i.company ?? ''} ${i.title ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (filter === 'commented') return !!saved(i)
    if (filter === 'rejected') return i.rejected
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saved() reads items
  }), [items, search, filter])

  // Lightbox keyboard: arrows and Escape.
  const shownRef = useRef(shown)
  useEffect(() => { shownRef.current = shown }, [shown])
  useEffect(() => {
    if (zoom === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setZoom(null)
      if (e.key === 'ArrowRight') setZoom(z => (z === null ? z : Math.min(z + 1, shownRef.current.length - 1)))
      if (e.key === 'ArrowLeft') setZoom(z => (z === null ? z : Math.max(z - 1, 0)))
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  if (error) return <div className="ba-shell"><style>{STYLES}</style><div className="ba-body" style={{ maxWidth: '560px', margin: '0 auto', paddingTop: '60px', fontSize: '15px', lineHeight: 1.6 }}>{error}</div></div>
  if (!data) return <div className="ba-shell"><style>{STYLES}</style><div className="ba-body" style={{ color: 'var(--ink3)' }}>Loading…</div></div>

  const r = data.resolved
  const ratio = `${data.canvas.width} / ${data.canvas.height}`
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

  return (
    <div className="ba-shell">
      <style>{STYLES}</style>
      <div className="ba-top">
        <div className="ba-row">
          <div>
            <h1 className="ba-title">{data.event_name} — badges</h1>
            <div className="ba-sub">{data.batch_name} · {data.quantity ? `one design, ${data.quantity} to be printed` : `${items.length} badge${items.length === 1 ? '' : 's'}`}{pending ? ` · ${commentCount} comment${commentCount === 1 ? '' : 's'} · ${rejectedCount} rejected` : ''}</div>
          </div>
          <div className="ba-grow" />
          {pending && <button className="ba-btn" onClick={() => setConfirm(true)} disabled={busy}>{withComments ? 'Approved with comments' : 'Approved'}</button>}
        </div>
        <div className="ba-row">
          <input className="ba-input" style={{ flex: '1 1 200px', maxWidth: '340px' }} placeholder="Search by name or company…" value={search} onChange={e => setSearch(e.target.value)} />
          {(['all', 'commented', 'rejected'] as Filter[]).map(f => (
            <button key={f} className={`ba-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? `All (${items.length})` : f === 'commented' ? `With comments (${commentCount})` : `Rejected (${rejectedCount})`}</button>
          ))}
          <span className="ba-sub">Showing {shown.length}</span>
        </div>
      </div>

      <div className="ba-body">
        {notice && <div className="ba-banner" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>{notice}</div>}
        {pending && (
          <div className="ba-banner" style={{ background: 'var(--surface2)', color: 'var(--ink2)' }}>
            Dear {data.recipient_name.split(' ')[0]}, {data.sent_by_name ?? 'the team'} has sent you these badges for approval. Look through them, add a comment under any badge, or <strong>Reject</strong> a badge that should not be printed. When you are done, press the button at the top. Only one of you needs to approve; if a colleague already has, you will see their decision instead.
            {data.message && <div style={{ marginTop: '8px', fontStyle: 'italic' }}>“{data.message}”</div>}
          </div>
        )}
        {r && (
          <div className="ba-banner" style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
            <strong>{r.is_me ? 'You' : (r.by_name ?? 'A colleague')} {r.status === 'approved_with_comments' ? 'approved these badges, with comments' : 'approved these badges'}</strong>{r.at ? ` on ${fmt(r.at)}` : ''}.
            {r.rejected_count > 0 && <> {r.rejected_count} badge{r.rejected_count === 1 ? ' was' : 's were'} rejected and will not be printed.</>}
            {r.comment_count > 0 && <> {r.comment_count} comment{r.comment_count === 1 ? '' : 's'}.</>}
            {' '}{r.is_me ? 'Thank you — nothing more is needed.' : 'No further action is needed from you; this is what was decided.'}
          </div>
        )}

        <div className="ba-grid">
          {shown.map((i, idx) => (
            <div key={i.id} className={`ba-card${i.rejected ? ' rejected' : ''}`}>
              {i.preview_url
                // eslint-disable-next-line @next/next/no-img-element -- remote storage URL, lazy-loaded
                ? <img className="ba-img" style={{ aspectRatio: ratio }} src={i.preview_url} alt={i.name ?? 'Badge'} loading="lazy" decoding="async" onClick={() => setZoom(idx)} />
                : <div className="ba-img" style={{ aspectRatio: ratio, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink4)', fontSize: '12px' }}>No preview</div>}
              <div className="ba-meta">
                <div>
                  <div className="ba-name">{i.name ?? '—'}</div>
                  <div className="ba-co">{[i.title, i.company].filter(Boolean).join(' · ')}</div>
                </div>
                {i.rejected && <div className="ba-tag" style={{ color: 'var(--red)' }}>Rejected — will not be printed</div>}
                {pending ? (
                  <>
                    <textarea className="ba-text" placeholder="Add a comment (optional)" value={drafts[i.id] ?? i.comment ?? ''} onChange={e => setDrafts(d => ({ ...d, [i.id]: e.target.value }))} maxLength={1000} />
                    <div className="ba-actions">
                      <button className="ba-btn ghost small" disabled={!dirty(i) || saving[i.id]} onClick={() => void saveComment(i)}>{saving[i.id] ? 'Saving…' : 'Save comment'}</button>
                      {!dirty(i) && saved(i) && <span className="ba-tag" style={{ color: 'var(--success)' }}>✓ Saved</span>}
                      <span className="ba-grow" />
                      <button className="ba-btn red" onClick={() => void toggleReject(i)}>{i.rejected ? 'Undo reject' : 'Reject'}</button>
                    </div>
                    {!i.rejected && looksLikeSkip(typed(i)) && (
                      <div style={{ fontSize: '13px', lineHeight: 1.45, border: '2px solid var(--amber)', borderRadius: '8px', padding: '8px 10px', background: 'var(--surface)' }}>
                        <strong>Should this badge be left out of printing?</strong> A comment alone does not stop it — it will still be printed unless you press <strong>Reject</strong>.
                        <div style={{ marginTop: '6px' }}><button className="ba-btn red small" onClick={() => void (async () => { if (dirty(i)) await saveComment(i); await toggleReject(i) })()}>Yes, reject this badge</button></div>
                      </div>
                    )}
                  </>
                ) : (
                  saved(i) && <div style={{ fontSize: '13px', background: 'var(--surface)', borderRadius: '8px', padding: '8px 10px', lineHeight: 1.45 }}>“{saved(i)}”</div>
                )}
              </div>
            </div>
          ))}
        </div>
        {shown.length === 0 && <div className="ba-sub" style={{ padding: '30px 0' }}>No badges match.</div>}
      </div>

      {confirm && (
        <div className="ba-modal" onClick={() => !busy && setConfirm(false)}>
          <div className="ba-box" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '17px', fontWeight: 900, marginBottom: '8px' }}>{withComments || note.trim() ? 'Approve with comments?' : 'Approve these badges?'}</div>
            <div style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: '16px' }}>
              {items.length - rejectedCount} badge{items.length - rejectedCount === 1 ? '' : 's'} will go to print.
              {rejectedCount > 0 && <> <strong>{rejectedCount} rejected badge{rejectedCount === 1 ? '' : 's'} will not be printed.</strong></>}
              {withComments && <> Your comments go to the team with your approval.</>} Your colleagues will see that you responded.
            </div>
            {skipLike.length > 0 && (
              <div style={{ border: '2px solid var(--amber)', borderRadius: '10px', padding: '10px 12px', marginBottom: '14px', fontSize: '13.5px', lineHeight: 1.5, background: 'var(--surface)' }}>
                <strong>{skipLike.length} comment{skipLike.length === 1 ? '' : 's'} say{skipLike.length === 1 ? 's' : ''} a badge is not needed, but {skipLike.length === 1 ? 'it is' : 'they are'} not rejected, so {skipLike.length === 1 ? 'it' : 'they'} will be printed:</strong> {skipLike.map(i => i.name).join(', ')}.
                <div style={{ marginTop: '8px' }}><button className="ba-btn red small" disabled={busy} onClick={() => void (async () => { for (const i of skipLike) { if (dirty(i)) await saveComment(i); await toggleReject(i) } })()}>Reject {skipLike.length === 1 ? 'this badge' : `these ${skipLike.length} badges`}</button></div>
              </div>
            )}
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '6px' }}>Add a note for the team (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 2000))} disabled={busy} rows={3} placeholder="e.g. Thank you, all good to print." style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', marginBottom: '16px' }} />
            <div className="ba-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ba-btn ghost" onClick={() => setConfirm(false)} disabled={busy}>Keep reviewing</button>
              <button className="ba-btn" onClick={() => void submit()} disabled={busy}>{busy ? 'Sending…' : withComments || note.trim() ? 'Yes, approved with comments' : 'Yes, approved'}</button>
            </div>
          </div>
        </div>
      )}

      {zoom !== null && shown[zoom] && (
        <div className="ba-light" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote storage URL */}
          {shown[zoom].preview_url && <img src={shown[zoom].preview_url!} alt={shown[zoom].name ?? 'Badge'} onClick={e => e.stopPropagation()} />}
          <div style={{ position: 'fixed', bottom: 16, left: 0, right: 0, textAlign: 'center', color: 'white', fontSize: '14px' }}>
            {shown[zoom].name} · {zoom + 1} / {shown.length} · ← → to move, Esc to close
          </div>
        </div>
      )}
    </div>
  )
}
