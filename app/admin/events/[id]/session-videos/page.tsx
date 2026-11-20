'use client'

/* eslint-disable @next/next/no-img-element -- thumbnail previews are arbitrary stored images */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
type TitleCardSession = { id: string; state: 'new' | 'ready' | 'changed' | 'approved'; png_url: string | null; fingerprint: string | null }
type LtSpeaker = { speaker_id: string; name: string; status: 'draft' | 'generating' | 'generated'; still_url: string | null; preview_url: string | null }
type LtSession = { id: string; speakers: LtSpeaker[] }
type ThumbData = {
  max_speakers: number; can_edit: boolean
  settings: { card_variant_id: string | null; layout_variant_ids: Record<string, string>; card_text: 'name' | 'name_company' }
  missing: string[]; variants: ThumbVariant[]; sessions: ThumbSession[]
  title_cards?: { setup: { missing: string[]; layout_variant_id: string | null; card_variant_id: string | null }; sessions: TitleCardSession[] }
  lower_thirds?: { setup: { missing: string[]; variant_id: string | null }; sessions: LtSession[] }
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
  const [tcBusy, setTcBusy] = useState<Set<string>>(new Set())
  const [ltBusy, setLtBusy] = useState<Set<string>>(new Set())

  // Video kit
  const [kitData, setKitData] = useState<{ intro_path: string | null; outro_path: string | null; music_path: string | null } | null>(null)
  const [kitMsg, setKitMsg] = useState<string | null>(null)
  const [kitOpen, setKitOpen] = useState(false)
  const [kitUploading, setKitUploading] = useState<'intro' | 'outro' | 'music' | null>(null)
  const kitIntroRef = useRef<HTMLInputElement>(null)
  const kitMusicRef = useRef<HTMLInputElement>(null)

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

  const loadKit = useCallback(async () => {
    const r = await fetch(`/api/events/video-kit?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (r.ok && j) setKitData(j)
  }, [eventId])

  async function kitPost(body: Record<string, unknown>) {
    const r = await fetch('/api/events/video-kit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Failed.')
    return j
  }

  async function uploadKitFile(field: 'intro' | 'music', file: File) {
    setKitMsg(null); setKitUploading(field)
    try {
      const r1 = await kitPost({ action: 'start_upload', field, file_name: file.name, size: file.size, content_type: file.type || 'video/mp4' })
      const { upload_id, key, part_size, parts } = r1 as { upload_id: string; key: string; part_size: number; parts: number }
      for (let p = 1; p <= parts; p++) {
        const r2 = await kitPost({ action: 'presign_parts', field, key, upload_id, part_numbers: [p] })
        const url = (r2.urls as Array<{ url: string }>)[0].url
        await fetch(url, { method: 'PUT', body: file.slice((p - 1) * part_size, p * part_size) })
      }
      await kitPost({ action: 'complete_upload', field, key, upload_id })
      setKitMsg(`${field === 'intro' ? 'Intro/outro' : 'Music'} uploaded.`)
      await loadKit()
    } catch (e) { setKitMsg(e instanceof Error ? e.message : 'Upload failed.') }
    finally { setKitUploading(null) }
  }

  async function removeKitFile(field: 'intro' | 'outro' | 'music') {
    setKitMsg(null)
    try { await kitPost({ action: 'remove', field }); await loadKit() }
    catch (e) { setKitMsg(e instanceof Error ? e.message : 'Failed.') }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadVideos() }, [loadVideos])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadThumbs() }, [loadThumbs])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadKit() }, [loadKit])
  useEffect(() => {
    if (!videoData?.videos?.some(v => BUSY.has(v.status) || v.status === 'uploading')) return
    const t = setInterval(() => { void loadVideos() }, 6000); return () => clearInterval(t)
  }, [videoData, loadVideos])

  const tcBySession = useMemo(() => new Map((thumbData?.title_cards?.sessions ?? []).map(s => [s.id, s])), [thumbData])
  const ltBySession = useMemo(() => new Map((thumbData?.lower_thirds?.sessions ?? []).map(s => [s.id, s])), [thumbData])

  useEffect(() => {
    if (!thumbData?.lower_thirds?.sessions.some(s => s.speakers.some(sp => sp.status === 'generating'))) return
    const t = setInterval(() => { void loadThumbs() }, 5000); return () => clearInterval(t)
  }, [thumbData, loadThumbs])

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

  async function approveAll(id: string) {
    setThumbMsg(null)
    try { await thumbPost({ action: 'approve_all', session_id: id }); await loadThumbs() } catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') }
  }

  async function unapproveAll(id: string) {
    setThumbMsg(null)
    try { await thumbPost({ action: 'unapprove_all', session_id: id }); await loadThumbs() } catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') }
  }

  async function generateTitleCards(ids: string[]) {
    setThumbMsg(null); setTcBusy(b => new Set([...b, ...ids]))
    const failures: string[] = []
    try {
      for (let i = 0; i < ids.length; i += 3) {
        const r = await thumbPost({ action: 'generate_title_cards', session_ids: ids.slice(i, i + 3) })
        for (const f of r.failed ?? []) failures.push(`${thumbData?.sessions.find(s => s.id === f.id)?.title ?? f.id}: ${f.error}`)
      }
    } catch (e) { failures.push(e instanceof Error ? e.message : 'Failed.') }
    setTcBusy(new Set())
    setThumbMsg(failures.length ? `Title cards not generated:\n${failures.join('\n')}` : `Title cards generated for ${ids.length} session(s).`)
    await loadThumbs()
  }

  async function generateLtStill(sessionId: string, speakerId: string) {
    const key = `${sessionId}:${speakerId}`
    setThumbMsg(null); setLtBusy(b => new Set([...b, key]))
    try { await thumbPost({ action: 'generate_lower_third_still', session_id: sessionId, speaker_id: speakerId }); await loadThumbs() }
    catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setLtBusy(b => { const n = new Set(b); n.delete(key); return n }) }
  }

  async function enqueueLtMov(sessionId: string, speakerId: string) {
    const key = `${sessionId}:${speakerId}`
    setThumbMsg(null); setLtBusy(b => new Set([...b, key]))
    try { await thumbPost({ action: 'enqueue_lower_third_mov', session_id: sessionId, speaker_id: speakerId }); setThumbMsg('Lower-third MOV queued.'); await loadThumbs() }
    catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setLtBusy(b => { const n = new Set(b); n.delete(key); return n }) }
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
  const tcTodo = filteredThumbSessions.filter(s => { const tc = tcBySession.get(s.id); return !tc || tc.state === 'new' || tc.state === 'changed' }).map(s => s.id)

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

          {/* Video kit panel */}
          <div style={{ border: '1.5px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
            <button type="button" onClick={() => setKitOpen(o => !o)}
              style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', width: '100%', background: 'var(--card)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>Video kit</span>
              <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 4 }}>
                {!kitData ? 'Loading…'
                  : !kitData.intro_path ? 'Intro/outro missing — render blocked'
                  : !kitData.music_path ? 'Ready (no music — will render without it)'
                  : 'Ready'}
              </span>
              {!kitData?.intro_path && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>●</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>▼</span>
            </button>
            {kitOpen && (
              <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-light)' }}>
                {kitMsg && <div style={{ fontSize: 12.5, color: kitMsg.endsWith('.') && !kitMsg.includes('failed') && !kitMsg.includes('Failed') ? 'var(--green)' : 'var(--red)', margin: '10px 0 4px' }}>{kitMsg}</div>}
                <input ref={kitIntroRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void uploadKitFile('intro', f); e.target.value = '' }} />
                <input ref={kitMusicRef} type="file" accept="audio/mpeg,audio/wav,audio/aac,audio/m4a,.mp3,.wav,.aac,.m4a" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void uploadKitFile('music', f); e.target.value = '' }} />
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100 }}>Intro / outro</span>
                    {kitData?.intro_path
                      ? <><span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Uploaded</span>
                          <Button variant="ghost" disabled={!!kitUploading} onClick={() => void removeKitFile('intro')}>Remove</Button></>
                      : <Button variant={kitUploading === 'intro' ? 'ghost' : 'teal'} disabled={!!kitUploading} onClick={() => kitIntroRef.current?.click()}>{kitUploading === 'intro' ? 'Uploading…' : 'Upload MP4/MOV'}</Button>
                    }
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100 }}>Background music</span>
                    {kitData?.music_path
                      ? <><span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Uploaded</span>
                          <Button variant="ghost" disabled={!!kitUploading} onClick={() => void removeKitFile('music')}>Remove</Button></>
                      : <><Button variant="ghost" disabled={!!kitUploading} onClick={() => kitMusicRef.current?.click()}>{kitUploading === 'music' ? 'Uploading…' : 'Upload MP3/WAV/M4A'}</Button>
                          <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Optional — renders without music if missing</span></>
                    }
                  </div>
                </div>
              </div>
            )}
          </div>

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
              {thumbData.title_cards !== undefined && (
                <TitleCardSettings
                  data={thumbData} canEdit={canEditThumbs}
                  onSave={async b => { try { await thumbPost({ action: 'save_title_card_settings', ...b }); setThumbMsg('Title card settings saved.'); await loadThumbs() } catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') } }}
                />
              )}

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
                {canEditThumbs && thumbData.title_cards !== undefined && tcTodo.length > 0 && (
                  <Button variant="ghost" disabled={tcBusy.size > 0 || (thumbData.title_cards.setup.missing.length > 0)} onClick={() => void generateTitleCards(tcTodo)}>
                    {tcBusy.size > 0 ? 'Generating title cards…' : `Title cards: gen. ${tcTodo.length}`}
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
                  const tc = tcBySession.get(s.id)
                  const ltSession = ltBySession.get(s.id)
                  const tcConfigured = !!(thumbData.title_cards?.setup.layout_variant_id && thumbData.title_cards?.setup.card_variant_id)
                  const ltConfigured = !!thumbData.lower_thirds?.setup.variant_id
                  const useAllApprove = tcConfigured
                  return (
                    <div key={s.id} style={{ display: 'flex', gap: '12px', background: 'var(--card)', border: `${s.state === 'changed' ? 3 : 1}px solid ${s.state === 'changed' ? 'var(--red)' : 'var(--border-light)'}`, borderRadius: '12px', padding: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      {/* Thumbnail preview */}
                      <div style={{ width: '112px', flexShrink: 0, aspectRatio: '16 / 9', background: '#111', border: '1px solid var(--border-light)', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {show && s.jpg_url
                          ? <img src={s.jpg_url} alt="" loading="lazy" style={{ width: '100%', display: 'block' }} />
                          : blocked || thumbData.missing.length
                          ? <span style={{ color: 'var(--ink3)', fontSize: '10px', textAlign: 'center', padding: '4px' }}>Not ready</span>
                          : <img src={`/api/events/thumbnails/preview?event_id=${eventId}&session_id=${s.id}&v=${s.state}${stamp}`} alt="" loading="lazy" style={{ width: '100%', display: 'block' }} />}
                      </div>
                      {/* Title card preview */}
                      {tcConfigured && (
                        <div style={{ width: '112px', flexShrink: 0, aspectRatio: '16 / 9', background: '#111', border: `1px solid ${tc?.state === 'ready' || tc?.state === 'approved' ? 'var(--border-light)' : 'var(--border-light)'}`, borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {tc?.png_url
                            ? <img src={tc.png_url} alt="Title card" loading="lazy" style={{ width: '100%', display: 'block' }} />
                            : <span style={{ color: 'var(--ink3)', fontSize: '9px', textAlign: 'center', padding: '4px' }}>Title card</span>}
                        </div>
                      )}
                      {/* Info + actions */}
                      <div style={{ flex: 1, minWidth: '180px', display: 'grid', gap: '4px', alignContent: 'start' }}>
                        <div style={{ fontSize: '11.5px', color: 'var(--ink3)', fontWeight: 600 }}>{s.stage ?? 'No stage'} · {s.format ?? 'No format'} · {s.date} {s.start}</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, lineHeight: 1.3 }}>{s.title}</div>
                        <div style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>{s.cards.map(c => `${c.name}${c.moderator ? ' (Mod)' : ''}`).join(' · ')}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: THUMB_COLOR[s.state] }}>
                          ● {THUMB_LABEL[s.state]}{s.approved_at ? ` · ${new Date(s.approved_at).toLocaleDateString()}` : ''}
                          {tcConfigured && tc && tc.state !== 'new' && <span style={{ fontWeight: 400, color: 'var(--ink3)' }}> · Title card: {tc.state === 'approved' ? 'approved' : tc.state === 'ready' ? 'ready' : 'outdated'}</span>}
                        </div>
                        {s.issues.length > 0 && <ul style={{ margin: '2px 0 0', paddingLeft: '16px', fontSize: '12px', lineHeight: 1.5 }}>{s.issues.map((i, k) => <li key={k} style={{ color: i.level === 'info' ? 'var(--ink3)' : i.level === 'warning' ? 'var(--amber)' : 'var(--red)' }}>{i.text}</li>)}</ul>}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {canEditThumbs && (
                            <Button variant={s.state === 'new' || s.state === 'changed' ? 'teal' : 'ghost'} disabled={thumbBusy.has(s.id) || !!thumbProgress || blocked || thumbData.missing.length > 0} onClick={() => void thumbGenerate([s.id])}>
                              {thumbBusy.has(s.id) ? 'Generating…' : s.png_url ? 'Regen thumb' : 'Generate'}
                            </Button>
                          )}
                          {canEditThumbs && tcConfigured && (
                            <Button variant={!tc || tc.state === 'new' || tc.state === 'changed' ? 'teal' : 'ghost'} disabled={tcBusy.has(s.id) || (thumbData.title_cards?.setup.missing.length ?? 0) > 0} onClick={() => void generateTitleCards([s.id])}>
                              {tcBusy.has(s.id) ? 'Generating…' : tc?.png_url ? 'Regen title card' : 'Gen title card'}
                            </Button>
                          )}
                          {canEditThumbs && <Button variant="ghost" onClick={() => setThumbEditing(s)}>Edit text / speakers</Button>}
                          {canEditThumbs && s.state === 'ready' && !useAllApprove && <Button variant="lime" onClick={() => void thumbAct('approve', s.id)}>Approve</Button>}
                          {canEditThumbs && s.state === 'ready' && useAllApprove && <Button variant="lime" onClick={() => void approveAll(s.id)}>Approve all</Button>}
                          {canEditThumbs && s.state === 'approved' && !useAllApprove && <Button variant="ghost" onClick={() => void thumbAct('unapprove', s.id)}>Remove approval</Button>}
                          {canEditThumbs && s.state === 'approved' && useAllApprove && <Button variant="ghost" onClick={() => void unapproveAll(s.id)}>Remove all approvals</Button>}
                          {s.jpg_url && s.state !== 'new' && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${s.id}&format=jpg`}>JPG</Button>}
                          {s.png_url && s.state !== 'new' && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${s.id}&format=png`}>PNG</Button>}
                        </div>
                        {/* Lower-thirds per speaker */}
                        {ltConfigured && ltSession && ltSession.speakers.length > 0 && (
                          <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '8px', display: 'grid', gap: '6px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lower thirds</div>
                            {ltSession.speakers.map(sp => {
                              const key = `${s.id}:${sp.speaker_id}`
                              const busy = ltBusy.has(key)
                              const ltMissing = (thumbData.lower_thirds?.setup.missing.length ?? 0) > 0
                              return (
                                <div key={sp.speaker_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <div style={{ width: '80px', flexShrink: 0, aspectRatio: '16 / 9', background: '#0a0a0a', border: '1px solid var(--border-light)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {sp.still_url
                                      ? <img src={sp.still_url} alt="" loading="lazy" style={{ width: '100%', display: 'block' }} />
                                      : <span style={{ color: 'var(--ink3)', fontSize: '8px' }}>Still</span>}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sp.name}</div>
                                    <div style={{ fontSize: '11px', color: sp.status === 'generated' ? 'var(--green)' : sp.status === 'generating' ? 'var(--amber)' : 'var(--ink3)' }}>
                                      {sp.status === 'generating' ? '● Rendering…' : sp.status === 'generated' ? '● Done' : '● Not generated'}
                                    </div>
                                  </div>
                                  {canEditThumbs && (
                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                      <Button variant="ghost" disabled={busy || ltMissing} onClick={() => void generateLtStill(s.id, sp.speaker_id)}>
                                        {busy ? '…' : sp.still_url ? 'Regen still' : 'Still'}
                                      </Button>
                                      <Button variant="ghost" disabled={busy || ltMissing || sp.status === 'generating'} onClick={() => void enqueueLtMov(s.id, sp.speaker_id)}>
                                        {sp.status === 'generating' ? 'Rendering…' : sp.status === 'generated' ? 'Regen MOV' : 'Gen MOV'}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
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

function TitleCardSettings({ data, canEdit, onSave }: {
  data: ThumbData
  canEdit: boolean
  onSave: (b: { title_card_layout_variant_id: string | null; title_card_card_variant_id: string | null; lower_third_variant_id: string | null }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [tcLayout, setTcLayout] = useState(data.title_cards?.setup.layout_variant_id ?? '')
  const [tcCard, setTcCard] = useState(data.title_cards?.setup.card_variant_id ?? '')
  const [ltVariant, setLtVariant] = useState(data.lower_thirds?.setup.variant_id ?? '')
  const tcLayouts = data.variants.filter(v => v.category === 'title_card_layout')
  const tcCards = data.variants.filter(v => v.category === 'title_card_card')
  const ltVariants = data.variants.filter(v => v.category === 'lower_third')
  const allMissing = [...(data.title_cards?.setup.missing ?? []), ...(data.lower_thirds?.setup.missing ?? [])]
  return (
    <div style={{ border: `1px solid ${allMissing.length ? 'var(--border-light)' : 'var(--border-light)'}`, borderRadius: '10px', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: 'none', padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: '13px', flex: 1 }}>Title cards &amp; lower thirds</span>
        {allMissing.length > 0 && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Not configured</span>}
        <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-light)', display: 'grid', gap: '10px' }}>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Title card templates are built in Admin Console › Variants with category <em>title_card_layout</em> / <em>title_card_card</em>. Lower-third variants use category <em>lower_third</em>.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Title card layout
              <Select value={tcLayout} disabled={!canEdit} onChange={e => setTcLayout(e.target.value)}>
                <option value="">Choose…</option>
                {tcLayouts.map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}
              </Select>
            </label>
            <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Title card card
              <Select value={tcCard} disabled={!canEdit} onChange={e => setTcCard(e.target.value)}>
                <option value="">Choose…</option>
                {tcCards.map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}
              </Select>
            </label>
            <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Lower-third variant
              <Select value={ltVariant} disabled={!canEdit} onChange={e => setLtVariant(e.target.value)}>
                <option value="">Choose…</option>
                {ltVariants.map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}
              </Select>
            </label>
          </div>
          {canEdit && (
            <div>
              <Button variant="teal" onClick={() => onSave({ title_card_layout_variant_id: tcLayout || null, title_card_card_variant_id: tcCard || null, lower_third_variant_id: ltVariant || null })}>
                Save title card &amp; lower-third settings
              </Button>
            </div>
          )}
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
