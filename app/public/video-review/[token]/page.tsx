'use client'

import { use, useCallback, useEffect, useState } from 'react'

/* Review of a session video before it goes public (2026-11-27) — opened from the review email. No login: the private link is the key.
   Watch it (the unlisted YouTube copy, or EventPilot's copy while YouTube keeps API uploads private), check title / description / thumbnail,
   then Approve, Approve with comments, or Request changes. Internal reviews need everyone; a client review is settled by the first answer. */

type Data = {
  layer: 'internal' | 'client'; event_name: string; session_title: string; recipient_name: string
  title: string; description: string; thumbnail_url: string | null
  youtube_id: string | null; watch_url: string | null; video_url: string | null
  round_status: string; replaced: boolean; resolved_by_name: string | null
  my_status: string; my_comment: string | null; others: Array<{ name: string; status: string; comment: string | null }>
  sent_by_name: string | null; rule: string
}

const LABEL: Record<string, string> = { approved: 'Approved', approved_with_comments: 'Approved with comments', changes_requested: 'Changes requested', pending: 'Not answered yet' }

const STYLES = `
  .vr-shell { min-height: 100vh; background: var(--surface); color: var(--ink); font-family: var(--font-manrope), Manrope, system-ui, sans-serif; padding: clamp(16px, 4vw, 40px) 16px 80px; }
  .vr-wrap { max-width: 1040px; margin: 0 auto; display: grid; gap: 18px; }
  .vr-eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--teal); }
  .vr-h1 { font-size: clamp(20px, 3vw, 28px); font-weight: 900; line-height: 1.25; margin: 4px 0 0; }
  .vr-sub { font-size: 13.5px; color: var(--ink3); line-height: 1.55; }
  .vr-player { width: 100%; aspect-ratio: 16 / 9; background: black; border: 0; border-radius: 12px; display: block; }
  .vr-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; display: grid; gap: 10px; }
  .vr-label { font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--ink3); }
  .vr-title { font-size: 17px; font-weight: 800; line-height: 1.35; }
  .vr-desc { font-size: 14px; line-height: 1.65; white-space: pre-wrap; max-height: 320px; overflow: auto; }
  .vr-thumb { width: min(360px, 100%); border-radius: 8px; display: block; }
  .vr-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .vr-btn { padding: 11px 18px; border-radius: 10px; border: none; font-weight: 800; font-size: 14px; cursor: pointer; font-family: inherit; }
  .vr-btn[disabled] { opacity: .5; cursor: default; }
  .vr-ok { background: var(--teal); color: white; }
  .vr-ghost { background: transparent; color: var(--ink2); border: 1.5px solid var(--border); }
  .vr-red { background: transparent; color: var(--red); border: 1.5px solid var(--red); }
  .vr-text { width: 100%; box-sizing: border-box; min-height: 90px; resize: vertical; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 14px; font-family: inherit; }
  .vr-banner { padding: 12px 16px; border-radius: 10px; font-size: 14px; line-height: 1.55; background: var(--card); border: 1px solid var(--border); }
  .vr-grid { display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 860px) { .vr-grid { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); } }
`

export default function VideoReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<'none' | 'comments' | 'changes'>('none')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/public/video-review/${encodeURIComponent(token)}`, { cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (r?.ok) setData(j as Data); else setErr((j as { error?: string }).error ?? 'This review link is not available.')
  }, [token])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
  useEffect(() => { void load() }, [load])

  async function answer(decision: 'approved' | 'approved_with_comments' | 'changes_requested') {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/public/video-review/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, comment: decision === 'approved' ? null : comment }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) { setMsg((j as { error?: string }).error ?? 'Could not save your answer. Please try again.'); return }
    setMode('none'); await load()
  }

  if (err) return <div className="vr-shell"><style>{STYLES}</style><div className="vr-wrap"><div className="vr-card"><strong>Review not available</strong><div className="vr-sub">{err}</div></div></div></div>
  if (!data) return <div className="vr-shell"><style>{STYLES}</style><div className="vr-wrap"><div className="vr-sub">Loading…</div></div></div>

  const open = data.round_status === 'pending' && data.my_status === 'pending' && !data.replaced
  const closedNote = data.replaced ? 'This version was replaced by a newer one. You will receive a new link for it.'
    : data.my_status !== 'pending' ? `You answered: ${LABEL[data.my_status] ?? data.my_status}${data.my_comment ? ` — “${data.my_comment}”` : ''}. Thank you.`
    : data.round_status !== 'pending' ? (data.layer === 'client' && data.resolved_by_name ? `${data.resolved_by_name} has already answered for your team (${LABEL[data.round_status] ?? data.round_status}).` : `This review is closed (${LABEL[data.round_status] ?? data.round_status}).`)
    : null

  return (
    <div className="vr-shell">
      <style>{STYLES}</style>
      <div className="vr-wrap">
        <div>
          <div className="vr-eyebrow">{data.layer === 'internal' ? 'Internal review' : 'Approval'} · {data.event_name}</div>
          <h1 className="vr-h1">{data.session_title}</h1>
          <div className="vr-sub">Hello {data.recipient_name.split(' ')[0]} — please watch the video and check the YouTube title, description and thumbnail. {data.rule}</div>
        </div>

        {closedNote && <div className="vr-banner">{closedNote}</div>}

        <div className="vr-grid">
          <div style={{ display: 'grid', gap: 10 }}>
            {data.youtube_id
              ? <iframe className="vr-player" src={`https://www.youtube-nocookie.com/embed/${data.youtube_id}?rel=0`} title="Session video" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              : data.video_url ? <video className="vr-player" controls playsInline preload="metadata" src={data.video_url} />
              : <div className="vr-card">The video is not available right now.</div>}
            {data.watch_url && <div className="vr-sub">Also on YouTube (unlisted — only people with the link can see it): <a href={data.watch_url} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>{data.watch_url}</a></div>}
          </div>
          <div className="vr-card">
            <div className="vr-label">YouTube title</div>
            <div className="vr-title">{data.title}</div>
            {data.thumbnail_url && <><div className="vr-label">Thumbnail</div><img className="vr-thumb" src={data.thumbnail_url} alt="Video thumbnail" /></>}
          </div>
        </div>

        <div className="vr-card">
          <div className="vr-label">Description</div>
          <div className="vr-desc">{data.description}</div>
        </div>

        {data.others.length > 0 && (
          <div className="vr-card">
            <div className="vr-label">Other reviewers</div>
            {data.others.map((o, i) => <div key={i} style={{ fontSize: 13.5 }}><strong>{o.name}</strong> — {LABEL[o.status] ?? o.status}{o.comment ? `: “${o.comment}”` : ''}</div>)}
          </div>
        )}

        {open && (
          <div className="vr-card">
            <div className="vr-label">Your answer</div>
            {mode === 'none' ? (
              <div className="vr-row">
                <button className="vr-btn vr-ok" disabled={busy} onClick={() => void answer('approved')}>Approve</button>
                <button className="vr-btn vr-ghost" disabled={busy} onClick={() => setMode('comments')}>Approve with comments</button>
                <button className="vr-btn vr-red" disabled={busy} onClick={() => setMode('changes')}>Request changes</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <textarea className="vr-text" autoFocus value={comment} onChange={e => setComment(e.target.value)}
                  placeholder={mode === 'changes' ? 'What should change? You can mention a time in the video, e.g. “0:32 – wrong job title”.' : 'Your comments (optional changes that don’t need another review).'} />
                <div className="vr-row">
                  <button className={`vr-btn ${mode === 'changes' ? 'vr-red' : 'vr-ok'}`} disabled={busy || !comment.trim()} onClick={() => void answer(mode === 'changes' ? 'changes_requested' : 'approved_with_comments')}>
                    {busy ? 'Saving…' : mode === 'changes' ? 'Send change request' : 'Approve with these comments'}
                  </button>
                  <button className="vr-btn vr-ghost" disabled={busy} onClick={() => { setMode('none'); setComment('') }}>Cancel</button>
                </div>
              </div>
            )}
            {msg && <div style={{ color: 'var(--red)', fontSize: 13.5 }}>{msg}</div>}
          </div>
        )}
        <div className="vr-sub">Please don’t forward this link — it is personal to you.{data.sent_by_name ? ` Sent by ${data.sent_by_name}.` : ''}</div>
      </div>
    </div>
  )
}
