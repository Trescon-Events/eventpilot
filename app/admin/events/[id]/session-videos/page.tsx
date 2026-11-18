'use client'

/* eslint-disable @next/next/no-img-element -- approved thumbnail is an arbitrary stored image */

import { use, useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Select } from '@/app/components/ui'
import DrivePickerButton, { requestDriveToken, type DriveFile } from '@/app/components/session-videos/DrivePickerButton'
import { fmtTime } from '@/app/lib/session-videos/logic'

/* Session Videos, Phase 2 (session-indexed workflow): sessions are the primary entry point. Each session has a video slot. Upload from within a session, name the detected voices using
   per-voice clips and speaker chips, then review/approve the generated titles, description and chapters. Nothing is published from here. */

type Finding = { rule_key: string; severity: 'error' | 'warning'; message: string; match: string }
type Video = { id: string; source_ref: string | null; status: string; error: string | null; duration_s: number | null; size_bytes: number | null; bytes_transferred: number | null; drive_file_id: string | null; agenda_session_id: string | null; created_at: string }
type Sess = { id: string; title: string; content_type: string | null; starts: string | null; speakers: string[] }
type Job = { id: string; kind: string; status: string; attempts: number; error: string | null; log: Array<{ at: string; line: string }> }
type Speaker = { id: string; name: string; title: string | null; company: string | null; moderator: boolean }
type Voice = { voice_id: string; speaker_id: string | null; rejected: boolean }
type Summary = { voice_id: string; seconds: number; segments: number; quotes: Array<{ start: number; text: string }> }
type Seg = { start: number; end: number; voice_id: string; text: string }
type Chapter = { start_s: number; title: string }
type VoiceSuggestion = { voice_id: string; suggested_speaker_id: string | null; confidence: string }
type TextRow = { titles: string[]; selected_title: string | null; description_working: string | null; description_approved: string | null; chapters: Chapter[]; tags: string[]; approved_at: string | null; findings: { titles?: Finding[][]; description?: Finding[]; event_figures?: string[]; chapters?: string[]; problems?: string[]; footer?: string; placeholders?: string[] } }
type Detail = { video: Video & { match_suggestions?: Array<{ session_id: string; title: string; score: number }> | null }; jobs: Job[]; session: { title: string; content_type: string | null } | null; speakers: Speaker[]; proxy_url: string | null
  transcript: { voices: Voice[]; summaries: Summary[]; named_at: string | null; segments: Seg[]; model: string | null; voice_clip_urls: Record<string, string>; voice_suggestions: VoiceSuggestion[] } | null; text: TextRow | null; thumbnail: { png_url: string | null; jpg_url: string | null; approved: boolean } | null }

const STATUS: Record<string, { label: string; color: string }> = {
  uploading: { label: 'Uploading', color: 'var(--amber)' }, uploaded: { label: 'Uploaded', color: 'var(--ink3)' }, ingesting: { label: 'Preparing copies', color: 'var(--amber)' },
  ingested: { label: 'Copies ready', color: 'var(--ink3)' }, transcribing: { label: 'Transcribing', color: 'var(--amber)' }, transcribed: { label: 'Name the voices', color: 'var(--teal-mid)' },
  text_pending: { label: 'Writing the text', color: 'var(--amber)' }, ready: { label: 'Ready to review', color: 'var(--teal-mid)' }, approved: { label: 'Approved', color: 'var(--green)' }, failed: { label: 'Failed', color: 'var(--red)' },
}
const BUSY = new Set(['uploaded', 'ingesting', 'ingested', 'transcribing', 'text_pending'])
const mb = (n: number | null) => n ? (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`) : ''

export default function SessionVideosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [list, setList] = useState<{ storage_ready: boolean; videos: Video[]; sessions: Sess[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)   // session id, or 'vid:<videoId>' for unlinked
  const [up, setUp] = useState<{ name: string; pct: number; note: string } | null>(null)
  const [driveLink, setDriveLink] = useState('')
  const [driveImporting, setDriveImporting] = useState(false)
  const resumeRef = useRef<{ id: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileSessionRef = useRef<string | null>(null)   // which session the pending file pick is for

  const api = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    const r = await fetch('/api/events/session-videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, action, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'That did not work.')
    return j
  }, [eventId])

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/session-videos?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j) { setErr(j?.error || 'Could not load.'); return }
    setErr(null); setList(j)
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!list?.videos.some(v => BUSY.has(v.status) || v.status === 'uploading')) return; const t = setInterval(() => { void load() }, 6000); return () => clearInterval(t) }, [list, load])
  // Clear drive link when switching sessions
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDriveLink('') }, [openId])

  async function upload(file: File, sessionId: string | null, existing?: { id: string }) {
    try {
      setErr(null)
      let id: string, partSize: number, total: number
      const done = new Set<number>()
      if (existing) {
        const r = await api('list_parts', { id: existing.id }); id = existing.id; partSize = r.part_size; total = Math.ceil(file.size / partSize)
        for (const p of r.parts as Array<{ PartNumber: number }>) done.add(p.PartNumber)
      } else {
        const c = await api('create', { file_name: file.name, size: file.size, content_type: file.type, ...(sessionId ? { agenda_session_id: sessionId } : {}) })
        id = c.id; partSize = c.part_size; total = c.parts
      }
      let sent = [...done].length * partSize
      setUp({ name: file.name, pct: Math.min(99, Math.round((sent / file.size) * 100)), note: existing ? `Resuming: ${done.size} of ${total} parts already there` : 'Starting' })
      const todo = Array.from({ length: total }, (_, i) => i + 1).filter(n => !done.has(n))
      const progress = new Map<number, number>()
      const tick = () => { const cur = sent + [...progress.values()].reduce((a, b) => a + b, 0); setUp(u => u && { ...u, pct: Math.min(99, Math.round((cur / file.size) * 100)), note: `${mb(cur)} of ${mb(file.size)}` }) }
      const sendPart = async (n: number) => {
        const blob = file.slice((n - 1) * partSize, Math.min(file.size, n * partSize))
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const { urls } = await api('presign_parts', { id, part_numbers: [n] })
            await new Promise<void>((resolve, reject) => {
              const x = new XMLHttpRequest(); x.open('PUT', urls[0].url)
              x.upload.onprogress = e => { progress.set(n, e.loaded); tick() }
              x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Part ${n}: ${x.status}`)))
              x.onerror = () => reject(new Error(`Part ${n}: network error`)); x.send(blob)
            })
            progress.delete(n); sent += blob.size; tick(); return
          } catch (e) { progress.delete(n); if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))) }
        }
      }
      let next = 0
      await Promise.all(Array.from({ length: 3 }, async () => { while (next < todo.length) { const n = todo[next++]; await sendPart(n) } }))
      setUp(u => u && { ...u, pct: 99, note: 'Finishing' })
      await api('complete', { id }); setUp(null); await load(); if (sessionId) setOpenId(sessionId)
    } catch (e) { setErr(`${e instanceof Error ? e.message : 'Upload failed.'} Select the same file again with "Resume" to continue.`); setUp(null); await load() }
  }

  async function importFromDriveLink(sessionId: string | null) {
    if (!driveLink.trim()) return
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID
    if (!clientId) { setErr('Google Drive is not configured.'); return }
    setDriveImporting(true); setErr(null)
    try {
      const idMatch = driveLink.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ?? driveLink.match(/[?&]id=([a-zA-Z0-9_-]+)/)
      if (!idMatch) throw new Error('Could not find a file ID in that link. Paste the full Google Drive sharing URL.')
      const fileId = idMatch[1]
      const token = await requestDriveToken(clientId)
      const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name%2Csize%2CmimeType`, { headers: { Authorization: `Bearer ${token}` } })
      if (!metaRes.ok) { const body = await metaRes.text().catch(() => ''); throw new Error(`Could not read that Drive file (${metaRes.status}): ${body.slice(0, 120)}`) }
      const meta = await metaRes.json() as { name: string; size: string; mimeType: string }
      await api('create_from_drive', { drive_file_id: fileId, access_token: token, file_name: meta.name, size: parseInt(meta.size, 10), content_type: meta.mimeType, ...(sessionId ? { agenda_session_id: sessionId } : {}) })
      setDriveLink(''); await load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not import from that link.') }
    finally { setDriveImporting(false) }
  }

  async function importFromDrive(f: DriveFile, sessionId: string | null) {
    try {
      setErr(null)
      await api('create_from_drive', { drive_file_id: f.id, access_token: f.accessToken, file_name: f.name, size: f.sizeBytes, content_type: f.mimeType, ...(sessionId ? { agenda_session_id: sessionId } : {}) })
      await load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the Drive import.') }
  }

  // Index videos by session (most recent wins per session, since listVideos is newest-first)
  const videoBySession = new Map<string, Video>()
  for (const v of [...(list?.videos ?? [])].reverse()) { if (v.agenda_session_id) videoBySession.set(v.agenda_session_id, v) }
  const unlinked = (list?.videos ?? []).filter(v => !v.agenda_session_id)

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <PageHeader eyebrow="Event Workspace" title="Session Videos" description="Upload a recorded session video, name the detected voices, then review titles, description, chapters and tags. Nothing is published from here." backHref={`/admin/events/${eventId}`} />
      {err && <div style={{ color: 'var(--red)', fontSize: '13px' }}>{err}</div>}
      {list && !list.storage_ready && <Card padded><div style={{ fontSize: '13px', color: 'var(--amber)' }}><strong>Video storage is not set up yet.</strong> The VIDEO_R2_* environment variables are missing, so uploads are switched off.</div></Card>}

      {/* Hidden file input — session for the pending pick is in fileSessionRef */}
      <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const r = resumeRef.current; resumeRef.current = null; const sid = fileSessionRef.current; fileSessionRef.current = null; void upload(f, sid, r ?? undefined) }} />

      {/* Upload progress */}
      {up && (
        <Card padded>
          <div style={{ fontSize: '12.5px', marginBottom: '4px' }}><strong>{up.name}</strong> · {up.pct}% · {up.note}</div>
          <div style={{ height: '8px', background: 'var(--border-light)', borderRadius: '99px', overflow: 'hidden' }}><div style={{ width: `${up.pct}%`, height: '100%', background: 'var(--teal-mid)', transition: 'width .3s' }} /></div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '4px' }}>Keep this tab open until it finishes.</div>
        </Card>
      )}

      {/* Sessions (primary entry point) */}
      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>Sessions ({list?.sessions.length ?? 0})</div>
        {!list && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
        {list && list.sessions.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>No speaker sessions on the agenda yet.</div>}
        <div style={{ display: 'grid', gap: '4px' }}>
          {list?.sessions.map(session => {
            const video = videoBySession.get(session.id) ?? null
            const isOpen = openId === session.id
            const st = video ? STATUS[video.status] : null
            const driveProgress = video?.drive_file_id && video.status === 'uploading' && video.bytes_transferred != null && video.size_bytes ? Math.round(video.bytes_transferred / video.size_bytes * 100) : null
            const resumeVideo = (list.videos ?? []).find(v => v.agenda_session_id === session.id && v.status === 'uploading' && !v.drive_file_id)

            return (
              <div key={session.id} style={{ border: `1.5px solid ${isOpen ? 'var(--teal-mid)' : 'var(--border-light)'}`, borderRadius: '10px', overflow: 'hidden' }}>
                <button type="button" onClick={() => setOpenId(isOpen ? null : session.id)} style={{ width: '100%', textAlign: 'left', background: isOpen ? 'var(--surface-alt, #f5f7f7)' : 'var(--surface)', border: 'none', padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '13px', flex: 1, minWidth: 0 }}>{session.title}</span>
                  {session.content_type && <span style={{ fontSize: '11.5px', color: 'var(--ink3)', flexShrink: 0 }}>{session.content_type}</span>}
                  {session.speakers.length > 0 && <span style={{ fontSize: '11.5px', color: 'var(--ink3)', flexShrink: 0 }}>· {session.speakers.slice(0, 2).join(', ')}{session.speakers.length > 2 ? ` +${session.speakers.length - 2}` : ''}</span>}
                  <span style={{ flexShrink: 0, fontSize: '12px', fontWeight: 800, color: st?.color ?? 'var(--ink3)' }}>
                    {driveProgress !== null ? `Importing · ${driveProgress}%` : st?.label ?? 'No video'}
                  </span>
                </button>
                {driveProgress !== null && (
                  <div style={{ height: '3px', background: 'var(--border-light)', margin: '0 14px 6px' }}><div style={{ width: `${driveProgress}%`, height: '100%', background: 'var(--teal-mid)', transition: 'width .3s' }} /></div>
                )}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border-light)', padding: '14px' }}>
                    {video ? (
                      <VideoPanel key={video.id} eventId={eventId} id={video.id} sessions={list.sessions} api={api} onChanged={load} onRemoved={() => { setOpenId(null); void load() }} />
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No video yet. Upload an MP4 of this session.</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <Button variant="teal" disabled={!list.storage_ready || !!up} onClick={() => { fileSessionRef.current = session.id; resumeRef.current = null; fileRef.current?.click() }}>Choose a video…</Button>
                          <DrivePickerButton disabled={!list.storage_ready || !!up} onPick={f => void importFromDrive(f, session.id)} />
                          {resumeVideo && <Button variant="ghost" disabled={!!up} onClick={() => { resumeRef.current = { id: resumeVideo.id }; fileSessionRef.current = session.id; fileRef.current?.click() }}>Resume {resumeVideo.source_ref} ({mb(resumeVideo.size_bytes)})</Button>}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <Input value={driveLink} onChange={e => setDriveLink(e.target.value)} placeholder="Or paste a Google Drive link…" style={{ flex: 1, maxWidth: '480px' }} onKeyDown={e => { if (e.key === 'Enter' && driveLink.trim() && !driveImporting && list.storage_ready) void importFromDriveLink(session.id) }} />
                          <Button variant="ghost" disabled={!driveLink.trim() || driveImporting || !list.storage_ready} onClick={() => void importFromDriveLink(session.id)}>{driveImporting ? 'Starting…' : 'Import'}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Unlinked videos (uploaded before a session was matched, or via the section below) */}
      {unlinked.length > 0 && (
        <Card padded>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '4px' }}>Unlinked videos ({unlinked.length})</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '8px' }}>Open a video and use step 1 to link it to the right session.</div>
          <div style={{ display: 'grid', gap: '4px' }}>
            {unlinked.map(v => {
              const isOpen = openId === `vid:${v.id}`
              const st = STATUS[v.status]
              const driveProgress = v.drive_file_id && v.status === 'uploading' && v.bytes_transferred != null && v.size_bytes ? Math.round(v.bytes_transferred / v.size_bytes * 100) : null
              return (
                <div key={v.id} style={{ border: `1.5px solid ${isOpen ? 'var(--teal-mid)' : 'var(--border-light)'}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <button type="button" onClick={() => setOpenId(isOpen ? null : `vid:${v.id}`)} style={{ width: '100%', textAlign: 'left', background: isOpen ? 'var(--surface-alt, #f5f7f7)' : 'var(--surface)', border: 'none', padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px' }}>{v.source_ref}</span>
                    <span style={{ fontSize: '12px', color: 'var(--ink3)', marginLeft: '6px' }}>{mb(v.size_bytes)}{v.duration_s ? ` · ${fmtTime(v.duration_s)}` : ''}</span>
                    <span style={{ float: 'right', fontSize: '12px', fontWeight: 800, color: st?.color }}>
                      {driveProgress !== null ? `Importing · ${driveProgress}%` : st?.label ?? v.status}
                    </span>
                  </button>
                  {driveProgress !== null && (
                    <div style={{ height: '3px', background: 'var(--border-light)', margin: '0 14px 6px' }}><div style={{ width: `${driveProgress}%`, height: '100%', background: 'var(--teal-mid)', transition: 'width .3s' }} /></div>
                  )}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border-light)', padding: '14px' }}>
                      <VideoPanel key={v.id} eventId={eventId} id={v.id} sessions={list?.sessions ?? []} api={api} onChanged={load} onRemoved={() => { setOpenId(null); void load() }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* General upload — for a video that is not yet on the session list */}
      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Upload without session</div>
        <div style={{ fontSize: '12px', color: 'var(--ink3)', margin: '4px 0 8px' }}>If the session is not on the agenda yet, upload here and link it once the session is added.</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="ghost" disabled={!list?.storage_ready || !!up} onClick={() => { fileSessionRef.current = null; resumeRef.current = null; fileRef.current?.click() }}>Choose a video…</Button>
          <DrivePickerButton disabled={!list?.storage_ready || !!up} onPick={f => void importFromDrive(f, null)} />
        </div>
      </Card>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VideoPanel({ eventId, id, sessions, api, onChanged, onRemoved }: { eventId: string; id: string; sessions: Sess[]; api: (a: string, b?: Record<string, unknown>) => Promise<any>; onChanged: () => void; onRemoved: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pick, setPick] = useState<string>('')
  const [voices, setVoices] = useState<Voice[] | null>(null)
  const [edit, setEdit] = useState<{ titles: string[]; selected: string; desc: string; chapters: Chapter[]; tags: string } | null>(null)
  const [q, setQ] = useState('')
  const playerRef = useRef<HTMLVideoElement>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/session-videos?event_id=${eventId}&id=${id}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j) { setMsg({ t: j?.error || 'Could not load.', bad: true }); return }
    setD(j as Detail)
  }, [eventId, id])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const identifyRunning = d?.jobs.some(j => j.kind === 'identify' && (j.status === 'running' || j.status === 'queued'))
    if (!d || (!BUSY.has(d.video.status) && !identifyRunning)) return
    const t = setInterval(() => { void load(); onChanged() }, 6000)
    return () => clearInterval(t)
  }, [d, load, onChanged])
  const textKey = d?.text ? `${d.text.selected_title}|${d.text.description_working?.length}|${d.text.approved_at}|${d.text.titles.join('|')}` : ''
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (d?.text) setEdit({ titles: d.text.titles, selected: d.text.selected_title ?? d.text.titles[0] ?? '', desc: d.text.description_working ?? '', chapters: d.text.chapters, tags: d.text.tags.join(', ') }) }, [textKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (d?.transcript && !voices) setVoices(d.transcript.voices) }, [d, voices])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (d && !pick) setPick(d.video.agenda_session_id ?? d.video.match_suggestions?.[0]?.session_id ?? '') }, [d, pick])

  async function run(label: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(label); setMsg(null)
    try { await fn(); if (ok) setMsg({ t: ok }); await load(); onChanged() } catch (e) { setMsg({ t: e instanceof Error ? e.message : 'Failed.', bad: true }) } finally { setBusy(null) }
  }
  function play(start: number) { const p = playerRef.current; if (!p || !d?.proxy_url) return; if (!p.src) p.src = d.proxy_url; p.currentTime = Math.max(0, start - 1); void p.play() }

  if (!d) return <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>{msg?.t ?? 'Loading…'}</div>
  const v = d.video, st = STATUS[v.status]
  const names = new Map(d.speakers.map(s => [s.id, s.name]))
  const label = (vid: string) => { const x = d.transcript?.voices.find(y => y.voice_id === vid); return x?.rejected ? 'Other voice' : x?.speaker_id ? names.get(x.speaker_id) ?? 'Speaker' : vid }
  const findings = d.text?.findings ?? {}
  const descFindings = findings.description ?? []
  const hasClips = Object.keys(d.transcript?.voice_clip_urls ?? {}).length > 0
  const section = (n: number, title: string, children: React.ReactNode, active = true) => (
    <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px', opacity: active ? 1 : 0.5 }}>
      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal-mid)', marginBottom: '6px' }}>{n}. {title}</div>{children}
    </div>
  )
  const copyAll = async () => { if (!edit) return; try { await navigator.clipboard.writeText(`${edit.selected}\n\n${edit.desc}\n\nTags: ${edit.tags}`); setMsg({ t: 'Title, description and tags copied.' }) } catch { setMsg({ t: 'Could not copy: select the text and copy it by hand.', bad: true }) } }
  const dirty = !!edit && !!d.text && (edit.selected !== (d.text.selected_title ?? '') || edit.desc !== (d.text.description_working ?? '') || edit.tags !== d.text.tags.join(', ') || JSON.stringify(edit.chapters) !== JSON.stringify(d.text.chapters) || JSON.stringify(edit.titles) !== JSON.stringify(d.text.titles))

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '14px', fontWeight: 800 }}>{v.source_ref}</div>
        <span style={{ fontSize: '12px', fontWeight: 800, color: st?.color }}>{st?.label}</span>
        {v.duration_s ? <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{fmtTime(v.duration_s)}</span> : null}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" disabled={!!busy} onClick={() => { if (confirm('Remove this video and everything made from it?')) void run('remove', async () => { await api('remove', { id }); onRemoved() }) }}>Remove</Button>
      </div>
      {msg && <div style={{ fontSize: '12.5px', color: msg.bad ? 'var(--red)' : 'var(--teal-mid)', fontWeight: 700 }}>{msg.t}</div>}
      {v.error && <div style={{ fontSize: '12.5px', color: 'var(--red)' }}>{v.error} <Button variant="ghost" disabled={!!busy} onClick={() => run('retry', () => api('retry', { id }), 'Queued again.')}>Retry</Button></div>}

      {section(1, 'Which agenda session is this?', (
        <div style={{ display: 'grid', gap: '6px' }}>
          {(v.match_suggestions?.length ?? 0) > 0 && !v.agenda_session_id && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Best match from the file name: {v.match_suggestions!.slice(0, 2).map(m => m.title).join(' · ')}</div>}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Select value={pick} onChange={e => setPick(e.target.value)} style={{ maxWidth: '520px' }}>
              <option value="">Choose the session…</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.title}{s.content_type ? ` (${s.content_type})` : ''}{s.speakers.length ? ` · ${s.speakers.slice(0, 2).join(', ')}` : ''}</option>)}
            </Select>
            <Button variant="teal" disabled={!pick || pick === v.agenda_session_id || !!busy} onClick={() => run('session', () => api('set_session', { id, session_id: pick }), 'Session confirmed.')}>{v.agenda_session_id ? 'Change session' : 'Confirm session'}</Button>
          </div>
          {d.session && <div style={{ fontSize: '12.5px' }}><strong>{d.session.title}</strong> · {d.speakers.map(s => `${s.name}${s.moderator ? ' (Moderator)' : ''}`).join(', ') || 'no speakers on the agenda'}</div>}
        </div>
      ))}

      {section(2, 'Processing', (
        <div style={{ display: 'grid', gap: '4px', fontSize: '12.5px' }}>
          {d.jobs.length === 0 && <div style={{ color: 'var(--ink3)' }}>Waiting for the upload to finish.</div>}
          {d.jobs.map(j => <div key={j.id}><strong>{j.kind.replace('_', ' ')}</strong>: {j.status}{j.attempts > 1 ? ` (attempt ${j.attempts})` : ''}{j.error ? ` · ${j.error}` : ''}{j.status === 'running' && j.log.length ? <span style={{ color: 'var(--ink3)' }}> · {j.log[j.log.length - 1].line}</span> : null}</div>)}
        </div>
      ))}

      {d.transcript && voices && section(3, 'Name the voices', (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>
            {d.transcript.summaries.length} voice{d.transcript.summaries.length === 1 ? '' : 's'} detected.
            {hasClips ? ' Listen to each clip, then pick who is speaking.' : ' Listen to a sample, then say who is speaking.'}
            {!v.agenda_session_id ? ' Confirm the agenda session above first.' : ''}
          </div>
          {d.transcript.summaries.map(s => {
            const cur = voices.find(x => x.voice_id === s.voice_id) ?? { voice_id: s.voice_id, speaker_id: null, rejected: false }
            const clipUrl = d.transcript!.voice_clip_urls[s.voice_id]
            const suggestion = d.transcript!.voice_suggestions.find(x => x.voice_id === s.voice_id)
            const suggestedName = suggestion?.suggested_speaker_id ? names.get(suggestion.suggested_speaker_id) : null
            return (
              <div key={s.voice_id} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '10px 12px', display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '13px' }}>{s.voice_id}</strong>
                  <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{fmtTime(s.seconds)} speaking · {s.segments} turn{s.segments === 1 ? '' : 's'}</span>
                  {suggestedName && (
                    <span style={{ fontSize: '11px', background: 'var(--teal-light, rgba(0,150,136,0.1))', color: 'var(--teal-mid)', borderRadius: '4px', padding: '2px 8px' }}>
                      AI: {suggestedName}
                    </span>
                  )}
                </div>
                {clipUrl
                  ? <video src={clipUrl} controls preload="metadata" style={{ width: '100%', maxWidth: '300px', borderRadius: '8px' }} />
                  : s.quotes.map((qq, i) => (
                      <div key={i} style={{ fontSize: '12.5px' }}>
                        <button type="button" onClick={() => play(qq.start)} disabled={!d.proxy_url} style={{ border: 'none', background: 'none', color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>▶ {fmtTime(qq.start)}</button> &ldquo;{qq.text}&rdquo;
                      </div>
                    ))
                }
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {d.speakers.map(sp => {
                    const sel = !cur.rejected && cur.speaker_id === sp.id
                    return (
                      <button key={sp.id} type="button" disabled={!v.agenda_session_id}
                        onClick={() => setVoices(voices.map(x => x.voice_id === s.voice_id ? { ...x, speaker_id: sp.id, rejected: false } : x))}
                        style={{ background: sel ? 'var(--teal-mid)' : 'var(--surface)', color: sel ? 'white' : 'inherit', border: `1.5px solid ${sel ? 'var(--teal-mid)' : 'var(--border-light)'}`, borderRadius: '20px', padding: '4px 12px', fontSize: '12.5px', cursor: v.agenda_session_id ? 'pointer' : 'default', fontFamily: 'inherit', transition: 'background .15s' }}>
                        {sp.name}{sp.moderator ? ' (Mod)' : ''}
                      </button>
                    )
                  })}
                  <button type="button"
                    onClick={() => setVoices(voices.map(x => x.voice_id === s.voice_id ? { ...x, speaker_id: null, rejected: true } : x))}
                    style={{ background: 'var(--surface)', color: cur.rejected ? 'var(--red)' : 'var(--ink3)', border: `1.5px solid ${cur.rejected ? 'var(--red)' : 'var(--border-light)'}`, borderRadius: '20px', padding: '4px 12px', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' }}>
                    Not a speaker
                  </button>
                </div>
              </div>
            )
          })}
          <div><Button variant="teal" disabled={!!busy || !v.agenda_session_id} onClick={() => run('voices', () => api('save_voices', { id, voices }), 'Voices saved.')}>{d.transcript.named_at ? 'Save voices again' : 'Save voices'}</Button></div>
        </div>
      ))}

      {d.transcript && section(4, 'Titles, description, chapters and tags', (
        <div style={{ display: 'grid', gap: '6px' }}>
          {!d.text && <Button variant="teal" disabled={!!busy || !d.transcript.named_at || v.status === 'text_pending'} onClick={() => run('text', () => api('make_text', { id }), 'Writing the text: it appears here in about a minute.')}>{v.status === 'text_pending' ? 'Writing…' : 'Write the text'}</Button>}
          {!d.transcript.named_at && !d.text && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Save the voices first.</div>}
          {d.text && <Button variant="ghost" disabled={!!busy || v.status === 'text_pending'} onClick={() => { if (confirm('Write the text again? Your edits to the current text will be replaced.')) void run('text', () => api('make_text', { id }), 'Writing the text again.') }}>Write again</Button>}
        </div>
      ), true)}

      {d.text && edit && section(5, 'Review and approve', (
        <div style={{ display: 'grid', gap: '12px' }}>
          {v.status === 'approved' && <div style={{ fontSize: '13px', color: 'var(--green)', fontWeight: 800 }}>Approved. Nothing has been published: copy it to the manual team below.</div>}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>Title (pick one, edit freely)</div>
            {edit.titles.map((t, i) => (
              <label key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                <input type="radio" name="title" checked={edit.selected === t} onChange={() => setEdit({ ...edit, selected: t })} />
                <Input value={t} onChange={e => { const titles = edit.titles.map((x, k) => k === i ? e.target.value : x); setEdit({ ...edit, titles, selected: edit.selected === t ? e.target.value : edit.selected }) }} style={{ flex: 1 }} />
                <span style={{ fontSize: '11px', color: t.length > 70 ? 'var(--red)' : 'var(--ink3)' }}>{t.length}</span>
              </label>
            ))}
            {(findings.titles ?? []).flat().map((f, i) => <div key={i} style={{ fontSize: '12px', color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>{f.severity} · &ldquo;{f.match}&rdquo;: {f.message}</div>)}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>Description</div>
            <textarea value={edit.desc} onChange={e => setEdit({ ...edit, desc: e.target.value })} rows={18} style={{ width: '100%', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px', fontFamily: 'inherit', fontSize: '13px', background: 'var(--surface)', color: 'inherit' }} />
            <div style={{ display: 'grid', gap: '2px', marginTop: '4px' }}>
              {descFindings.map((f, i) => <div key={i} style={{ fontSize: '12px', color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>{f.severity} · &ldquo;{f.match}&rdquo;: {f.message}</div>)}
              {(findings.event_figures?.length ?? 0) > 0 && <div style={{ fontSize: '12px', color: 'var(--red)' }}>Event figures found ({findings.event_figures!.join('; ')}). Session videos carry no event figures.</div>}
              {findings.footer === 'missing' && <div style={{ fontSize: '12px', color: 'var(--amber)' }}>Footer not approved yet: approve the YouTube footer in the Copy Library, then write the text again.</div>}
              {(findings.placeholders?.length ?? 0) > 0 && <div style={{ fontSize: '12px', color: 'var(--amber)' }}>Fill in {findings.placeholders!.join(', ')} before publishing.</div>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>Chapters</div>
            {edit.chapters.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '3px', alignItems: 'center' }}>
                <Input value={fmtTime(c.start_s)} onChange={e => { const m = e.target.value.trim().split(':').map(Number); if (m.every(n => isFinite(n)) && m.length >= 2) { const s = m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : m[0] * 60 + m[1]; setEdit({ ...edit, chapters: edit.chapters.map((x, k) => k === i ? { ...x, start_s: s } : x) }) } }} style={{ width: '90px' }} />
                <Input value={c.title} onChange={e => setEdit({ ...edit, chapters: edit.chapters.map((x, k) => k === i ? { ...x, title: e.target.value } : x) })} style={{ flex: 1 }} />
              </div>
            ))}
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Edit the Chapters lines in the description too — they are separate.</div>
            {(findings.chapters ?? []).map((c, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--amber)' }}>{c}</div>)}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>Tags</div>
            <Input value={edit.tags} onChange={e => setEdit({ ...edit, tags: e.target.value })} />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>Thumbnail</div>
            {d.thumbnail?.jpg_url || d.thumbnail?.png_url ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <img src={d.thumbnail.jpg_url ?? d.thumbnail.png_url ?? ''} alt="Session thumbnail" style={{ width: '240px', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                <div style={{ fontSize: '12.5px' }}>{d.thumbnail.approved ? 'Approved on Session Thumbnails.' : 'Not approved yet.'} <a href={d.thumbnail.jpg_url ?? d.thumbnail.png_url ?? '#'} download style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>Download</a></div>
              </div>
            ) : <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No thumbnail yet — make it on the Session Thumbnails page.</div>}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="ghost" disabled={!!busy || !dirty} onClick={() => run('save', () => api('save_text', { id, selected_title: edit.selected, titles: edit.titles, description_working: edit.desc, chapters: edit.chapters, tags: edit.tags.split(',').map(x => x.trim()).filter(Boolean) }), 'Saved.')}>Save edits</Button>
            <Button variant="teal" disabled={!!busy || dirty || v.status === 'approved'} onClick={() => run('approve', () => api('approve', { id }), 'Approved.')}>{v.status === 'approved' ? 'Approved' : dirty ? 'Save edits to approve' : 'Approve'}</Button>
            <Button variant="ghost" onClick={copyAll}>Copy all</Button>
          </div>
        </div>
      ))}

      {d.transcript && section(6, 'Transcript', (
        <div style={{ display: 'grid', gap: '6px' }}>
          <video ref={playerRef} controls preload="none" style={{ width: '100%', maxWidth: '420px', borderRadius: '8px', background: 'var(--surface)' }} />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the transcript" style={{ maxWidth: '320px' }} />
          <div style={{ maxHeight: '320px', overflow: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px', fontSize: '12.5px', display: 'grid', gap: '3px' }}>
            {d.transcript.segments.filter(s => !q.trim() || s.text.toLowerCase().includes(q.trim().toLowerCase())).map((s, i) => <div key={i}><button type="button" onClick={() => play(s.start)} disabled={!d.proxy_url} style={{ border: 'none', background: 'none', color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>{fmtTime(s.start)}</button> <strong>{label(s.voice_id)}:</strong> {s.text}</div>)}
          </div>
        </div>
      ))}
    </div>
  )
}
