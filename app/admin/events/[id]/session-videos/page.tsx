'use client'

/* eslint-disable @next/next/no-img-element -- thumbnail previews are arbitrary stored images */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Select } from '@/app/components/ui'

/* Session Videos hub: two tabs — Videos (session list → per-session flow) and Thumbnails (inline generate/approve). */

type Video = { id: string; source_ref: string | null; status: string; agenda_session_id: string | null; size_bytes: number | null; bytes_transferred: number | null; drive_file_id: string | null; duration_s: number | null }
type Sess = { id: string; title: string; content_type: string | null; starts: string | null; speakers: string[] }
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
type ThumbVariant = { id: string; name: string; category: string; kind?: string; w: number; h: number }
type ThumbData = {
  max_speakers: number; can_edit: boolean
  settings: { card_variant_id: string | null; layout_variant_ids: Record<string, string>; card_text: 'name' | 'name_company' }
  missing: string[]; variants: ThumbVariant[]; sessions: ThumbSession[]
}
type Tab = 'videos' | 'thumbnails'

const VIDEO_STATUS: Record<string, { label: string; color: string }> = {
  uploading: { label: 'Uploading', color: 'var(--amber)' }, uploaded: { label: 'Processing', color: 'var(--amber)' },
  ingesting: { label: 'Preparing', color: 'var(--amber)' }, ingested: { label: 'Processing', color: 'var(--amber)' },
  transcribing: { label: 'Transcribing', color: 'var(--amber)' }, transcribed: { label: 'Name voices', color: 'var(--teal-mid)' },
  text_pending: { label: 'Writing text', color: 'var(--amber)' }, ready: { label: 'Review text', color: 'var(--teal-mid)' },
  approved: { label: 'Approved', color: 'var(--green)' }, failed: { label: 'Failed', color: 'var(--red)' },
}
const BUSY = new Set(['uploaded', 'ingesting', 'ingested', 'transcribing', 'text_pending'])
const THUMB_LABEL: Record<ThumbState, string> = { new: 'Not generated', ready: 'Ready', changed: 'Out of date', needs_attention: 'Needs attention', approved: 'Approved' }
const THUMB_COLOR: Record<ThumbState, string> = { new: 'var(--ink3)', ready: 'var(--teal-mid)', changed: 'var(--red)', needs_attention: 'var(--amber)', approved: 'var(--green)' }
const LAYOUTS = ['keynote', 'fireside', 'panel'] as const

export default function SessionVideosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [tab, setTab] = useState<Tab>('videos')

  // Video data
  const [videoData, setVideoData] = useState<{ storage_ready: boolean; videos: Video[]; sessions: Sess[] } | null>(null)
  const [videoErr, setVideoErr] = useState<string | null>(null)

  // Thumbnail data
  const [thumbData, setThumbData] = useState<ThumbData | null>(null)
  const [thumbErr, setThumbErr] = useState<string | null>(null)
  const [thumbMsg, setThumbMsg] = useState<string | null>(null)
  const [thumbBusy, setThumbBusy] = useState<Set<string>>(new Set())
  const [thumbProgress, setThumbProgress] = useState<string | null>(null)
  const [thumbEditing, setThumbEditing] = useState<ThumbSession | null>(null)
  const [stamp, setStamp] = useState(0)

  // Filters
  const [vidType, setVidType] = useState('all')
  const [vidStatus, setVidStatus] = useState('all')
  const [thStage, setThStage] = useState('all')
  const [thStatus, setThStatus] = useState('all')

  const loadVideos = useCallback(async () => {
    const r = await fetch(`/api/events/session-videos?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j) { setVideoErr(j?.error || 'Could not load.'); return }
    setVideoErr(null); setVideoData(j)
  }, [eventId])

  const loadThumbs = useCallback(async () => {
    const r = await fetch(`/api/events/thumbnails?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (r.ok && j) { setThumbErr(null); setThumbData(j) } else setThumbErr(j?.error || 'Could not load thumbnails.')
  }, [eventId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadVideos() }, [loadVideos])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadThumbs() }, [loadThumbs])
  useEffect(() => {
    if (!videoData?.videos?.some(v => BUSY.has(v.status) || v.status === 'uploading')) return
    const t = setInterval(() => { void loadVideos() }, 6000); return () => clearInterval(t)
  }, [videoData, loadVideos])

  async function thumbPost(body: Record<string, unknown>) {
    const r = await fetch('/api/events/thumbnails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Failed.')
    return j
  }

  async function thumbGenerate(ids: string[]) {
    setThumbMsg(null); setThumbBusy(b => new Set([...b, ...ids]))
    const failures: string[] = []
    try {
      for (let i = 0; i < ids.length; i += 3) {
        setThumbProgress(`Generating ${Math.min(i + 3, ids.length)} of ${ids.length}…`)
        const r = await thumbPost({ action: 'generate', session_ids: ids.slice(i, i + 3) })
        for (const f of r.failed ?? []) failures.push(`${thumbData?.sessions.find(s => s.id === f.id)?.title ?? f.id}: ${f.error}`)
      }
    } catch (e) { failures.push(e instanceof Error ? e.message : 'Failed.') }
    setThumbProgress(null); setThumbBusy(new Set()); setStamp(n => n + 1)
    setThumbMsg(failures.length ? `Not generated:\n${failures.join('\n')}` : `Generated ${ids.length}.`)
    await loadThumbs()
  }

  async function thumbAct(action: 'approve' | 'unapprove', id: string) {
    setThumbMsg(null)
    try { await thumbPost({ action, session_id: id }); await loadThumbs() } catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') }
  }

  const videoBySession = useMemo(() => {
    const m = new Map<string, Video>()
    for (const v of [...(videoData?.videos ?? [])].reverse()) { if (v.agenda_session_id) m.set(v.agenda_session_id, v) }
    return m
  }, [videoData])

  const vidTypes = useMemo(() => [...new Set((videoData?.sessions ?? []).map(s => s.content_type ?? 'None'))].sort(), [videoData])
  const thStages = useMemo(() => [...new Set((thumbData?.sessions ?? []).map(s => s.stage ?? 'No stage'))].sort(), [thumbData])

  const filteredVideoSessions = useMemo(() => (videoData?.sessions ?? []).filter(s => {
    if (vidType !== 'all' && (s.content_type ?? 'None') !== vidType) return false
    if (vidStatus !== 'all') {
      const v = videoBySession.get(s.id)
      if (vidStatus === 'none' && v) return false
      if (vidStatus !== 'none' && (!v || (VIDEO_STATUS[v.status]?.label ?? v.status) !== vidStatus)) return false
    }
    return true
  }), [videoData, videoBySession, vidType, vidStatus])

  const filteredThumbSessions = useMemo(() => (thumbData?.sessions ?? []).filter(s => {
    if (thStage !== 'all' && (s.stage ?? 'No stage') !== thStage) return false
    if (thStatus !== 'all' && s.state !== thStatus) return false
    return true
  }), [thumbData, thStage, thStatus])

  const thumbTodo = filteredThumbSessions.filter(s => (s.state === 'new' || s.state === 'changed') && !s.issues.some(i => i.level === 'attention'))
  const thumbApproved = (thumbData?.sessions ?? []).filter(s => s.state === 'approved').length
  const canEditThumbs = !!thumbData?.can_edit

  function videoCTA(s: Sess): { label: string; variant: 'teal' | 'ghost' } {
    const v = videoBySession.get(s.id)
    if (!v) return { label: 'Start →', variant: 'teal' }
    if (v.status === 'approved') return { label: 'Open →', variant: 'ghost' }
    return { label: 'Continue →', variant: 'teal' }
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 22px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '14px', fontWeight: active ? 800 : 500, color: active ? 'var(--teal-mid)' : 'var(--ink3)',
    borderBottom: `2px solid ${active ? 'var(--teal-mid)' : 'transparent'}`, transition: 'all .15s',
  })

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: '20px', border: `1.5px solid ${active ? 'var(--teal-mid)' : 'var(--border-light)'}`,
    background: active ? 'var(--teal-mid)' : 'var(--surface)', color: active ? 'white' : 'var(--ink3)',
    fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' as const,
  })

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      <PageHeader eyebrow="Event Workspace" title="Session Videos" description="Upload recorded session videos, name the detected voices, then review and approve the generated titles and descriptions. Thumbnails are generated and approved here too." backHref={`/admin/events/${eventId}`} />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <button type="button" style={tabBtn(tab === 'videos')} onClick={() => setTab('videos')}>Videos</button>
        <button type="button" style={tabBtn(tab === 'thumbnails')} onClick={() => setTab('thumbnails')}>Thumbnails</button>
      </div>

      {/* ── Videos tab ── */}
      {tab === 'videos' && (
        <div style={{ display: 'grid', gap: '14px' }}>
          {videoErr && <div style={{ color: 'var(--red)', fontSize: '13px' }}>{videoErr}</div>}
          {videoData && !videoData.storage_ready && (
            <Card padded><div style={{ fontSize: '13px', color: 'var(--amber)' }}><strong>Video storage is not set up.</strong> The VIDEO_R2_* environment variables are missing, so uploads are switched off.</div></Card>
          )}

          {/* Type filter chips */}
          {vidTypes.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" style={chip(vidType === 'all')} onClick={() => setVidType('all')}>All types</button>
              {vidTypes.map(t => <button key={t} type="button" style={chip(vidType === t)} onClick={() => setVidType(t)}>{t}</button>)}
            </div>
          )}

          {/* Status filter chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['all', 'none', 'Uploading', 'Transcribing', 'Name voices', 'Review text', 'Approved', 'Failed'] as const).map(s => (
              <button key={s} type="button" style={chip(vidStatus === s)} onClick={() => setVidStatus(s)}>
                {s === 'all' ? 'All' : s === 'none' ? 'No video yet' : s}
              </button>
            ))}
          </div>

          {!videoData && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
          {videoData?.sessions.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>No speaker sessions on the agenda yet.</div>}

          <Card padded>
            {filteredVideoSessions.length === 0 && videoData && (
              <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>No sessions match the selected filters.</div>
            )}
            <div style={{ display: 'grid', gap: 0 }}>
              {filteredVideoSessions.map((session, idx) => {
                const video = videoBySession.get(session.id) ?? null
                const st = video ? VIDEO_STATUS[video.status] : null
                const driveProgress = video?.drive_file_id && video.status === 'uploading' && video.bytes_transferred != null && video.size_bytes
                  ? Math.round(video.bytes_transferred / video.size_bytes * 100) : null
                const cta = videoCTA(session)
                return (
                  <div key={session.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '11px 0', borderBottom: idx < filteredVideoSessions.length - 1 ? '1px solid var(--border-light)' : 'none', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '13.5px' }}>{session.title}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
                        {[session.content_type, session.speakers.slice(0, 3).join(', ') + (session.speakers.length > 3 ? ` +${session.speakers.length - 3}` : '')].filter(Boolean).join(' · ')}
                      </div>
                      {driveProgress !== null && (
                        <div style={{ marginTop: '5px', height: '3px', background: 'var(--border-light)', borderRadius: '99px', overflow: 'hidden', maxWidth: '280px' }}>
                          <div style={{ width: `${driveProgress}%`, height: '100%', background: 'var(--teal-mid)', transition: 'width .3s' }} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                      {video && (
                        <span style={{ fontSize: '12px', fontWeight: 800, color: st?.color ?? 'var(--ink3)' }}>
                          {driveProgress !== null ? `Importing · ${driveProgress}%` : st?.label ?? video.status}
                        </span>
                      )}
                      <Button variant={cta.variant} href={`/admin/events/${eventId}/session-videos/${session.id}`}>{cta.label}</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Thumbnails tab ── */}
      {tab === 'thumbnails' && (
        <div style={{ display: 'grid', gap: '14px' }}>
          {thumbErr && <div style={{ color: 'var(--red)', fontSize: '13px' }}>{thumbErr}</div>}

          {thumbData && (
            <>
              <ThumbSettings
                data={thumbData} canEdit={canEditThumbs} eventId={eventId}
                onSave={async b => { try { await thumbPost({ action: 'save_settings', ...b }); setThumbMsg('Settings saved.'); await loadThumbs() } catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') } }}
              />

              {thumbMsg && <pre style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit' }}>{thumbMsg}</pre>}

              {/* Controls row */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{filteredThumbSessions.length} sessions · {thumbTodo.length} to generate · {thumbApproved} approved</span>
                <span style={{ flex: 1 }} />
                {canEditThumbs && (
                  <Button variant="teal" disabled={!thumbTodo.length || !!thumbProgress || thumbData.missing.length > 0} onClick={() => void thumbGenerate(thumbTodo.map(s => s.id))}>
                    {thumbProgress ?? `Generate ${thumbTodo.length}`}
                  </Button>
                )}
                {thumbApproved > 0 && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&zip=1`}>Download all approved (ZIP)</Button>}
              </div>

              {/* Filter chips */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {thStages.length > 1 && (
                  <>
                    <button type="button" style={chip(thStage === 'all')} onClick={() => setThStage('all')}>All stages</button>
                    {thStages.map(s => <button key={s} type="button" style={chip(thStage === s)} onClick={() => setThStage(s)}>{s}</button>)}
                    <span style={{ width: '1px', height: '24px', background: 'var(--border-light)', alignSelf: 'center', margin: '0 4px' }} />
                  </>
                )}
                <button type="button" style={chip(thStatus === 'all')} onClick={() => setThStatus('all')}>All</button>
                {(['new', 'ready', 'changed', 'needs_attention', 'approved'] as const).map(s => (
                  <button key={s} type="button" style={chip(thStatus === s)} onClick={() => setThStatus(s)}>
                    <span style={{ color: THUMB_COLOR[s] }}>●</span> {THUMB_LABEL[s]}
                  </button>
                ))}
              </div>

              {/* Session list */}
              {filteredThumbSessions.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>No sessions match. Add speakers to sessions in the Agenda for them to appear here.</div>}
              <div style={{ display: 'grid', gap: '8px' }}>
                {filteredThumbSessions.map(s => {
                  const blocked = s.issues.some(i => i.level === 'attention')
                  const show = s.state === 'ready' || s.state === 'approved'
                  return (
                    <div key={s.id} style={{ display: 'flex', gap: '12px', background: 'var(--card)', border: `${s.state === 'changed' ? 3 : 1}px solid ${s.state === 'changed' ? 'var(--red)' : 'var(--border-light)'}`, borderRadius: '12px', padding: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      {/* 16:9 thumbnail preview — 112px wide */}
                      <div style={{ width: '112px', flexShrink: 0, aspectRatio: '16 / 9', background: '#111', border: '1px solid var(--border-light)', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {show && s.jpg_url
                          ? <img src={s.jpg_url} alt="" loading="lazy" style={{ width: '100%', display: 'block' }} />
                          : blocked || thumbData.missing.length
                          ? <span style={{ color: 'var(--ink3)', fontSize: '10px', textAlign: 'center', padding: '4px' }}>Not ready</span>
                          : <img src={`/api/events/thumbnails/preview?event_id=${eventId}&session_id=${s.id}&v=${s.state}${stamp}`} alt="" loading="lazy" style={{ width: '100%', display: 'block' }} />}
                      </div>
                      {/* Info + actions */}
                      <div style={{ flex: 1, minWidth: '180px', display: 'grid', gap: '4px', alignContent: 'start' }}>
                        <div style={{ fontSize: '11.5px', color: 'var(--ink3)', fontWeight: 600 }}>{s.stage ?? 'No stage'} · {s.format ?? 'No format'} · {s.date} {s.start}</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, lineHeight: 1.3 }}>{s.title}</div>
                        <div style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>{s.cards.map(c => `${c.name}${c.moderator ? ' (Mod)' : ''}`).join(' · ')}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: THUMB_COLOR[s.state] }}>● {THUMB_LABEL[s.state]}{s.approved_at ? ` · ${new Date(s.approved_at).toLocaleDateString()}` : ''}</div>
                        {s.issues.length > 0 && <ul style={{ margin: '2px 0 0', paddingLeft: '16px', fontSize: '12px', lineHeight: 1.5 }}>{s.issues.map((i, k) => <li key={k} style={{ color: i.level === 'info' ? 'var(--ink3)' : i.level === 'warning' ? 'var(--amber)' : 'var(--red)' }}>{i.text}</li>)}</ul>}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {canEditThumbs && (
                            <Button variant={s.state === 'new' || s.state === 'changed' ? 'teal' : 'ghost'} disabled={thumbBusy.has(s.id) || !!thumbProgress || blocked || thumbData.missing.length > 0} onClick={() => void thumbGenerate([s.id])}>
                              {thumbBusy.has(s.id) ? 'Generating…' : s.png_url ? 'Regenerate' : 'Generate'}
                            </Button>
                          )}
                          {canEditThumbs && <Button variant="ghost" onClick={() => setThumbEditing(s)}>Edit text / speakers</Button>}
                          {canEditThumbs && s.state === 'ready' && <Button variant="lime" onClick={() => void thumbAct('approve', s.id)}>Approve</Button>}
                          {canEditThumbs && s.state === 'approved' && <Button variant="ghost" onClick={() => void thumbAct('unapprove', s.id)}>Remove approval</Button>}
                          {s.jpg_url && s.state !== 'new' && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${s.id}&format=jpg`}>JPG</Button>}
                          {s.png_url && s.state !== 'new' && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${s.id}&format=png`}>PNG</Button>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {!thumbData && !thumbErr && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
        </div>
      )}

      {thumbEditing && thumbData && (
        <OverrideEditor
          session={thumbEditing}
          maxSpeakers={thumbData.max_speakers}
          onClose={() => setThumbEditing(null)}
          onSave={async o => {
            try { await thumbPost({ action: 'save_overrides', session_id: thumbEditing.id, overrides: o }); setThumbEditing(null); setStamp(n => n + 1); await loadThumbs() }
            catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.'); setThumbEditing(null) }
          }}
        />
      )}
    </div>
  )
}

function ThumbSettings({ data, canEdit, eventId, onSave }: { data: ThumbData; canEdit: boolean; eventId: string; onSave: (b: { card_variant_id: string | null; layout_variant_ids: Record<string, string>; card_text: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [card, setCard] = useState(data.settings.card_variant_id ?? '')
  const [layouts, setLayouts] = useState<Record<string, string>>(data.settings.layout_variant_ids ?? {})
  const [text, setText] = useState(data.settings.card_text)
  const cards = data.variants.filter(v => v.category === 'thumbnail_card')
  const lays = data.variants.filter(v => v.category === 'thumbnail_layout')
  void eventId // used by parent for its own API calls; kept in props for potential future use
  return (
    <div style={{ border: `1px solid ${data.missing.length ? 'var(--amber)' : 'var(--border-light)'}`, borderRadius: '10px', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: 'none', padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: '13px', flex: 1 }}>Template settings</span>
        {data.missing.length > 0 && <span style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 700 }}>Missing: {data.missing.join(' · ')}</span>}
        <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-light)', display: 'grid', gap: '10px' }}>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Built in Admin Console › Variants. Nothing generates until the card and all three layouts are chosen.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Speaker card
              <Select value={card} disabled={!canEdit} onChange={e => setCard(e.target.value)}>
                <option value="">Choose…</option>{cards.map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}
              </Select>
            </label>
            {LAYOUTS.map(k => (
              <label key={k} style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'capitalize' }}>{k} layout
                <Select value={layouts[k] ?? ''} disabled={!canEdit} onChange={e => setLayouts(l => ({ ...l, [k]: e.target.value }))}>
                  <option value="">Choose…</option>{lays.filter(v => !v.kind || v.kind === k).map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}
                </Select>
              </label>
            ))}
            <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Text on card
              <Select value={text} disabled={!canEdit} onChange={e => setText(e.target.value as 'name' | 'name_company')}>
                <option value="name">Name only</option><option value="name_company">Name and company</option>
              </Select>
            </label>
          </div>
          {canEdit && <div><Button variant="teal" onClick={() => onSave({ card_variant_id: card || null, layout_variant_ids: Object.fromEntries(Object.entries(layouts).filter(([, v]) => v)), card_text: text })}>Save settings</Button></div>}
        </div>
      )}
    </div>
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
