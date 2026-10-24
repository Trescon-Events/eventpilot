'use client'

import { useMemo, useState } from 'react'
import { flagPath } from '@/app/lib/proposals/countries'

/* The client's view of a batch of proposed speakers — ONE component used by the public review page (live, with approve / reject) and by the producer's
   "preview" step (read-only), so what the producer previews is exactly what the client sees. */

export type GalleryVideo = { url: string; title: string; channel: string | null; date: string | null; duration: string | null; thumbnail: string | null }
export type GalleryItem = {
  id: string; track_label: string | null
  card: { name: string; title: string | null; organization: string | null; nationality_iso2: string | null; linkedin_url: string | null; bio: string | null; videos: GalleryVideo[]; photo_url: string | null; logo_url: string | null; website_url: string | null }
  decision: { decision: 'approved' | 'rejected'; by: string; at: string; is_me: boolean } | null
  comments: { id: string; by: string; at: string; body: string; is_me: boolean }[]
}
export type GalleryData = {
  event_name: string; batch_name: string; shared_by_name: string | null; message: string | null; reviewer: { id: string; name: string }; colleagues: string[]
  actioned_by: { name: string; n: number }[]; totals: { total: number; approved: number; rejected: number }; tracks: { id: string; label: string | null }[]; items: GalleryItem[]
}
type Filter = 'all' | 'awaiting' | 'approved' | 'rejected'

export const GALLERY_STYLES = `
  .sp-shell { min-height: 100vh; background: var(--surface); font-family: var(--font-manrope), Manrope, sans-serif; color: var(--ink); }
  .sp-top { position: sticky; top: 0; z-index: 20; background: var(--card); border-bottom: 1px solid var(--border); padding: 10px clamp(12px, 3vw, 32px); display: grid; gap: 8px; }
  .sp-row { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; }
  .sp-title { font-size: clamp(17px, 2.4vw, 22px); font-weight: 900; margin: 0; line-height: 1.2; }
  .sp-sub { font-size: clamp(12px, 1.5vw, 13.5px); color: var(--ink3); }
  .sp-grow { flex: 1 1 auto; }
  .sp-chip { padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--border); background: transparent; color: var(--ink2); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .sp-chip.on { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .sp-select { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 13px; font-family: inherit; max-width: 100%; }
  .sp-body { padding: clamp(12px, 2.5vw, 28px) clamp(12px, 3vw, 32px) 80px; max-width: 1500px; margin: 0 auto; }
  .sp-banner { padding: 12px 16px; border-radius: 10px; font-size: 14px; line-height: 1.55; margin-bottom: 14px; background: var(--card); border: 1px solid var(--border); }
  .sp-grid { display: grid; gap: clamp(12px, 1.6vw, 22px); grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); }
  .sp-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .sp-card.approved { border-color: var(--teal); } .sp-card.rejected { border-color: var(--red); }
  .sp-track { font-size: 12px; font-weight: 700; color: var(--ink3); }
  .sp-head { display: flex; gap: 18px; align-items: flex-start; }
  .sp-side { width: 124px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  @media (max-width: 520px) { .sp-head { flex-direction: column; align-items: center; text-align: center; } }
  .sp-top.static { position: static; }
  .sp-photo { width: 104px; height: 104px; border-radius: 50%; object-fit: cover; background: var(--surface); border: 1px solid var(--border-light); flex-shrink: 0; }
  .sp-noimg { width: 104px; height: 104px; border-radius: 50%; background: var(--surface); border: 1px solid var(--border-light); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 900; color: var(--ink4); }
  .sp-name { font-size: 19px; font-weight: 900; line-height: 1.2; margin: 0; }
  .sp-role { font-size: 14px; color: var(--ink2); margin-top: 3px; line-height: 1.4; }
    .sp-flag { width: 40px; height: 30px; object-fit: cover; border-radius: 3px; border: 1px solid var(--border-light); }
  .sp-logo { width: 120px; height: 60px; padding: 4px; box-sizing: border-box; object-fit: contain; background: white; border: 1px solid var(--border-light); border-radius: 6px; }
  .sp-bio { font-size: 14.5px; line-height: 1.6; color: var(--ink2); margin: 0; }
  .sp-link { color: var(--teal); font-weight: 700; font-size: 14px; text-decoration: none; }
  .sp-videos { display: grid; gap: 8px; }
  .sp-video { display: flex; gap: 10px; align-items: center; text-decoration: none; color: var(--ink); border: 1px solid var(--border-light); border-radius: 10px; padding: 6px; }
  .sp-video img { width: 96px; height: 54px; object-fit: cover; border-radius: 6px; background: var(--surface); flex-shrink: 0; }
  .sp-video .ph { width: 96px; height: 54px; border-radius: 6px; background: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .sp-video b { font-size: 13px; line-height: 1.3; display: block; } .sp-video span { font-size: 12px; color: var(--ink3); }
  .sp-act { border-top: 1px solid var(--border-light); padding-top: 12px; display: grid; gap: 8px; }
  .sp-btns { display: flex; gap: 10px; flex-wrap: wrap; }
  .sp-btn { padding: 10px 20px; border-radius: 10px; border: none; background: var(--teal); color: white; font-weight: 800; font-size: 14px; cursor: pointer; font-family: inherit; }
  .sp-btn.reject { background: transparent; color: var(--red); border: 1.5px solid var(--red); }
  .sp-btn.ghost { background: transparent; color: var(--ink2); border: 1.5px solid var(--border); padding: 8px 14px; font-size: 13px; }
  .sp-btn[disabled] { opacity: 0.5; cursor: default; }
  .sp-text { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 14px; font-family: inherit; resize: vertical; box-sizing: border-box; }
  .sp-status { font-size: 13.5px; font-weight: 800; padding: 8px 12px; border-radius: 8px; }
  .sp-status.approved { background: var(--teal-light, var(--surface)); color: var(--teal-mid); } .sp-status.rejected { background: var(--surface); color: var(--red); }
  .sp-comment { font-size: 13.5px; line-height: 1.45; background: var(--surface); border-radius: 8px; padding: 8px 10px; } .sp-comment small { color: var(--ink3); display: block; margin-bottom: 2px; }
  .sp-err { color: var(--red); font-size: 13px; }
`

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const ytId = (u: string) => u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)?.[1] ?? null

export function ClientGallery({ data, token, preview, onChanged }: { data: GalleryData; token?: string; preview?: boolean; onChanged?: () => Promise<void> }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [track, setTrack] = useState('')
  const shown = useMemo(() => data.items.filter(i =>
    (filter === 'all' || (filter === 'awaiting' ? !i.decision : i.decision?.decision === filter)) && (!track || i.track_label === data.tracks.find(t => t.id === track)?.label)), [data, filter, track])
  const decided = data.totals.approved + data.totals.rejected
  const chip = (f: Filter, label: string, n: number) => <button key={f} className={`sp-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{label} ({n})</button>
  const others = data.actioned_by.filter(a => a.name !== data.reviewer.name)
  return (
    <div className="sp-shell" style={preview ? { minHeight: 0, borderRadius: '12px', overflow: 'hidden' } : undefined}>
      <style>{GALLERY_STYLES}</style>
      <div className={`sp-top${preview ? ' static' : ''}`}>
        <div className="sp-row">
          <div><h1 className="sp-title">Proposed speakers — {data.event_name}</h1><div className="sp-sub">{data.batch_name}{preview ? '' : ` · reviewing as ${data.reviewer.name}`}</div></div>
          <div className="sp-grow" />
          <div className="sp-sub"><strong>{decided}</strong> of {data.totals.total} decided</div>
        </div>
        <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border-light)' }}><div style={{ height: '5px', borderRadius: '3px', background: 'var(--teal)', width: `${data.totals.total ? (100 * decided) / data.totals.total : 0}%` }} /></div>
        <div className="sp-row">
          {chip('all', 'All', data.totals.total)}{chip('awaiting', 'Awaiting', data.totals.total - decided)}{chip('approved', 'Approved', data.totals.approved)}{chip('rejected', 'Rejected', data.totals.rejected)}
          {data.tracks.length > 1 && <select className="sp-select" value={track} onChange={e => setTrack(e.target.value)}><option value="">All tracks</option>{data.tracks.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>}
        </div>
      </div>
      <div className="sp-body">
        {data.message && <div className="sp-banner"><strong>{data.shared_by_name ?? 'Trescon'}:</strong> {data.message}</div>}
        {others.length > 0 && <div className="sp-banner">Already actioned by a colleague: {others.map(o => `${o.name} (${o.n} speaker${o.n === 1 ? '' : 's'})`).join(', ')}. Those speakers show who decided; you only need to decide on the rest.</div>}
        <div className="sp-grid">
          {shown.map(i => <SpeakerCard key={`${i.id}-${i.decision?.decision ?? ''}-${i.comments.length}`} item={i} token={token} preview={!!preview} onChanged={onChanged} />)}
        </div>
        {shown.length === 0 && <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)' }}>Nothing here.</div>}
      </div>
    </div>
  )
}

function SpeakerCard({ item, token, preview, onChanged }: { item: GalleryItem; token?: string; preview: boolean; onChanged?: () => Promise<void> }) {
  const c = item.card, d = item.decision
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const flag = flagPath(c.nationality_iso2)

  async function send(body: Record<string, unknown>) {
    if (preview || !token) return
    setBusy(true); setErr(null)
    const res = await fetch(`/api/public/speaker-proposals/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidate_id: item.id, ...body }) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(j.error ?? 'That did not work — please try again.'); if (j.already_actioned) await onChanged?.(); return }
    setComment(''); setChanging(false); setCommenting(false); await onChanged?.()
  }
  const canAct = !d || (d.is_me && changing)

  return (
    <div className={`sp-card${d ? ` ${d.decision}` : ''}`}>
      {item.track_label && <div className="sp-track">{item.track_label}</div>}
      <div className="sp-head">
        <div className="sp-side">
          {c.photo_url /* eslint-disable-next-line @next/next/no-img-element */ ? <img className="sp-photo" src={c.photo_url} alt={c.name} /> : <div className="sp-noimg">{c.name.charAt(0)}</div>}
          {c.logo_url /* eslint-disable-next-line @next/next/no-img-element */ && <img className="sp-logo" src={c.logo_url} alt={c.organization ?? ''} />}
          {flag /* eslint-disable-next-line @next/next/no-img-element */ && <img className="sp-flag" src={flag} alt="" />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="sp-name">{c.name}</h2>
          <div className="sp-role">{[c.title, c.organization].filter(Boolean).join(' · ')}</div>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px' }}>
            {c.website_url && <a className="sp-link" href={c.website_url} target="_blank" rel="noopener noreferrer">Company website ↗</a>}
            {c.linkedin_url && <a className="sp-link" href={c.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn profile ↗</a>}
          </div>
          {c.bio && <p className="sp-bio" style={{ marginTop: '10px' }}>{c.bio}</p>}
        </div>
      </div>
      {c.videos.length > 0 && (
        <div className="sp-videos">
          {c.videos.map(v => { const id = ytId(v.url); const thumb = v.thumbnail || (id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null); return (
            <a key={v.url} className="sp-video" href={v.url} target="_blank" rel="noopener noreferrer">
              {thumb /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={thumb} alt="" /> : <div className="ph">▶</div>}
              <div style={{ minWidth: 0 }}><b>{v.title.slice(0, 110)}</b><span>{[v.channel, v.date, v.duration].filter(Boolean).join(' · ')}</span></div>
            </a>) })}
        </div>
      )}

      <div className="sp-act">
        {d && <div className={`sp-status ${d.decision}`}>{d.decision === 'approved' ? '✓ Approved' : '✕ Rejected'} by {d.is_me ? 'you' : d.by} · {when(d.at)}</div>}
        {item.comments.map(m => <div key={m.id} className="sp-comment"><small>{m.is_me ? 'You' : m.by} · {when(m.at)}</small>{m.body}</div>)}
        {preview && <div className="sp-sub">Preview — approve, reject and comment are switched off here.</div>}
        {canAct && !preview && (<>
          <textarea className="sp-text" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment (optional)" />
          <div className="sp-btns">
            <button className="sp-btn" disabled={busy} onClick={() => void send({ action: 'decide', decision: 'approved', comment })}>Approve</button>
            <button className="sp-btn reject" disabled={busy} onClick={() => void send({ action: 'decide', decision: 'rejected', comment })}>Reject</button>
            {changing && <button className="sp-btn ghost" onClick={() => setChanging(false)}>Cancel</button>}
          </div>
        </>)}
        {d?.is_me && !changing && <div className="sp-btns"><button className="sp-btn ghost" onClick={() => setChanging(true)}>Change my decision</button></div>}
        {d && !canAct && (commenting ? (<>
          <textarea className="sp-text" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment" />
          <div className="sp-btns"><button className="sp-btn ghost" disabled={busy || !comment.trim()} onClick={() => void send({ action: 'comment', body: comment })}>Post comment</button><button className="sp-btn ghost" onClick={() => setCommenting(false)}>Cancel</button></div>
        </>) : !d.is_me ? <div className="sp-btns"><button className="sp-btn ghost" onClick={() => setCommenting(true)}>Add a comment</button></div> : null)}
        {err && <div className="sp-err">{err}</div>}
      </div>
    </div>
  )
}
