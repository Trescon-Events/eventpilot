'use client'

/* eslint-disable @next/next/no-img-element -- generated creatives and live previews from our own API */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Input } from '@/app/components/ui'
import { LT_W, ltTotal, ltTransform, type LtAnim, DEFAULT_LT_CONFIG } from '@/app/lib/lower-thirds/config'

/* Session Videos → Video Kit.
   Everything a session video is built from, other than the recording itself:
     A. Event assets — intro/outro clip and background music (one set per event).
     B. Per session — thumbnail, title card and one lower third per speaker.
   Flow (shown as steps at the top): 1 templates ready → 2 generate thumbnails + title cards → 3 review and approve.
   Lower thirds need no generating here: they are live previews of the saved template; the animated clips are made
   automatically when a session's cues are confirmed in the video flow. One approval covers all three items of a session. */

type ThumbState = 'new' | 'ready' | 'changed' | 'needs_attention' | 'approved'
type IssueLevel = 'attention' | 'error' | 'warning' | 'info'
type ThumbIssue = { level: IssueLevel; text: string }
type ThumbOverrides = { title?: string; tag?: string; hide_tag?: boolean; cards?: Record<string, { name?: string; company?: string }>; exclude?: string[]; order?: string[] }
type ThumbCard = { speaker_id: string; moderator: boolean; name: string; company: string; base_name: string; base_company: string; ready: boolean }
type ThumbCand = { speaker_id: string; name: string; moderator: boolean; excluded: boolean }
type ThumbSession = {
  id: string; position: number; title: string; session_title: string; format: string | null; date: string; start: string; stage: string | null; layout: string; tag: string | null
  cards: ThumbCard[]; candidates: ThumbCand[]; overrides: ThumbOverrides; issues: ThumbIssue[]; state: ThumbState
  png_url: string | null; jpg_url: string | null; generated_at: string | null; approved_at: string | null; file_base: string
}
type TitleCardSession = { id: string; state: 'new' | 'ready' | 'changed' | 'approved'; png_url: string | null; fingerprint: string | null }
type LtSpeaker = { speaker_id: string; name: string }
type LtSession = { id: string; speakers: LtSpeaker[] }
type ThumbData = {
  max_speakers: number; can_edit: boolean
  missing: string[]; sessions: ThumbSession[]
  title_cards?: { setup: { missing: string[] }; sessions: TitleCardSession[] }
  lower_thirds?: { setup: { missing: string[] }; sessions: LtSession[] }
}
type Kit = { intro_path: string | null; outro_path: string | null; music_path: string | null }

// Overall state of one session's kit, from its thumbnail and title card.
type KitState = 'to_generate' | 'out_of_date' | 'attention' | 'to_review' | 'approved'
const KIT_LABEL: Record<KitState, string> = { to_generate: 'To generate', out_of_date: 'Out of date', attention: 'Needs attention', to_review: 'Ready to approve', approved: 'Approved' }
const KIT_COLOR: Record<KitState, string> = { to_generate: 'var(--ink3)', out_of_date: 'var(--red)', attention: 'var(--amber)', to_review: 'var(--teal-mid)', approved: 'var(--success)' }

type ViewItem = { kind: 'thumb' | 'title' | 'lt'; sessionId: string; speakerId?: string; label: string; src: string | null }

export default function VideoKitTab({ eventId }: { eventId: string }) {
  const [data, setData] = useState<ThumbData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())        // 'thumb:<id>' | 'title:<id>' | 'approve:<id>'
  const [progress, setProgress] = useState<string | null>(null)
  const [stamp, setStamp] = useState(0)
  const [editing, setEditing] = useState<ThumbSession | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)     // index into viewItems
  const [anim, setAnim] = useState<LtAnim>(DEFAULT_LT_CONFIG.animation)
  const [stage, setStage] = useState('all')
  const [status, setStatus] = useState<'all' | KitState>('all')

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/thumbnails?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (r.ok && j) { setErr(null); setData(j) } else setErr(j?.error || 'Could not load the video kit.')
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    fetch(`/api/events/lower-thirds/settings?event_id=${eventId}`).then(r => r.json()).then(d => { if (d?.config?.animation) setAnim(d.config.animation) }).catch(() => undefined)
  }, [eventId])

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/events/thumbnails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Failed.')
    return j
  }
  const mark = (keys: string[], on: boolean) => setBusy(b => { const n = new Set(b); for (const k of keys) { if (on) n.add(k); else n.delete(k) } return n })
  const titleOf = (id: string) => data?.sessions.find(s => s.id === id)?.title ?? id

  async function generate(kind: 'thumb' | 'title', ids: string[]) {
    if (!ids.length) return
    setMsg(null); mark(ids.map(i => `${kind}:${i}`), true)
    const failures: string[] = []
    try {
      for (let i = 0; i < ids.length; i += 3) {
        if (ids.length > 3) setProgress(`${kind === 'thumb' ? 'Thumbnails' : 'Title cards'}: ${Math.min(i + 3, ids.length)} of ${ids.length}…`)
        const r = await post({ action: kind === 'thumb' ? 'generate' : 'generate_title_cards', session_ids: ids.slice(i, i + 3) })
        for (const f of (r.failed ?? []) as Array<{ id: string; error: string }>) failures.push(`${titleOf(f.id)}: ${f.error}`)
      }
    } catch (e) { failures.push(e instanceof Error ? e.message : 'Failed.') }
    setProgress(null); mark(ids.map(i => `${kind}:${i}`), false); setStamp(n => n + 1)
    const what = kind === 'thumb' ? 'thumbnail' : 'title card'
    setMsg(failures.length ? `Some ${what}s were not generated:\n${failures.join('\n')}` : `Generated ${ids.length} ${what}${ids.length === 1 ? '' : 's'}.`)
    await load()
  }

  async function approve(ids: string[], on: boolean) {
    if (!ids.length) return
    setMsg(null); mark(ids.map(i => `approve:${i}`), true)
    const failures: string[] = []
    for (let i = 0; i < ids.length; i++) {
      if (ids.length > 1) setProgress(`Approving ${i + 1} of ${ids.length}…`)
      try { await post({ action: on ? 'approve_all' : 'unapprove_all', session_id: ids[i] }) } catch (e) { failures.push(`${titleOf(ids[i])}: ${e instanceof Error ? e.message : 'Failed.'}`) }
    }
    setProgress(null); mark(ids.map(i => `approve:${i}`), false)
    if (ids.length > 1 || failures.length) setMsg(failures.length ? `Not approved:\n${failures.join('\n')}` : `Approved ${ids.length} session${ids.length === 1 ? '' : 's'}.`)
    await load()
  }

  const tcBy = useMemo(() => new Map((data?.title_cards?.sessions ?? []).map(s => [s.id, s])), [data])
  const ltBy = useMemo(() => new Map((data?.lower_thirds?.sessions ?? []).map(s => [s.id, s])), [data])
  const thumbMissing = data?.missing ?? []
  const tcMissing = data?.title_cards?.setup.missing ?? []
  const ltMissing = data?.lower_thirds?.setup.missing ?? []

  const kitState = useCallback((s: ThumbSession): KitState => {
    const tc = tcBy.get(s.id)
    if (s.state === 'approved') return 'approved'
    if (s.state === 'needs_attention') return 'attention'
    if (s.state === 'changed' || tc?.state === 'changed') return 'out_of_date'
    if (s.state === 'new' || !tc || tc.state === 'new') return 'to_generate'
    return 'to_review'
  }, [tcBy])

  const stages = useMemo(() => [...new Set((data?.sessions ?? []).map(s => s.stage ?? 'No stage'))].sort(), [data])
  const shown = useMemo(() => (data?.sessions ?? []).filter(s => (stage === 'all' || (s.stage ?? 'No stage') === stage) && (status === 'all' || kitState(s) === status)), [data, stage, status, kitState])

  const blocked = (s: ThumbSession) => s.issues.some(i => i.level === 'attention')
  const thumbTodo = shown.filter(s => (s.state === 'new' || s.state === 'changed') && !blocked(s)).map(s => s.id)
  const titleTodo = shown.filter(s => { const tc = tcBy.get(s.id); return !tc || tc.state === 'new' || tc.state === 'changed' }).map(s => s.id)
  const approvable = shown.filter(s => kitState(s) === 'to_review').map(s => s.id)
  const all = data?.sessions ?? []
  const approvedCount = all.filter(s => s.state === 'approved').length
  const canEdit = !!data?.can_edit

  // Pop-up viewer: every item of the shown sessions, in order, so ← → walks through the whole list.
  const viewItems: ViewItem[] = useMemo(() => shown.flatMap(s => {
    const tc = tcBy.get(s.id)
    const thumbSrc = s.jpg_url && (s.state === 'ready' || s.state === 'approved') ? s.jpg_url : (!blocked(s) && !thumbMissing.length ? `/api/events/thumbnails/preview?event_id=${eventId}&session_id=${s.id}&v=${s.state}${stamp}` : null)
    return [
      { kind: 'thumb' as const, sessionId: s.id, label: 'Thumbnail', src: thumbSrc },
      { kind: 'title' as const, sessionId: s.id, label: 'Title card', src: tc?.png_url ?? null },
      ...(ltBy.get(s.id)?.speakers ?? []).map(sp => ({ kind: 'lt' as const, sessionId: s.id, speakerId: sp.speaker_id, label: `Lower third — ${sp.name}`, src: ltMissing.length ? null : `/api/events/lower-thirds/preview?event_id=${eventId}&speaker_id=${sp.speaker_id}` })),
    ]
  }), [shown, tcBy, ltBy, eventId, stamp, thumbMissing.length, ltMissing.length])
  const openItem = (sessionId: string, kind: ViewItem['kind'], speakerId?: string) => {
    const i = viewItems.findIndex(v => v.sessionId === sessionId && v.kind === kind && (kind !== 'lt' || v.speakerId === speakerId))
    if (i >= 0) setViewing(i)
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${active ? 'var(--teal-mid)' : 'var(--border-light)'}`,
    background: active ? 'var(--teal-mid)' : 'var(--surface)', color: active ? 'white' : 'var(--ink3)',
    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
  })
  const frame: React.CSSProperties = { width: '100%', aspectRatio: '16 / 9', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in', padding: 0 }
  const consoleLink = (tab: string) => `/admin/events/${eventId}/creative-templates/admin?tab=${tab}`

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <EventAssets eventId={eventId} />

      {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
      {!data && !err && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>}

      {data && (
        <>
          {/* Steps */}
          <Card padded>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <Step n={1} title="Templates" done={!thumbMissing.length && !tcMissing.length && !ltMissing.length}>
                {([['Thumbnails', thumbMissing, 'thumbnails'], ['Title cards', tcMissing, 'title_cards'], ['Lower thirds', ltMissing, 'lower_thirds']] as const).map(([label, miss, tab]) => (
                  <div key={label} style={{ fontSize: 12.5, color: miss.length ? 'var(--amber)' : 'var(--ink2)' }}>
                    {miss.length ? '●' : '✓'} {label}{miss.length ? <> — <a href={consoleLink(tab)} style={{ color: 'var(--teal)', fontWeight: 700 }}>set up in Admin Console</a></> : ''}
                  </div>
                ))}
              </Step>
              <Step n={2} title="Generate" done={!thumbTodo.length && !titleTodo.length}>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{thumbTodo.length} thumbnails and {titleTodo.length} title cards to generate{stage !== 'all' || status !== 'all' ? ' (in this filter)' : ''}. Lower thirds need nothing here.</div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button variant="teal" disabled={!thumbTodo.length || !!progress || thumbMissing.length > 0} onClick={() => void generate('thumb', thumbTodo)}>Generate thumbnails ({thumbTodo.length})</Button>
                    <Button variant="teal" disabled={!titleTodo.length || !!progress || tcMissing.length > 0} onClick={() => void generate('title', titleTodo)}>Generate title cards ({titleTodo.length})</Button>
                  </div>
                )}
              </Step>
              <Step n={3} title="Review & approve" done={all.length > 0 && approvedCount === all.length}>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{approvedCount} of {all.length} sessions approved. Click any picture to see it large; one approval covers the session&apos;s thumbnail, title card and lower thirds.</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canEdit && <Button variant="lime" disabled={!approvable.length || !!progress} onClick={() => void approve(approvable, true)}>Approve all ready ({approvable.length})</Button>}
                  {approvedCount > 0 && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&zip=1`}>Download approved thumbnails</Button>}
                </div>
              </Step>
            </div>
          </Card>

          {(progress || msg) && <pre style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }}>{progress ?? msg}</pre>}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {stages.length > 1 && (
              <>
                <button type="button" style={chip(stage === 'all')} onClick={() => setStage('all')}>All stages</button>
                {stages.map(s => <button key={s} type="button" style={chip(stage === s)} onClick={() => setStage(s)}>{s}</button>)}
                <span style={{ width: 1, height: 24, background: 'var(--border-light)', margin: '0 4px' }} />
              </>
            )}
            <button type="button" style={chip(status === 'all')} onClick={() => setStatus('all')}>All ({all.length})</button>
            {(['to_generate', 'out_of_date', 'attention', 'to_review', 'approved'] as const).map(k => (
              <button key={k} type="button" style={chip(status === k)} onClick={() => setStatus(k)}><span style={{ color: status === k ? 'white' : KIT_COLOR[k] }}>●</span> {KIT_LABEL[k]} ({all.filter(s => kitState(s) === k).length})</button>
            ))}
          </div>

          {shown.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No sessions match. Sessions appear here once they have speakers on the agenda.</div>}

          {/* Sessions */}
          <div style={{ display: 'grid', gap: 12 }}>
            {shown.map(s => {
              const ks = kitState(s)
              const tc = tcBy.get(s.id)
              const lts = ltBy.get(s.id)?.speakers ?? []
              const thumbItem = viewItems.find(v => v.sessionId === s.id && v.kind === 'thumb')
              const thumbIsFinal = !!s.jpg_url && (s.state === 'ready' || s.state === 'approved')
              return (
                <div key={s.id} style={{ background: 'var(--card)', border: `1.5px solid ${ks === 'out_of_date' ? 'var(--red)' : ks === 'approved' ? 'var(--success)' : 'var(--border-light)'}`, borderRadius: 12, padding: 14, display: 'grid', gap: 12 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 600 }}>{s.stage ?? 'No stage'} · {s.format ?? 'No format'} · {s.date} {s.start}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginTop: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}>{s.cards.map(c => `${c.name}${c.moderator ? ' (Mod)' : ''}`).join(' · ')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: KIT_COLOR[ks] }}>● {KIT_LABEL[ks]}{s.approved_at && ks === 'approved' ? ` · ${new Date(s.approved_at).toLocaleDateString()}` : ''}</span>
                      {canEdit && ks === 'to_review' && <Button variant="lime" disabled={busy.has(`approve:${s.id}`) || !!progress} onClick={() => void approve([s.id], true)}>Approve session</Button>}
                      {canEdit && ks === 'approved' && <Button variant="ghost" disabled={busy.has(`approve:${s.id}`)} onClick={() => void approve([s.id], false)}>Remove approval</Button>}
                    </div>
                  </div>
                  {s.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.5 }}>{s.issues.map((i, k) => <li key={k} style={{ color: i.level === 'info' ? 'var(--ink3)' : i.level === 'warning' ? 'var(--amber)' : 'var(--red)' }}>{i.text}</li>)}</ul>}

                  {/* The three items */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'start' }}>
                    {/* Thumbnail */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      <ItemHead label="Thumbnail" note={thumbIsFinal ? (s.state === 'approved' ? 'Approved' : 'Generated') : s.state === 'changed' ? 'Out of date — regenerate' : thumbItem?.src ? 'Preview — not generated yet' : 'Not ready'} warn={s.state === 'changed'} />
                      <button type="button" style={frame} disabled={!thumbItem?.src} onClick={() => openItem(s.id, 'thumb')} aria-label="View thumbnail">
                        {thumbItem?.src ? <img src={thumbItem.src} alt="" loading="lazy" style={{ width: '100%', display: 'block', opacity: thumbIsFinal ? 1 : 0.75 }} /> : <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Not ready</span>}
                      </button>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {canEdit && <Button variant={s.state === 'new' || s.state === 'changed' ? 'teal' : 'ghost'} disabled={busy.has(`thumb:${s.id}`) || !!progress || blocked(s) || thumbMissing.length > 0} onClick={() => void generate('thumb', [s.id])}>{busy.has(`thumb:${s.id}`) ? 'Generating…' : s.png_url ? 'Regenerate' : 'Generate'}</Button>}
                        {canEdit && <Button variant="ghost" onClick={() => setEditing(s)}>Edit text / speakers</Button>}
                        {thumbIsFinal && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${s.id}&format=jpg`}>JPG</Button>}
                        {thumbIsFinal && s.png_url && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${s.id}&format=png`}>PNG</Button>}
                      </div>
                    </div>
                    {/* Title card */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      <ItemHead label="Title card" note={!tc || tc.state === 'new' ? 'Not generated' : tc.state === 'changed' ? 'Out of date — regenerate' : tc.state === 'approved' ? 'Approved' : 'Generated'} warn={tc?.state === 'changed'} />
                      <button type="button" style={frame} disabled={!tc?.png_url} onClick={() => openItem(s.id, 'title')} aria-label="View title card">
                        {tc?.png_url ? <img src={tc.png_url} alt="" loading="lazy" style={{ width: '100%', display: 'block' }} /> : <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Not generated</span>}
                      </button>
                      {canEdit && <div><Button variant={!tc || tc.state === 'new' || tc.state === 'changed' ? 'teal' : 'ghost'} disabled={busy.has(`title:${s.id}`) || !!progress || tcMissing.length > 0} onClick={() => void generate('title', [s.id])}>{busy.has(`title:${s.id}`) ? 'Generating…' : tc?.png_url ? 'Regenerate' : 'Generate'}</Button></div>}
                    </div>
                    {/* Lower thirds */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      <ItemHead label={`Lower thirds (${lts.length})`} note={ltMissing.length ? 'Template not set up' : 'Live preview — click to play'} warn={ltMissing.length > 0} />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 6 }}>
                        {lts.map(sp => (
                          <button key={sp.speaker_id} type="button" onClick={() => openItem(s.id, 'lt', sp.speaker_id)} disabled={ltMissing.length > 0}
                            style={{ display: 'grid', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'zoom-in', textAlign: 'left', fontFamily: 'inherit' }}>
                            <div style={{ ...frame, cursor: 'zoom-in', background: 'var(--surface)' }}>
                              {!ltMissing.length && <img src={`/api/events/lower-thirds/preview?event_id=${eventId}&speaker_id=${sp.speaker_id}`} alt="" loading="lazy" style={{ width: '100%', display: 'block' }} />}
                            </div>
                            <span style={{ fontSize: 11.5, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sp.name}</span>
                          </button>
                        ))}
                        {lts.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>No speakers</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {viewing !== null && viewItems[viewing] && data && (
        <Viewer
          items={viewItems} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} anim={anim}
          session={data.sessions.find(s => s.id === viewItems[viewing].sessionId) ?? null}
          state={(() => { const s = data.sessions.find(x => x.id === viewItems[viewing].sessionId); return s ? kitState(s) : null })()}
          canEdit={canEdit} busy={!!progress || busy.has(`approve:${viewItems[viewing].sessionId}`)}
          onApprove={id => void approve([id], true)}
          onRegenerate={(kind, id) => void generate(kind, [id])}
        />
      )}

      {editing && data && (
        <OverrideEditor
          session={editing} maxSpeakers={data.max_speakers} onClose={() => setEditing(null)}
          onSave={async o => {
            try { await post({ action: 'save_overrides', session_id: editing.id, overrides: o }); setEditing(null); setStamp(n => n + 1); await load() }
            catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); setEditing(null) }
          }}
        />
      )}
    </div>
  )
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: done ? 'var(--success)' : 'var(--teal-mid)', color: 'white' }}>{done ? '✓' : n}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function ItemHead({ label, note, warn }: { label: string; note: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</span>
      <span style={{ fontSize: 11.5, color: warn ? 'var(--red)' : 'var(--ink3)' }}>{note}</span>
    </div>
  )
}

/** Large pop-up for one item; ← → moves through every item in the list, Esc closes. Lower thirds play their animation. */
function Viewer({ items, index, onIndex, onClose, anim, session, state, canEdit, busy, onApprove, onRegenerate }: {
  items: ViewItem[]; index: number; onIndex: (i: number) => void; onClose: () => void; anim: LtAnim
  session: ThumbSession | null; state: KitState | null; canEdit: boolean; busy: boolean
  onApprove: (sessionId: string) => void; onRegenerate: (kind: 'thumb' | 'title', sessionId: string) => void
}) {
  const it = items[index]
  const cardRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, onIndex, onClose])
  useEffect(() => {
    if (it.kind !== 'lt') return
    let raf = 0; const start = performance.now()
    const tick = (now: number) => {
      const t = ((now - start) / 1000) % (ltTotal(anim) + 1.2)
      const el = cardRef.current
      if (el) { const { opacity, dx } = ltTransform(anim, t); el.style.opacity = String(opacity); el.style.transform = `translateX(${(dx / LT_W) * 100}%)` }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf)
  }, [it, anim])

  const arrow = (dir: -1 | 1) => (
    <button type="button" aria-label={dir < 0 ? 'Previous' : 'Next'} disabled={dir < 0 ? index === 0 : index === items.length - 1} onClick={() => onIndex(index + dir)}
      style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: 20, cursor: 'pointer', flexShrink: 0, opacity: (dir < 0 ? index === 0 : index === items.length - 1) ? 0.35 : 1 }}>{dir < 0 ? '‹' : '›'}</button>
  )
  return (
    // eslint-disable-next-line no-restricted-syntax -- modal scrim
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(880px, 100%)', maxHeight: '92vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{it.label} · {index + 1} of {items.length}</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{session?.title}</div>
          </div>
          {state && <span style={{ fontSize: 12.5, fontWeight: 800, color: KIT_COLOR[state] }}>● {KIT_LABEL[state]}</span>}
          {canEdit && it.kind !== 'lt' && <Button variant="ghost" disabled={busy} onClick={() => onRegenerate(it.kind === 'thumb' ? 'thumb' : 'title', it.sessionId)}>Regenerate</Button>}
          {canEdit && state === 'to_review' && <Button variant="lime" disabled={busy} onClick={() => onApprove(it.sessionId)}>Approve session</Button>}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {arrow(-1)}
          <div style={{ flex: 1, position: 'relative', aspectRatio: '16 / 9', maxWidth: 'calc(62vh * 16 / 9)', margin: '0 auto', background: 'var(--surface)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-light)' }}>
            {it.src
              ? <img key={it.src} ref={it.kind === 'lt' ? cardRef : undefined} src={it.src} alt={it.label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13 }}>Not generated yet</div>}
          </div>
          {arrow(1)}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink4)' }}>← → to move through every item · Esc to close{it.kind === 'lt' ? ' · the animated clip is made automatically when this session’s cues are confirmed' : ''}</div>
      </div>
    </div>
  )
}

/** Intro/outro + background music — one set for the whole event. */
function EventAssets({ eventId }: { eventId: string }) {
  const [kit, setKit] = useState<Kit | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'intro' | 'music' | null>(null)
  const introRef = useRef<HTMLInputElement>(null)
  const musicRef = useRef<HTMLInputElement>(null)
  const load = useCallback(async () => {
    const r = await fetch(`/api/events/video-kit?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (r.ok && j) setKit(j)
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
  useEffect(() => { void load() }, [load])
  async function kitPost(body: Record<string, unknown>) {
    const r = await fetch('/api/events/video-kit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Failed.')
    return j
  }
  async function upload(field: 'intro' | 'music', file: File) {
    setMsg(null); setUploading(field)
    try {
      const r1 = await kitPost({ action: 'start_upload', field, file_name: file.name, size: file.size, content_type: file.type || 'video/mp4' })
      const { upload_id, key, part_size, parts } = r1 as { upload_id: string; key: string; part_size: number; parts: number }
      for (let p = 1; p <= parts; p++) {
        const r2 = await kitPost({ action: 'presign_parts', field, key, upload_id, part_numbers: [p] })
        const url = (r2.urls as Array<{ url: string }>)[0].url
        await fetch(url, { method: 'PUT', body: file.slice((p - 1) * part_size, p * part_size) })
      }
      await kitPost({ action: 'complete_upload', field, key, upload_id })
      setMsg(`${field === 'intro' ? 'Intro/outro' : 'Music'} uploaded.`); await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Upload failed.') } finally { setUploading(null) }
  }
  async function remove(field: 'intro' | 'music') {
    setMsg(null)
    try { await kitPost({ action: 'remove', field }); await load() } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.') }
  }
  const row = (label: string, field: 'intro' | 'music', has: boolean, hint: string, accept: string, ref: React.RefObject<HTMLInputElement | null>) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(field, f); e.target.value = '' }} />
      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 140 }}>{label}</span>
      {has
        ? <><span style={{ fontSize: 12.5, color: 'var(--success)' }}>✓ Uploaded</span><Button variant="ghost" disabled={!!uploading} onClick={() => void remove(field)}>Remove</Button></>
        : <Button variant={field === 'intro' ? 'teal' : 'ghost'} disabled={!!uploading} onClick={() => ref.current?.click()}>{uploading === field ? 'Uploading…' : field === 'intro' ? 'Upload MP4/MOV' : 'Upload MP3/WAV/M4A'}</Button>}
      <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{hint}</span>
    </div>
  )
  return (
    <Card padded>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Event assets</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Used in every session video of this event.</div>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: !kit ? 'var(--ink3)' : kit.intro_path ? 'var(--success)' : 'var(--red)' }}>{!kit ? 'Loading…' : !kit.intro_path ? '● Intro/outro missing — videos cannot be rendered' : kit.music_path ? '✓ Ready' : '✓ Ready (no music)'}</span>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: /fail/i.test(msg) ? 'var(--red)' : 'var(--success)', marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {row('Intro / outro', 'intro', !!kit?.intro_path, 'Required — plays before and after the session', 'video/mp4,video/quicktime,.mp4,.mov', introRef)}
        {row('Background music', 'music', !!kit?.music_path, 'Optional — under the intro and outro', 'audio/mpeg,audio/wav,audio/aac,audio/m4a,.mp3,.wav,.aac,.m4a', musicRef)}
      </div>
    </Card>
  )
}

function OverrideEditor({ session, maxSpeakers, onSave, onClose }: { session: ThumbSession; maxSpeakers: number; onSave: (o: ThumbOverrides) => Promise<void>; onClose: () => void }) {
  const [o, setO] = useState<ThumbOverrides>(session.overrides)
  const excluded = new Set(o.exclude ?? [])
  const left = session.candidates.filter(c => !excluded.has(c.speaker_id)).length
  const setCard = (id: string, k: 'name' | 'company', v: string) => setO(x => ({ ...x, cards: { ...(x.cards ?? {}), [id]: { ...(x.cards?.[id] ?? {}), [k]: v } } }))
  const toggle = (id: string) => setO(x => { const s = new Set(x.exclude ?? []); if (s.has(id)) s.delete(id); else s.add(id); return { ...x, exclude: [...s] } })
  const others = session.candidates.filter(c => !c.moderator && !excluded.has(c.speaker_id))
  const move = (id: string, d: -1 | 1) => setO(x => { const ids = (x.order?.length ? x.order : others.map(c => c.speaker_id)).filter(i => others.some(c => c.speaker_id === i)); for (const c of others) if (!ids.includes(c.speaker_id)) ids.push(c.speaker_id); const i = ids.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= ids.length) return x; [ids[i], ids[j]] = [ids[j], ids[i]]; return { ...x, order: ids } })
  return (
    // eslint-disable-next-line no-restricted-syntax -- modal scrim
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '18px', width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto', display: 'grid', gap: '12px' }}>
        <strong style={{ fontSize: '16px' }}>Edit this thumbnail only</strong>
        <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Changes apply to this thumbnail only — the agenda and speaker records are not changed. Leave a box empty to use the agenda / record value.</span>
        <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Title<Input value={o.title ?? ''} placeholder={session.session_title} onChange={e => setO(x => ({ ...x, title: e.target.value }))} /></label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12.5px', fontWeight: 700, flex: '1 1 220px' }}>Tag text<Input value={o.tag ?? ''} placeholder={session.format ?? 'No format on the agenda'} disabled={!!o.hide_tag} onChange={e => setO(x => ({ ...x, tag: e.target.value }))} /></label>
          <label style={{ fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={!!o.hide_tag} onChange={e => setO(x => ({ ...x, hide_tag: e.target.checked }))} />No tag</label>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 800, color: left > maxSpeakers ? 'var(--red)' : 'var(--ink2)' }}>Speakers shown: {left} (up to {maxSpeakers}){left > maxSpeakers ? `: exclude ${left - maxSpeakers} more` : ''}</div>
        {session.candidates.map(c => {
          const ex = excluded.has(c.speaker_id)
          const pos = others.findIndex(x => x.speaker_id === c.speaker_id)
          return (
            <div key={c.speaker_id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center', opacity: ex ? 0.5 : 1 }}>
              <Input value={o.cards?.[c.speaker_id]?.name ?? ''} placeholder={c.name + (c.moderator ? ' (Moderator)' : '')} disabled={ex} onChange={e => setCard(c.speaker_id, 'name', e.target.value)} />
              <Input value={o.cards?.[c.speaker_id]?.company ?? ''} placeholder="Company (from record)" disabled={ex} onChange={e => setCard(c.speaker_id, 'company', e.target.value)} />
              <div style={{ display: 'flex', gap: '4px' }}>
                {!c.moderator && !ex && <Button variant="ghost" disabled={pos <= 0} onClick={() => move(c.speaker_id, -1)}>↑</Button>}
                {!c.moderator && !ex && <Button variant="ghost" disabled={pos < 0 || pos >= others.length - 1} onClick={() => move(c.speaker_id, 1)}>↓</Button>}
                {(!c.moderator || ex) && <Button variant="ghost" onClick={() => toggle(c.speaker_id)}>{ex ? 'Include' : 'Exclude'}</Button>}
              </div>
            </div>
          )
        })}
        <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>The moderator is always first and cannot be excluded while on the thumbnail.</div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" onClick={() => onSave(o)}>Save</Button>
        </div>
      </div>
    </div>
  )
}
