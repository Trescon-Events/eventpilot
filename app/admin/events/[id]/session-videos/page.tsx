'use client'

/* eslint-disable @next/next/no-img-element -- the approved thumbnail is an arbitrary stored image */

import { use, useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Select } from '@/app/components/ui'
import DrivePickerButton, { type DriveFile } from '@/app/components/session-videos/DrivePickerButton'
import { fmtTime } from '@/app/lib/session-videos/logic'

/* Session Videos, Phase 1 (docs/build_suggestions/session-video-pipeline.md): upload a recorded session, confirm which agenda session it is, name the voices, then review the titles, description,
   chapters and tags. Nothing is published from here. The heavy work (FFmpeg, transcript, text) runs in the worker. */

type Finding = { rule_key: string; severity: 'error' | 'warning'; message: string; match: string }
type Video = { id: string; source_ref: string | null; status: string; error: string | null; duration_s: number | null; size_bytes: number | null; bytes_transferred: number | null; drive_file_id: string | null; agenda_session_id: string | null; created_at: string }
type Sess = { id: string; title: string; content_type: string | null; starts: string | null; speakers: string[] }
type Job = { id: string; kind: string; status: string; attempts: number; error: string | null; log: Array<{ at: string; line: string }> }
type Speaker = { id: string; name: string; title: string | null; company: string | null; moderator: boolean }
type Voice = { voice_id: string; speaker_id: string | null; rejected: boolean }
type Summary = { voice_id: string; seconds: number; segments: number; quotes: Array<{ start: number; text: string }> }
type Seg = { start: number; end: number; voice_id: string; text: string }
type Chapter = { start_s: number; title: string }
type TextRow = { titles: string[]; selected_title: string | null; description_working: string | null; description_approved: string | null; chapters: Chapter[]; tags: string[]; approved_at: string | null; findings: { titles?: Finding[][]; description?: Finding[]; event_figures?: string[]; chapters?: string[]; problems?: string[]; footer?: string; placeholders?: string[] } }
type Detail = { video: Video & { match_suggestions?: Array<{ session_id: string; title: string; score: number }> | null }; jobs: Job[]; session: { title: string; content_type: string | null } | null; speakers: Speaker[]; proxy_url: string | null
  transcript: { voices: Voice[]; summaries: Summary[]; named_at: string | null; segments: Seg[]; model: string | null } | null; text: TextRow | null; thumbnail: { png_url: string | null; jpg_url: string | null; approved: boolean } | null }

const STATUS: Record<string, { label: string; color: string }> = {
  uploading: { label: 'Uploading', color: 'var(--amber)' }, uploaded: { label: 'Uploaded, waiting for the worker', color: 'var(--ink3)' }, ingesting: { label: 'Preparing copies', color: 'var(--amber)' },
  ingested: { label: 'Copies ready', color: 'var(--ink3)' }, transcribing: { label: 'Transcribing', color: 'var(--amber)' }, transcribed: { label: 'Name the voices', color: 'var(--teal-mid)' },
  text_pending: { label: 'Writing the text', color: 'var(--amber)' }, ready: { label: 'Ready to review', color: 'var(--teal-mid)' }, approved: { label: 'Approved', color: 'var(--green)' }, failed: { label: 'Failed', color: 'var(--red)' },
}
const BUSY = new Set(['uploaded', 'ingesting', 'ingested', 'transcribing', 'text_pending'])
const mb = (n: number | null) => (n ? `${n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : Math.round(n / 1e6) + ' MB'}` : '')

export default function SessionVideosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [list, setList] = useState<{ storage_ready: boolean; videos: Video[]; sessions: Sess[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [up, setUp] = useState<{ name: string; pct: number; note: string } | null>(null)
  const resumeRef = useRef<{ id: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!list?.videos.some(v => BUSY.has(v.status) || v.status === 'uploading')) return; const t = setInterval(() => { void load() }, 6000); return () => clearInterval(t) }, [list, load])

  /** Sends the file in 64 MB parts straight to storage (3 at a time, each retried), skipping parts already there (resume), then finishes the upload. */
  async function upload(file: File, existing?: { id: string }) {
    try {
      setErr(null)
      let id: string, partSize: number, total: number
      const done = new Set<number>()
      if (existing) {
        const r = await api('list_parts', { id: existing.id }); id = existing.id; partSize = r.part_size; total = Math.ceil(file.size / partSize)
        for (const p of r.parts as Array<{ PartNumber: number }>) done.add(p.PartNumber)
      } else { const c = await api('create', { file_name: file.name, size: file.size, content_type: file.type }); id = c.id; partSize = c.part_size; total = c.parts }
      let sent = [...done].length * partSize
      setUp({ name: file.name, pct: Math.min(99, Math.round((sent / file.size) * 100)), note: existing ? `Resuming: ${done.size} of ${total} parts are already there` : 'Starting' })
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
              x.onerror = () => reject(new Error(`Part ${n}: network or storage CORS error`)); x.send(blob)
            })
            progress.delete(n); sent += blob.size; tick(); return
          } catch (e) { progress.delete(n); if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))) }
        }
      }
      let next = 0
      await Promise.all(Array.from({ length: 3 }, async () => { while (next < todo.length) { const n = todo[next++]; await sendPart(n) } }))
      setUp(u => u && { ...u, pct: 99, note: 'Finishing' })
      await api('complete', { id }); setUp(null); await load(); setOpenId(id)
    } catch (e) { setErr(`${e instanceof Error ? e.message : 'Upload failed.'} Select the same file again with "Resume" to continue where it stopped.`); setUp(null); await load() }
  }

  async function importFromDrive(f: DriveFile) {
    try {
      setErr(null)
      await api('create_from_drive', { drive_file_id: f.id, access_token: f.accessToken, file_name: f.name, size: f.sizeBytes, content_type: f.mimeType })
      await load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the Drive import.') }
  }

  const uploading = list?.videos.filter(v => v.status === 'uploading') ?? []
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <PageHeader eyebrow="Event Workspace" title="Session Videos" description="Upload a recorded session, confirm the agenda session, name the voices, then review the transcript, titles, description, chapters and tags. Nothing is published from here." backHref={`/admin/events/${eventId}`} />
      {err && <div style={{ color: 'var(--red)', fontSize: '13px' }}>{err}</div>}
      {list && !list.storage_ready && <Card padded><div style={{ fontSize: '13px', color: 'var(--amber)' }}><strong>Video storage is not set up yet.</strong> The VIDEO_R2_* settings are missing on this service, so uploads are switched off.</div></Card>}
      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Upload</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', margin: '4px 0 10px' }}>An MP4 of one session, already switched and trimmed, English only. It goes straight to storage in parts, so a large file is fine and a dropped connection can be resumed.</div>
        <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const r = resumeRef.current; resumeRef.current = null; void upload(f, r ?? undefined) }} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="teal" disabled={!list?.storage_ready || !!up} onClick={() => { resumeRef.current = null; fileRef.current?.click() }}>Choose a video…</Button>
          <DrivePickerButton disabled={!list?.storage_ready || !!up} onPick={f => void importFromDrive(f)} />
          {uploading.filter(v => !v.drive_file_id).map(v => <Button key={v.id} variant="ghost" disabled={!!up} onClick={() => { resumeRef.current = { id: v.id }; fileRef.current?.click() }}>Resume {v.source_ref} ({mb(v.size_bytes)})</Button>)}
        </div>
        {up && <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '12.5px', marginBottom: '4px' }}><strong>{up.name}</strong> · {up.pct}% · {up.note}</div>
          <div style={{ height: '8px', background: 'var(--border-light)', borderRadius: '99px', overflow: 'hidden' }}><div style={{ width: `${up.pct}%`, height: '100%', background: 'var(--teal-mid)', transition: 'width .3s' }} /></div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '4px' }}>Keep this tab open until it finishes.</div>
        </div>}
      </Card>
      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>Session videos ({list?.videos.length ?? 0})</div>
        {!list && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
        {list && list.videos.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>None yet.</div>}
        <div style={{ display: 'grid', gap: '6px' }}>
          {list?.videos.map(v => (
            <button key={v.id} type="button" onClick={() => setOpenId(openId === v.id ? null : v.id)} style={{ textAlign: 'left', border: `1.5px solid ${openId === v.id ? 'var(--teal-mid)' : 'var(--border-light)'}`, background: 'var(--surface)', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
              <span style={{ fontWeight: 800, fontSize: '13px' }}>{v.source_ref}</span> <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{mb(v.size_bytes)}{v.duration_s ? ` · ${fmtTime(v.duration_s)}` : ''}</span>
              <span style={{ float: 'right', fontSize: '12px', fontWeight: 800, color: STATUS[v.status]?.color }}>{v.drive_file_id && v.status === 'uploading' ? `Importing from Drive${v.bytes_transferred && v.size_bytes ? ` · ${Math.round(v.bytes_transferred / v.size_bytes * 100)}%` : ''}` : (STATUS[v.status]?.label ?? v.status)}</span>
              {v.drive_file_id && v.status === 'uploading' && v.bytes_transferred != null && v.size_bytes && (
                <div style={{ marginTop: '4px', height: '4px', background: 'var(--border-light)', borderRadius: '99px', overflow: 'hidden' }}><div style={{ width: `${Math.round(v.bytes_transferred / v.size_bytes * 100)}%`, height: '100%', background: 'var(--teal-mid)', transition: 'width .3s' }} /></div>
              )}
            </button>
          ))}
        </div>
      </Card>
      {openId && list && <VideoPanel key={openId} eventId={eventId} id={openId} sessions={list.sessions} api={api} onChanged={load} onRemoved={() => { setOpenId(null); void load() }} />}
    </div>
  )
}

function VideoPanel({ eventId, id, sessions, api, onChanged, onRemoved }: { eventId: string; id: string; sessions: Sess[]; api: (a: string, b?: Record<string, unknown>) => Promise<any>; onChanged: () => void; onRemoved: () => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!d || !BUSY.has(d.video.status)) return; const t = setInterval(() => { void load(); onChanged() }, 6000); return () => clearInterval(t) }, [d, load, onChanged])
  // keep what is being edited when the data reloads under it; (re)start the editors only when the stored data changes identity
  const textKey = d?.text ? `${d.text.selected_title}|${d.text.description_working?.length}|${d.text.approved_at}|${d.text.titles.join('|')}` : ''
  // eslint-disable-next-line react-hooks/set-state-in-effect -- derive the editor from the loaded text
  useEffect(() => { if (d?.text) setEdit({ titles: d.text.titles, selected: d.text.selected_title ?? d.text.titles[0] ?? '', desc: d.text.description_working ?? '', chapters: d.text.chapters, tags: d.text.tags.join(', ') }) }, [textKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/set-state-in-effect -- derive the voice editor from the loaded transcript
  useEffect(() => { if (d?.transcript && !voices) setVoices(d.transcript.voices) }, [d, voices])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- preselect the best file-name match
  useEffect(() => { if (d && !pick) setPick(d.video.agenda_session_id ?? d.video.match_suggestions?.[0]?.session_id ?? '') }, [d, pick])

  async function run(label: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(label); setMsg(null)
    try { await fn(); if (ok) setMsg({ t: ok }); await load(); onChanged() } catch (e) { setMsg({ t: e instanceof Error ? e.message : 'Failed.', bad: true }) } finally { setBusy(null) }
  }
  function play(start: number) { const p = playerRef.current; if (!p || !d?.proxy_url) return; if (!p.src) p.src = d.proxy_url; p.currentTime = Math.max(0, start - 1); void p.play() }

  if (!d) return <Card padded><div style={{ color: 'var(--ink3)', fontSize: '13px' }}>{msg?.t ?? 'Loading…'}</div></Card>
  const v = d.video, st = STATUS[v.status]
  const names = new Map(d.speakers.map(s => [s.id, s.name]))
  const label = (vid: string) => { const x = d.transcript?.voices.find(y => y.voice_id === vid); return x?.rejected ? 'Other voice' : x?.speaker_id ? names.get(x.speaker_id) ?? 'Speaker' : vid }
  const findings = d.text?.findings ?? {}
  const descFindings = findings.description ?? []
  const section = (n: number, title: string, children: React.ReactNode, active = true) => (
    <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px', opacity: active ? 1 : 0.5 }}>
      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal-mid)', marginBottom: '6px' }}>{n}. {title}</div>{children}
    </div>
  )
  const copyAll = async () => { if (!edit) return; try { await navigator.clipboard.writeText(`${edit.selected}\n\n${edit.desc}\n\nTags: ${edit.tags}`); setMsg({ t: 'Title, description and tags copied.' }) } catch { setMsg({ t: 'Could not copy: select the text and copy it by hand.', bad: true }) } }
  const dirty = !!edit && !!d.text && (edit.selected !== (d.text.selected_title ?? '') || edit.desc !== (d.text.description_working ?? '') || edit.tags !== d.text.tags.join(', ') || JSON.stringify(edit.chapters) !== JSON.stringify(d.text.chapters) || JSON.stringify(edit.titles) !== JSON.stringify(d.text.titles))

  return (
    <Card padded>
      <div style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '15px', fontWeight: 800 }}>{v.source_ref}</div>
          <span style={{ fontSize: '12px', fontWeight: 800, color: st?.color }}>{st?.label}</span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" disabled={!!busy} onClick={() => { if (confirm('Remove this video from EventPilot? This deletes the uploaded copy and everything made from it.')) void run('remove', async () => { await api('remove', { id }); onRemoved() }) }}>Remove</Button>
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
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{d.transcript.summaries.length} voice{d.transcript.summaries.length === 1 ? '' : 's'} detected. Listen to a sample, then say who it is. Choose &ldquo;Not a speaker&rdquo; for an MC, audience question or interpreter.{!v.agenda_session_id ? ' Confirm the agenda session above first.' : ''}</div>
            <video ref={playerRef} controls preload="none" style={{ width: '100%', maxWidth: '420px', borderRadius: '8px', background: 'var(--surface)' }} />
            {d.transcript.summaries.map(s => {
              const cur = voices.find(x => x.voice_id === s.voice_id) ?? { voice_id: s.voice_id, speaker_id: null, rejected: false }
              return (
                <div key={s.voice_id} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '8px 10px', display: 'grid', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '13px' }}>{s.voice_id}</strong><span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{fmtTime(s.seconds)} speaking, {s.segments} turns</span>
                    <Select value={cur.rejected ? '__no' : cur.speaker_id ?? ''} disabled={!v.agenda_session_id} onChange={e => setVoices(voices.map(x => x.voice_id === s.voice_id ? { ...x, rejected: e.target.value === '__no', speaker_id: e.target.value && e.target.value !== '__no' ? e.target.value : null } : x))}>
                      <option value="">Unassigned (shown as Speaker)</option>
                      {d.speakers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}{sp.moderator ? ' (Moderator)' : ''}</option>)}
                      <option value="__no">Not a speaker</option>
                    </Select>
                  </div>
                  {s.quotes.map((qq, i) => <div key={i} style={{ fontSize: '12.5px' }}><button type="button" onClick={() => play(qq.start)} disabled={!d.proxy_url} style={{ border: 'none', background: 'none', color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>▶ {fmtTime(qq.start)}</button> “{qq.text}”</div>)}
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
              {(findings.titles ?? []).flat().map((f, i) => <div key={i} style={{ fontSize: '12px', color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>{f.severity} · “{f.match}”: {f.message}</div>)}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>Description</div>
              <textarea value={edit.desc} onChange={e => setEdit({ ...edit, desc: e.target.value })} rows={18} style={{ width: '100%', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px', fontFamily: 'inherit', fontSize: '13px', background: 'var(--surface)', color: 'inherit' }} />
              <div style={{ display: 'grid', gap: '2px', marginTop: '4px' }}>
                {descFindings.map((f, i) => <div key={i} style={{ fontSize: '12px', color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>{f.severity} · “{f.match}”: {f.message}</div>)}
                {(findings.event_figures?.length ?? 0) > 0 && <div style={{ fontSize: '12px', color: 'var(--red)' }}>Event figures found ({findings.event_figures!.join('; ')}). Session videos carry no event figures: remove them to approve.</div>}
                {findings.footer === 'missing' && <div style={{ fontSize: '12px', color: 'var(--amber)' }}>Footer not approved yet: approve the YouTube footer in the Copy Library, then write the text again to add it.</div>}
                {(findings.placeholders?.length ?? 0) > 0 && <div style={{ fontSize: '12px', color: 'var(--amber)' }}>Fill in {findings.placeholders!.join(', ')} before this is published (the playlist does not exist yet).</div>}
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
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Changing a chapter here updates the list, not the description above: edit the Chapters lines in the description too.</div>
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
                  <div style={{ fontSize: '12.5px' }}>{d.thumbnail.approved ? 'Approved on Session Thumbnails.' : 'Not approved yet on Session Thumbnails.'} <a href={d.thumbnail.jpg_url ?? d.thumbnail.png_url ?? '#'} download style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>Download</a></div>
                </div>
              ) : <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No thumbnail generated for this session yet: make it on the Session Thumbnails page.</div>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="ghost" disabled={!!busy || !dirty} onClick={() => run('save', () => api('save_text', { id, selected_title: edit.selected, titles: edit.titles, description_working: edit.desc, chapters: edit.chapters, tags: edit.tags.split(',').map(x => x.trim()).filter(Boolean) }), 'Saved. Checked against the rules again.')}>Save edits</Button>
              <Button variant="teal" disabled={!!busy || dirty || v.status === 'approved'} onClick={() => run('approve', () => api('approve', { id }), 'Approved.')}>{v.status === 'approved' ? 'Approved' : dirty ? 'Save edits to approve' : 'Approve'}</Button>
              <Button variant="ghost" onClick={copyAll}>Copy all (title, description, tags)</Button>
            </div>
          </div>
        ))}

        {d.transcript && section(6, 'Transcript', (
          <div style={{ display: 'grid', gap: '6px' }}>
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the transcript" style={{ maxWidth: '320px' }} />
            <div style={{ maxHeight: '320px', overflow: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px', fontSize: '12.5px', display: 'grid', gap: '3px' }}>
              {d.transcript.segments.filter(s => !q.trim() || s.text.toLowerCase().includes(q.trim().toLowerCase())).map((s, i) => <div key={i}><button type="button" onClick={() => play(s.start)} disabled={!d.proxy_url} style={{ border: 'none', background: 'none', color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>{fmtTime(s.start)}</button> <strong>{label(s.voice_id)}:</strong> {s.text}</div>)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
