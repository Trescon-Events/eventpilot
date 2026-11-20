'use client'

/* eslint-disable @next/next/no-img-element */

import { use, useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Input } from '@/app/components/ui'
import DrivePickerButton, { type DriveFile } from '@/app/components/session-videos/DrivePickerButton'

type VoiceRow = { voice_id: string; speaker_id: string | null; rejected: boolean }
type Suggestion = { voice_id: string; suggested_speaker_id: string | null; confidence: string }
type VoiceSummary = { voice_id: string; seconds: number; segments: number; quotes: Array<{ start: number; text: string }> }
type Speaker = { id: string; name: string; public_name: string | null }
type Job = { id: string; kind: string; status: string; error: string | null; log: string | null }
type TextRec = { titles: string[]; selected_title: string | null; description_working: string; tags: string[]; findings: Record<string, unknown>; approved_at: string | null }
type VideoRec = { id: string; status: string; source_ref: string | null; size_bytes: number | null; bytes_transferred: number | null; drive_file_id: string | null; agenda_session_id: string | null; duration_s: number | null; error: string | null; render_status: string | null; render_error: string | null; preview_path: string | null; render_path: string | null; cues_fingerprint: string | null }
type Cue = { id: string; session_video_id: string; speaker_id: string; start_s: number }
type Detail = {
  video: VideoRec; jobs: Job[]
  session: { title: string; content_type: string | null } | null
  speakers: Speaker[]; proxy_url: string | null; preview_url: string | null
  transcript: { voices: VoiceRow[]; summaries: VoiceSummary[]; named_at: string | null; voice_clip_urls: Record<string, string>; voice_suggestions: Suggestion[] } | null
  text: TextRec | null
  thumbnail: { png_url: string | null; jpg_url: string | null; approved: boolean } | null
  footer_approved: boolean
}
type ListVideo = { id: string; status: string; agenda_session_id: string | null; source_ref: string | null; size_bytes: number | null; bytes_transferred: number | null; drive_file_id: string | null; error: string | null }
type SessItem = { id: string; title: string; content_type: string | null; speakers: string[] }
type ThumbSess = { id: string; state: 'new' | 'ready' | 'changed' | 'needs_attention' | 'approved'; issues: Array<{ level: string; text: string }>; jpg_url: string | null; png_url: string | null; approved_at: string | null }

const BUSY = new Set(['uploaded', 'ingesting', 'ingested', 'transcribing', 'text_pending'])
const STATUS_LABEL: Record<string, string> = {
  uploading: 'Uploading', uploaded: 'Preparing', ingesting: 'Preparing', ingested: 'Analysing audio',
  transcribing: 'Transcribing', transcribed: 'Name voices', text_pending: 'Writing text',
  ready: 'Review text', approved: 'Approved', failed: 'Failed',
}
const THUMB_LABEL: Record<string, string> = { new: 'Not generated', ready: 'Ready', changed: 'Out of date', needs_attention: 'Needs attention', approved: 'Approved' }
const THUMB_COLOR: Record<string, string> = { new: 'var(--ink3)', ready: 'var(--teal-mid)', changed: 'var(--red)', needs_attention: 'var(--amber)', approved: 'var(--green)' }

function fmt(s: number) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}` }
function spkName(sp: Speaker) { return sp.public_name || sp.name }

export default function SessionFlowPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id: eventId, sessionId } = use(params)

  const [list, setList] = useState<{ storage_ready: boolean; videos: ListVideo[]; sessions: SessItem[] } | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [thumb, setThumb] = useState<ThumbSess | null>(null)
  const [thumbMissing, setThumbMissing] = useState<string[]>([])
  const [thumbCanEdit, setThumbCanEdit] = useState(false)

  const [voices, setVoices] = useState<VoiceRow[] | null>(null)
  const [voiceSaving, setVoiceSaving] = useState(false)

  const [titles, setTitles] = useState<string[]>([])
  const [selTitle, setSelTitle] = useState<string | null>(null)
  const [desc, setDesc] = useState('')
  const [textEdited, setTextEdited] = useState(false)
  const [textSaving, setTextSaving] = useState(false)
  const [textMsg, setTextMsg] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [driveLink, setDriveLink] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [thumbBusy, setThumbBusy] = useState(false)
  const [thumbMsg, setThumbMsg] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [openStep, setOpenStep] = useState<number | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  // Cues + render
  const [cues, setCues] = useState<Cue[] | null>(null)
  const [cuesBusy, setCuesBusy] = useState(false)
  const [cuesMsg, setCuesMsg] = useState<string | null>(null)
  const [renderBusy, setRenderBusy] = useState(false)
  const [renderMsg, setRenderMsg] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // ── API helpers ─────────────────────────────────────────────────────────────

  const vpost = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch('/api/events/session-videos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...body }),
    })
    const j = await r.json().catch(() => ({})) as Record<string, unknown>
    if (!r.ok) throw new Error((j.error as string | undefined) ?? 'Request failed.')
    return j
  }, [eventId])

  const tpost = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch('/api/events/thumbnails', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...body }),
    })
    const j = await r.json().catch(() => ({})) as Record<string, unknown>
    if (!r.ok) throw new Error((j.error as string | undefined) ?? 'Failed.')
    return j
  }, [eventId])

  const cpost = useCallback(async (videoId: string, action: string, body: Record<string, unknown> = {}) => {
    const r = await fetch(`/api/events/session-videos/${videoId}/cues`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, action, ...body }),
    })
    const j = await r.json().catch(() => ({})) as Record<string, unknown>
    if (!r.ok) throw new Error((j.error as string | undefined) ?? 'Failed.')
    if (Array.isArray(j.cues)) setCues(j.cues as Cue[])
    return j
  }, [eventId])

  const loadCuesForVideo = useCallback(async (videoId: string) => {
    const r = await fetch(`/api/events/session-videos/${videoId}/cues?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null) as { cues: Cue[] } | null
    if (r.ok && j) setCues(j.cues)
  }, [eventId])

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/events/session-videos?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null) as { storage_ready: boolean; videos: ListVideo[]; sessions: SessItem[] } | null
    if (r.ok && j) { setLoadErr(null); setList(j) } else setLoadErr((j as { error?: string } | null)?.error ?? 'Could not load.')
    return j
  }, [eventId])

  const loadDetail = useCallback(async (videoId: string) => {
    const r = await fetch(`/api/events/session-videos?event_id=${eventId}&id=${videoId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null) as Detail | null
    if (r.ok && j) setDetail(j)
    return j
  }, [eventId])

  const loadThumb = useCallback(async () => {
    const r = await fetch(`/api/events/thumbnails?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null) as { sessions: ThumbSess[]; missing?: string[]; can_edit?: boolean } | null
    if (r.ok && j) {
      setThumb((j.sessions ?? []).find(s => s.id === sessionId) ?? null)
      setThumbMissing(j.missing ?? [])
      setThumbCanEdit(!!j.can_edit)
    }
  }, [eventId, sessionId])

  const reload = useCallback(async () => {
    const j = await loadList()
    if (!j) return
    const v = j.videos.find(v => v.agenda_session_id === sessionId) ?? null
    if (v) {
      await loadDetail(v.id)
      await loadCuesForVideo(v.id)
    }
    await loadThumb()
  }, [loadList, loadDetail, loadThumb, loadCuesForVideo, sessionId])

  useEffect(() => { void reload() }, [reload])

  // Merge AI face-detection suggestions into initial voices state
  useEffect(() => {
    if (!detail?.transcript || voices !== null) return
    const sugMap = new Map((detail.transcript.voice_suggestions).map(s => [s.voice_id, s]))
    setVoices(detail.transcript.voices.map(v => {
      if (v.speaker_id !== null || v.rejected) return v
      const sg = sugMap.get(v.voice_id)
      return sg?.suggested_speaker_id && sg.confidence !== 'low' ? { ...v, speaker_id: sg.suggested_speaker_id } : v
    }))
  }, [detail, voices])

  // Reset voices when video changes
  const prevVidId = useRef<string | null>(null)
  useEffect(() => {
    const cur = detail?.video.id ?? null
    if (prevVidId.current !== cur) { prevVidId.current = cur; setVoices(null) }
  }, [detail?.video.id])

  // Sync text fields from server when text lands (only when not currently editing)
  useEffect(() => {
    if (textEdited || !detail?.text) return
    setTitles(detail.text.titles)
    setSelTitle(detail.text.selected_title)
    setDesc(detail.text.description_working)
  }, [detail?.text, textEdited])

  // Auto-poll while pipeline is busy
  useEffect(() => {
    const v = list?.videos?.find(v => v.agenda_session_id === sessionId)
    if (!v || (!BUSY.has(v.status) && v.status !== 'uploading')) return
    const t = setInterval(() => { void reload() }, 5000)
    return () => clearInterval(t)
  }, [list, sessionId, reload])

  // ── Computed ──────────────────────────────────────────────────────────────────

  const video = list?.videos?.find(v => v.agenda_session_id === sessionId) ?? null
  const sess = list?.sessions?.find(s => s.id === sessionId) ?? null

  function calcActive(): number {
    if (!video) return 2
    if (video.status === 'uploading') return 2
    if (video.status === 'failed') return 3
    if (BUSY.has(video.status)) return 3
    if (video.status === 'transcribed') return 4
    if (video.status === 'ready') return 5
    if (video.status === 'approved') return 6
    return 3
  }

  const active = openStep ?? calcActive()
  const tr = detail?.transcript ?? null
  const spNames = new Map((detail?.speakers ?? []).map(s => [s.id, spkName(s)]))
  const voicesComplete = (voices ?? []).every(v => v.rejected || v.speaker_id !== null) && (voices?.length ?? 0) > 0

  // ── Upload actions ────────────────────────────────────────────────────────────

  async function startFileUpload(file: File) {
    if (uploading) return
    setUploading(true); setUploadPct(0); setUploadErr(null)
    try {
      const r1 = await vpost({ action: 'create', file_name: file.name, size: file.size, content_type: file.type || 'video/mp4', agenda_session_id: sessionId })
      const vid = r1.id as string, ps = r1.part_size as number, pc = r1.parts as number
      for (let p = 1; p <= pc; p++) {
        const r2 = await vpost({ action: 'presign_parts', id: vid, part_numbers: [p] })
        const url = (r2.urls as Array<{ url: string }>)[0].url
        await fetch(url, { method: 'PUT', body: file.slice((p - 1) * ps, p * ps) })
        setUploadPct(p / pc)
      }
      await vpost({ action: 'complete', id: vid })
      await reload()
    } catch (e) { setUploadErr(e instanceof Error ? e.message : 'Upload failed.') }
    finally { setUploading(false) }
  }

  async function startDriveLink() {
    const url = driveLink.trim(); if (!url) return
    setUploadErr(null)
    try {
      const r = await vpost({ action: 'import_drive_link', url })
      await vpost({ action: 'set_session', id: r.id as string, session_id: sessionId })
      setDriveLink(''); await reload()
    } catch (e) { setUploadErr(e instanceof Error ? e.message : 'Failed.') }
  }

  async function startDrivePick(f: DriveFile) {
    setUploadErr(null)
    try {
      await vpost({ action: 'create_from_drive', drive_file_id: f.id, access_token: f.accessToken, file_name: f.name, size: f.sizeBytes, content_type: f.mimeType, agenda_session_id: sessionId })
      await reload()
    } catch (e) { setUploadErr(e instanceof Error ? e.message : 'Failed.') }
  }

  async function doRemove() {
    if (!video) return
    setActionErr(null); setConfirmRemove(false)
    try {
      await vpost({ action: 'remove', id: video.id })
      setDetail(null); setVoices(null); setTitles([]); setDesc(''); setSelTitle(null); setTextEdited(false)
      await reload()
    } catch (e) { setActionErr(e instanceof Error ? e.message : 'Failed.') }
  }

  // ── Voice / text / approve ────────────────────────────────────────────────────

  async function saveVoicesAndRequest() {
    if (!voices || !video) return
    setVoiceSaving(true); setActionErr(null)
    try {
      await vpost({ action: 'save_voices', id: video.id, voices })
      await vpost({ action: 'make_text', id: video.id })
      setOpenStep(null); await reload()
    } catch (e) { setActionErr(e instanceof Error ? e.message : 'Failed.') }
    finally { setVoiceSaving(false) }
  }

  async function doSaveText() {
    if (!video) return
    setTextSaving(true); setTextMsg(null); setTextEdited(false)
    try {
      await vpost({ action: 'save_text', id: video.id, titles, selected_title: selTitle, description_working: desc })
      await loadDetail(video.id); setTextMsg('Saved.')
    } catch (e) { setTextMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setTextSaving(false) }
  }

  async function doApprove() {
    if (!video) return
    setActionErr(null)
    try { await vpost({ action: 'approve', id: video.id }); await reload() }
    catch (e) { setActionErr(e instanceof Error ? e.message : 'Failed.') }
  }

  async function doRetry() {
    if (!video) return
    setActionErr(null)
    try { await vpost({ action: 'retry', id: video.id }); await reload() }
    catch (e) { setActionErr(e instanceof Error ? e.message : 'Failed.') }
  }

  // ── Cues ──────────────────────────────────────────────────────────────────────

  async function doGenerateCues() {
    if (!video) return
    setCuesBusy(true); setCuesMsg(null)
    try { await vpost({ action: 'generate_cues', id: video.id }); await loadCuesForVideo(video.id); setCuesMsg('Cues generated.') }
    catch (e) { setCuesMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setCuesBusy(false) }
  }

  async function doMoveCue(cueId: string, deltaSec: number) {
    if (!video) return
    setCuesBusy(true)
    try { await cpost(video.id, 'move', { cue_id: cueId, delta_s: deltaSec }) }
    catch (e) { setCuesMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setCuesBusy(false) }
  }

  async function doDeleteCue(cueId: string) {
    if (!video) return
    setCuesBusy(true)
    try { await cpost(video.id, 'delete', { cue_id: cueId }) }
    catch (e) { setCuesMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setCuesBusy(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  async function doRequestPreview() {
    if (!video) return
    setRenderBusy(true); setRenderMsg(null)
    try { await vpost({ action: 'request_render_preview', id: video.id }); await reload() }
    catch (e) { setRenderMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setRenderBusy(false) }
  }

  async function doRequestRender() {
    if (!video) return
    setRenderBusy(true); setRenderMsg(null)
    try { await vpost({ action: 'request_render', id: video.id }); await reload() }
    catch (e) { setRenderMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setRenderBusy(false) }
  }

  // ── Thumbnail ─────────────────────────────────────────────────────────────────

  async function thumbGenerate() {
    setThumbBusy(true); setThumbMsg(null)
    try { await tpost({ action: 'generate', session_ids: [sessionId] }); await loadThumb() }
    catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setThumbBusy(false) }
  }

  async function thumbApproveAct(action: 'approve' | 'unapprove') {
    setThumbBusy(true); setThumbMsg(null)
    try { await tpost({ action, session_id: sessionId }); await loadThumb() }
    catch (e) { setThumbMsg(e instanceof Error ? e.message : 'Failed.') }
    finally { setThumbBusy(false) }
  }

  // Sync preview URL from detail when it changes
  useEffect(() => {
    if (detail?.preview_url) setPreviewUrl(detail.preview_url)
  }, [detail?.preview_url])

  // ── Loading / not found states ────────────────────────────────────────────────

  if (!list) return (
    <div>
      <PageHeader eyebrow="Session Videos" title="Loading…" backHref={`/admin/events/${eventId}/session-videos`} backLabel="All sessions" />
      {loadErr ? <div style={{ color: 'var(--red)', fontSize: 13, padding: '16px 0' }}>{loadErr}</div>
               : <div style={{ color: 'var(--ink3)', fontSize: 13, padding: '16px 0' }}>Loading…</div>}
    </div>
  )

  if (!sess) return (
    <div>
      <PageHeader eyebrow="Session Videos" title="Session not found" backHref={`/admin/events/${eventId}/session-videos`} backLabel="All sessions" />
      <div style={{ color: 'var(--red)', fontSize: 13, padding: '16px 0' }}>This session was not found on the event's agenda, or it is not a speaker session.</div>
    </div>
  )

  const isApproved = video?.status === 'approved'
  const renderStatus = (detail?.video as VideoRec | null)?.render_status ?? null
  const hasCues = cues !== null && cues.length > 0
  const renderDone = renderStatus === 'done'
  const previewDone = renderStatus === 'preview_done' || renderStatus === 'rendering' || renderDone

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      <PageHeader
        eyebrow={sess.content_type ?? 'Session Videos'}
        title={sess.title}
        description={sess.speakers.length > 0 ? sess.speakers.slice(0, 3).join(' · ') + (sess.speakers.length > 3 ? ` +${sess.speakers.length - 3}` : '') : undefined}
        backHref={`/admin/events/${eventId}/session-videos`}
        backLabel="All sessions"
      />

      {actionErr && <div style={{ fontSize: 13, color: 'var(--red)', padding: '8px 14px', background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: 8, margin: '0 0 12px' }}>{actionErr}</div>}

      <div style={{ display: 'grid', gap: 8, padding: '8px 0' }}>

        {/* ── Step 1: Thumbnail ─────────────────────────────────────── */}
        <StepCard n={1} active={active === 1} done={thumb?.state === 'approved'}
          title="Thumbnail" summary={thumb ? THUMB_LABEL[thumb.state] : 'Not generated'}
          onToggle={() => setOpenStep(p => p === 1 ? null : 1)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ width: 140, aspectRatio: '16/9', background: '#111', border: '1px solid var(--border-light)', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {thumb?.jpg_url
                  ? <img src={thumb.jpg_url} alt="" style={{ width: '100%', display: 'block' }} />
                  : <span style={{ color: 'var(--ink3)', fontSize: 11 }}>No thumbnail</span>}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {thumb && <div style={{ fontSize: 13, fontWeight: 800, color: THUMB_COLOR[thumb.state] }}>● {THUMB_LABEL[thumb.state]}</div>}
                {thumb?.issues.map((i, k) => <div key={k} style={{ fontSize: 12.5, color: i.level === 'attention' ? 'var(--red)' : i.level === 'warning' ? 'var(--amber)' : 'var(--ink3)' }}>{i.text}</div>)}
                {thumbMsg && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{thumbMsg}</div>}
                {thumbMissing.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>Templates not configured — set them in the Thumbnails tab.</div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {thumbCanEdit && (
                    <Button variant={thumb?.state === 'new' || thumb?.state === 'changed' ? 'teal' : 'ghost'}
                      disabled={thumbBusy || thumbMissing.length > 0 || (thumb?.issues ?? []).some(i => i.level === 'attention')}
                      onClick={() => void thumbGenerate()}>
                      {thumbBusy ? 'Generating…' : thumb?.png_url ? 'Regenerate' : 'Generate'}
                    </Button>
                  )}
                  {thumbCanEdit && thumb?.state === 'ready' && <Button variant="lime" disabled={thumbBusy} onClick={() => void thumbApproveAct('approve')}>Approve</Button>}
                  {thumbCanEdit && thumb?.state === 'approved' && <Button variant="ghost" disabled={thumbBusy} onClick={() => void thumbApproveAct('unapprove')}>Remove approval</Button>}
                  {thumb?.jpg_url && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${sessionId}&format=jpg`}>Download JPG</Button>}
                </div>
              </div>
            </div>
          </div>
        </StepCard>

        {/* ── Step 2: Upload ────────────────────────────────────────── */}
        <StepCard n={2} active={active === 2} done={!!(video && video.status !== 'uploading')}
          title="Upload video" summary={video ? (video.source_ref ?? 'Video uploaded') : 'No video yet'}
          onToggle={() => setOpenStep(p => p === 2 ? null : 2)}>
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Existing video */}
            {video && video.status !== 'uploading' && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 13 }}><strong>{video.source_ref}</strong>{video.size_bytes ? ` · ${(video.size_bytes / 1024 / 1024 / 1024).toFixed(2)} GB` : ''}</div>
                {!confirmRemove
                  ? <div><Button variant="ghost" onClick={() => setConfirmRemove(true)}>Replace video…</Button></div>
                  : <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--red)' }}>Remove this video and all processing? This cannot be undone.</span>
                      <Button variant="ghost" onClick={() => void doRemove()}>Yes, remove</Button>
                      <Button variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Button>
                    </div>}
              </div>
            )}

            {/* Drive import progress */}
            {video?.status === 'uploading' && !uploading && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 13, color: 'var(--amber)' }}>{video.drive_file_id ? 'Importing from Google Drive…' : 'Upload in progress…'}</div>
                {video.bytes_transferred != null && video.size_bytes ? (
                  <>
                    <div style={{ height: 4, background: 'var(--border-light)', borderRadius: 99, maxWidth: 300, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(video.bytes_transferred / video.size_bytes * 100)}%`, height: '100%', background: 'var(--teal-mid)', transition: 'width .3s' }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{Math.round(video.bytes_transferred / video.size_bytes * 100)}%</div>
                  </>
                ) : null}
              </div>
            )}

            {/* Upload forms */}
            {!video && !list?.storage_ready && (
              <div style={{ fontSize: 13, color: 'var(--amber)' }}>Video storage is not configured (VIDEO_R2_* on Railway).</div>
            )}
            {!video && list?.storage_ready && (
              <div style={{ display: 'grid', gap: 16 }}>
                {uploadErr && <div style={{ fontSize: 13, color: 'var(--red)' }}>{uploadErr}</div>}

                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: 'var(--ink2)' }}>From your computer</div>
                  <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void startFileUpload(f) }} />
                  {uploading ? (
                    <div>
                      <div style={{ height: 4, background: 'var(--border-light)', borderRadius: 99, maxWidth: 280, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(uploadPct * 100)}%`, height: '100%', background: 'var(--teal-mid)', transition: 'width .3s' }} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>{Math.round(uploadPct * 100)}% uploading…</div>
                    </div>
                  ) : (
                    <Button variant="teal" onClick={() => fileRef.current?.click()}>Choose a video file…</Button>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: 'var(--ink2)' }}>From Google Drive (file picker)</div>
                  <DrivePickerButton disabled={uploading} onPick={f => void startDrivePick(f)} />
                </div>

                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: 'var(--ink2)' }}>From Google Drive (share link)</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 220 }}><Input placeholder="https://drive.google.com/file/d/…" value={driveLink} disabled={uploading} onChange={e => setDriveLink(e.target.value)} /></div>
                    <Button variant="ghost" disabled={uploading || !driveLink.trim()} onClick={() => void startDriveLink()}>Import</Button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>File must be shared with "Anyone with the link".</div>
                </div>
              </div>
            )}
          </div>
        </StepCard>

        {/* ── Step 3: Processing ────────────────────────────────────── */}
        <StepCard n={3} active={active === 3} done={!!(video && ['transcribed', 'text_pending', 'ready', 'approved'].includes(video.status))}
          title="Processing" summary={video ? (STATUS_LABEL[video.status] ?? video.status) : '—'}
          onToggle={() => setOpenStep(p => p === 3 ? null : 3)}>
          {!video ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Waiting for video upload.</div>
          ) : video.status === 'failed' ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--red)' }}>Processing failed</div>
              {video.error && <div style={{ fontSize: 12.5, color: 'var(--ink2)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{video.error}</div>}
              <div><Button variant="teal" onClick={() => void doRetry()}>Retry</Button></div>
            </div>
          ) : BUSY.has(video.status) ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--amber)' }}>{STATUS_LABEL[video.status] ?? video.status}</span>
              </div>
              {detail?.jobs?.slice(0, 4).map(j => (
                <div key={j.id} style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'monospace' }}>
                  {j.kind}: {j.status}{j.error ? ` — ${j.error.slice(0, 100)}` : ''}{j.log ? ` · ${j.log.slice(-120)}` : ''}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {detail?.jobs?.slice(0, 4).map(j => (
                <div key={j.id} style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'monospace' }}>
                  ✓ {j.kind}: {j.status}
                </div>
              ))}
            </div>
          )}
        </StepCard>

        {/* ── Step 4: Name voices ───────────────────────────────────── */}
        <StepCard n={4} active={active === 4} done={!!(tr?.named_at)}
          title="Name voices" summary={tr?.named_at ? 'Named' : (video?.status === 'transcribed' ? 'Ready' : 'Waiting for transcript')}
          onToggle={() => setOpenStep(p => p === 4 ? null : 4)}>
          {!tr ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Waiting for transcript…</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {(voices ?? tr.voices).map(v => {
                const summary = tr.summaries?.find(s => s.voice_id === v.voice_id)
                const clipUrl = tr.voice_clip_urls?.[v.voice_id] ?? null
                const aiSug = tr.voice_suggestions?.find(s => s.voice_id === v.voice_id)
                const localV = voices?.find(x => x.voice_id === v.voice_id) ?? v

                return (
                  <div key={v.voice_id} style={{ background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: 14, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{v.voice_id}</span>
                      {summary && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{Math.floor(summary.seconds / 60)}m {summary.seconds % 60}s · {summary.segments} segments</span>}
                      {aiSug?.suggested_speaker_id && aiSug.confidence !== 'low' && (
                        <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 20, background: 'var(--teal-mid)', color: 'white', fontWeight: 700 }}>
                          AI: {spNames.get(aiSug.suggested_speaker_id) ?? aiSug.suggested_speaker_id}
                        </span>
                      )}
                    </div>

                    {/* Video clip (best for identification) */}
                    {clipUrl && (
                      <video controls src={clipUrl} style={{ width: '100%', maxHeight: 220, borderRadius: 6, background: '#000', display: 'block' }}>
                        Your browser does not support video playback.
                      </video>
                    )}

                    {/* Text quotes when no clip */}
                    {!clipUrl && summary?.quotes?.slice(0, 2).map((q, qi) => (
                      <div key={qi} style={{ fontSize: 12.5, color: 'var(--ink3)', fontStyle: 'italic', borderLeft: '3px solid var(--border-light)', paddingLeft: 10 }}>
                        <span style={{ fontSize: 11, color: 'var(--ink3)', fontStyle: 'normal' }}>{fmt(q.start)} </span>"{q.text}"
                      </div>
                    ))}

                    {/* Speaker chips */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(detail?.speakers ?? []).map(sp => {
                        const sel = localV.speaker_id === sp.id && !localV.rejected
                        return (
                          <button key={sp.id} type="button"
                            onClick={() => setVoices(prev => (prev ?? tr.voices).map(x => x.voice_id === v.voice_id ? { ...x, speaker_id: sp.id, rejected: false } : x))}
                            style={{ padding: '5px 13px', borderRadius: 20, border: `1.5px solid ${sel ? 'var(--teal-mid)' : 'var(--border-light)'}`, background: sel ? 'var(--teal-mid)' : 'var(--surface)', color: sel ? 'white' : 'var(--ink2)', fontSize: 12.5, fontWeight: sel ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {spkName(sp)}
                          </button>
                        )
                      })}
                      <button type="button"
                        onClick={() => setVoices(prev => (prev ?? tr.voices).map(x => x.voice_id === v.voice_id ? { ...x, speaker_id: null, rejected: true } : x))}
                        style={{ padding: '5px 13px', borderRadius: 20, border: `1.5px solid ${localV.rejected ? 'var(--red)' : 'var(--border-light)'}`, background: localV.rejected ? 'var(--red)' : 'var(--surface)', color: localV.rejected ? 'white' : 'var(--ink3)', fontSize: 12.5, fontWeight: localV.rejected ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Not a speaker
                      </button>
                    </div>
                  </div>
                )
              })}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="teal" disabled={!voicesComplete || voiceSaving} onClick={() => void saveVoicesAndRequest()}>
                  {voiceSaving ? 'Saving…' : tr.named_at ? 'Re-save & regenerate text →' : 'Save & generate text →'}
                </Button>
                {!voicesComplete && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Assign each voice or mark "Not a speaker"</span>}
              </div>
            </div>
          )}
        </StepCard>

        {/* ── Step 5: Titles & description ──────────────────────────── */}
        <StepCard n={5} active={active === 5} done={!!(detail?.text && isApproved)}
          title="Titles & description" summary={detail?.text ? (selTitle ?? titles[0] ?? 'No title selected') : (video?.status === 'text_pending' ? 'Generating…' : 'Waiting for text generation')}
          onToggle={() => setOpenStep(p => p === 5 ? null : 5)}>
          {!detail?.text ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
              {video?.status === 'text_pending' ? 'Generating text — this takes about a minute…' : 'Complete the Name voices step first.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* Titles */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>YouTube titles <span style={{ fontWeight: 400, color: 'var(--ink3)', fontSize: 12 }}>(select one to use)</span></div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {titles.map((t, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="radio" name="selTitle" checked={selTitle === t} onChange={() => { setSelTitle(t); setTextEdited(true) }} style={{ flexShrink: 0 }} />
                      <input type="text" value={t}
                        onChange={e => { const nv = [...titles]; nv[i] = e.target.value; setTitles(nv); if (selTitle === t) setSelTitle(e.target.value); setTextEdited(true) }}
                        style={{ flex: 1, fontSize: 16, fontWeight: 700, padding: '7px 11px', border: '1px solid var(--border-light)', borderRadius: 7, background: 'var(--surface)', fontFamily: 'inherit', color: 'var(--ink1)' }}
                      />
                      {titles.length > 1 && (
                        <button type="button" onClick={() => { const nv = titles.filter((_, j) => j !== i); setTitles(nv); if (selTitle === t) setSelTitle(nv[0] ?? null); setTextEdited(true) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
                      )}
                    </div>
                  ))}
                  {titles.length < 5 && (
                    <button type="button" onClick={() => { setTitles(prev => [...prev, '']); setTextEdited(true) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--teal-mid)', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>
                      + Add title
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Description</div>
                <textarea value={desc}
                  onChange={e => { setDesc(e.target.value); setTextEdited(true) }}
                  rows={10}
                  style={{ width: '100%', fontSize: 15, lineHeight: 1.65, padding: '10px 12px', border: '1px solid var(--border-light)', borderRadius: 8, background: 'var(--surface)', fontFamily: 'inherit', color: 'var(--ink1)', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Findings */}
              {(() => {
                const f = detail.text.findings as { event_figures?: string[]; problems?: string[]; placeholders?: string[] }
                const all = [...(f.event_figures ?? []).map(x => `Event figure not allowed: ${x}`), ...(f.problems ?? []), ...(f.placeholders ?? []).map(x => `Unresolved placeholder: ${x}`)]
                return all.length > 0 ? (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {all.map((m, i) => <div key={i} style={{ fontSize: 12.5, color: 'var(--red)' }}>⚠ {m}</div>)}
                  </div>
                ) : null
              })()}

              {textMsg && <div style={{ fontSize: 13, color: textMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{textMsg}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="teal" disabled={textSaving} onClick={() => void doSaveText()}>{textSaving ? 'Saving…' : 'Save changes'}</Button>
                <Button variant="ghost" onClick={() => setOpenStep(6)}>Review & approve →</Button>
              </div>
            </div>
          )}
        </StepCard>

        {/* ── Step 6: Approve ───────────────────────────────────────── */}
        <StepCard n={6} active={active === 6} done={isApproved}
          title="Approve" summary={isApproved ? 'Approved' : (detail?.text ? 'Ready to review' : 'Waiting for text')}
          onToggle={() => setOpenStep(p => p === 6 ? null : 6)}>
          {!detail?.text ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Complete the Titles &amp; description step first.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selected title</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selTitle ?? detail.text.selected_title ?? '— no title selected —'}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Description</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto', color: 'var(--ink1)' }}>
                  {desc || detail.text.description_working}
                </div>
              </div>

              {!detail.footer_approved && (
                <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>Note: the YouTube footer in the description may need a final review.</div>
              )}

              {actionErr && <div style={{ fontSize: 13, color: 'var(--red)' }}>{actionErr}</div>}

              {isApproved ? (
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--green)' }}>
                  ✓ Approved{detail.text.approved_at ? ` on ${new Date(detail.text.approved_at).toLocaleDateString()}` : ''}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div><Button variant="lime" onClick={() => void doApprove()}>Approve for publishing →</Button></div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Once approved, this video's title, description and thumbnail are ready for YouTube upload.</div>
                </div>
              )}
            </div>
          )}
        </StepCard>

        {/* ── Step 7: Lower-third cues ──────────────────────────── */}
        <StepCard n={7} active={active === 7} done={hasCues}
          title="Lower-third cues" summary={hasCues ? `${cues!.length} cue${cues!.length === 1 ? '' : 's'}` : (isApproved ? 'Ready to generate' : 'Approve text first')}
          onToggle={() => setOpenStep(p => p === 7 ? null : 7)}>
          <div style={{ display: 'grid', gap: 12 }}>
            {!isApproved ? (
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Approve the text first (Step 6).</div>
            ) : (
              <>
                <div>
                  <Button variant={hasCues ? 'ghost' : 'teal'} disabled={cuesBusy || !detail?.transcript?.named_at} onClick={() => void doGenerateCues()}>
                    {cuesBusy ? 'Generating…' : hasCues ? 'Regenerate cues' : 'Generate cues from transcript'}
                  </Button>
                  {!detail?.transcript?.named_at && <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 8 }}>Name the voices first (Step 4).</span>}
                </div>
                {cuesMsg && <div style={{ fontSize: 12.5, color: cuesMsg === 'Cues generated.' ? 'var(--green)' : 'var(--red)' }}>{cuesMsg}</div>}
                {hasCues && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {(cues ?? []).map(cue => {
                      const sp = detail?.speakers.find(s => s.id === cue.speaker_id)
                      return (
                        <div key={cue.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 60, fontFamily: 'monospace' }}>{fmt(cue.start_s)}</span>
                          <span style={{ fontSize: 13, flex: 1 }}>{sp ? spkName(sp) : cue.speaker_id.slice(0, 8)}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" disabled={cuesBusy} onClick={() => void doMoveCue(cue.id, -5)} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 5, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>−5s</button>
                            <button type="button" disabled={cuesBusy} onClick={() => void doMoveCue(cue.id, -1)} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 5, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>−1s</button>
                            <button type="button" disabled={cuesBusy} onClick={() => void doMoveCue(cue.id, 1)} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 5, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>+1s</button>
                            <button type="button" disabled={cuesBusy} onClick={() => void doMoveCue(cue.id, 5)} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 5, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>+5s</button>
                            <button type="button" disabled={cuesBusy} onClick={() => void doDeleteCue(cue.id)} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--red)', borderRadius: 5, background: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </StepCard>

        {/* ── Step 8: Render & preview ──────────────────────────── */}
        <StepCard n={8} active={active === 8} done={renderDone}
          title="Render & preview" summary={
            renderDone ? 'Final render done' :
            renderStatus === 'rendering' ? 'Rendering final…' :
            previewDone ? 'Preview ready — approve to render final' :
            renderStatus === 'preview_rendering' ? 'Generating preview…' :
            (isApproved && hasCues) ? 'Ready to generate preview' : 'Complete steps 6 & 7 first'
          }
          onToggle={() => setOpenStep(p => p === 8 ? null : 8)}>
          <div style={{ display: 'grid', gap: 12 }}>
            {!(isApproved && hasCues) ? (
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Complete text approval (Step 6) and cues (Step 7) first.</div>
            ) : (
              <>
                {renderMsg && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{renderMsg}</div>}
                {(detail?.video as VideoRec | null)?.render_error && <div style={{ fontSize: 12, color: 'var(--red)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{(detail!.video as VideoRec).render_error}</div>}

                {!previewDone && (
                  <Button variant="teal" disabled={renderBusy || renderStatus === 'preview_rendering'} onClick={() => void doRequestPreview()}>
                    {renderStatus === 'preview_rendering' ? 'Generating preview…' : 'Generate preview'}
                  </Button>
                )}

                {previewDone && previewUrl && (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Preview</div>
                    <video controls src={previewUrl} style={{ width: '100%', maxHeight: 320, borderRadius: 8, background: '#000', display: 'block' }} />
                  </div>
                )}
                {previewDone && !previewUrl && renderStatus === 'preview_done' && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Preview ready — loading playback link…</div>
                )}

                {previewDone && renderStatus === 'preview_done' && (
                  <Button variant="lime" disabled={renderBusy} onClick={() => void doRequestRender()}>
                    Approve & render final →
                  </Button>
                )}
                {renderStatus === 'rendering' && <div style={{ fontSize: 13, color: 'var(--amber)' }}>Rendering final video…</div>}
                {renderDone && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--green)' }}>✓ Final render complete</div>}
              </>
            )}
          </div>
        </StepCard>

      </div>
    </div>
  )
}

function StepCard({ n, title, active, done, summary, onToggle, children }: {
  n: number; title: string; active: boolean; done: boolean; summary: string
  onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ border: `1.5px solid ${active ? 'var(--teal-mid)' : done ? 'var(--green)' : 'var(--border-light)'}`, borderRadius: 12, overflow: 'hidden' }}>
      <button type="button" onClick={onToggle}
        style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 14px', width: '100%', background: 'var(--card)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
          border: `2px solid ${done ? 'var(--green)' : active ? 'var(--teal-mid)' : 'var(--border-light)'}`,
          background: done ? 'var(--green)' : active ? 'var(--teal-mid)' : 'transparent',
          color: done || active ? 'white' : 'var(--ink3)' }}>
          {done ? '✓' : n}
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: active ? 'var(--teal-mid)' : 'var(--ink1)' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 4 }}>{summary}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>▼</span>
      </button>
      {active && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ height: 1, background: 'var(--border-light)', margin: '0 0 14px' }} />
          {children}
        </div>
      )}
    </div>
  )
}
