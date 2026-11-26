'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card } from '@/app/components/ui'
import VideoKitTab from '@/app/components/session-videos/VideoKitTab'

/* Session Videos hub: two tabs — Videos (session list → per-session flow) and Video Kit (event assets + each session's
   thumbnail, title card and lower thirds: generate, review, approve). Templates are set up in the Admin Console. */

type Video = { id: string; source_ref: string | null; status: string; agenda_session_id: string | null; size_bytes: number | null; bytes_transferred: number | null; drive_file_id: string | null; duration_s: number | null }
type Sess = { id: string; title: string; content_type: string | null; starts: string | null; speakers: string[] }
type Tab = 'videos' | 'kit'

const VIDEO_STATUS: Record<string, { label: string; color: string }> = {
  uploading: { label: 'Uploading', color: 'var(--amber)' }, uploaded: { label: 'Processing', color: 'var(--amber)' },
  ingesting: { label: 'Preparing', color: 'var(--amber)' }, ingested: { label: 'Processing', color: 'var(--amber)' },
  transcribing: { label: 'Transcribing', color: 'var(--amber)' }, transcribed: { label: 'Name voices', color: 'var(--teal-mid)' },
  text_pending: { label: 'Writing text', color: 'var(--amber)' }, ready: { label: 'Review text', color: 'var(--teal-mid)' },
  approved: { label: 'Approved', color: 'var(--success)' }, failed: { label: 'Failed', color: 'var(--red)' },
}
const BUSY = new Set(['uploaded', 'ingesting', 'ingested', 'transcribing', 'text_pending'])

export default function SessionVideosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [tab, setTab] = useState<Tab>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'kit' ? 'kit' : 'videos'))

  const [videoData, setVideoData] = useState<{ storage_ready: boolean; videos: Video[]; sessions: Sess[] } | null>(null)
  const [videoErr, setVideoErr] = useState<string | null>(null)
  const [vidType, setVidType] = useState('all')
  const [vidStatus, setVidStatus] = useState('all')

  const loadVideos = useCallback(async () => {
    const r = await fetch(`/api/events/session-videos?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j) { setVideoErr(j?.error || 'Could not load.'); return }
    setVideoErr(null); setVideoData(j)
  }, [eventId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadVideos() }, [loadVideos])
  useEffect(() => {
    if (!videoData?.videos?.some(v => BUSY.has(v.status) || v.status === 'uploading')) return
    const t = setInterval(() => { void loadVideos() }, 6000); return () => clearInterval(t)
  }, [videoData, loadVideos])

  const videoBySession = useMemo(() => {
    const m = new Map<string, Video>()
    for (const v of [...(videoData?.videos ?? [])].reverse()) { if (v.agenda_session_id) m.set(v.agenda_session_id, v) }
    return m
  }, [videoData])

  const vidTypes = useMemo(() => [...new Set((videoData?.sessions ?? []).map(s => s.content_type ?? 'None'))].sort(), [videoData])

  const filteredVideoSessions = useMemo(() => (videoData?.sessions ?? []).filter(s => {
    if (vidType !== 'all' && (s.content_type ?? 'None') !== vidType) return false
    if (vidStatus !== 'all') {
      const v = videoBySession.get(s.id)
      if (vidStatus === 'none' && v) return false
      if (vidStatus !== 'none' && (!v || (VIDEO_STATUS[v.status]?.label ?? v.status) !== vidStatus)) return false
    }
    return true
  }), [videoData, videoBySession, vidType, vidStatus])

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
      <PageHeader eyebrow="Stakeholder Hub" title="Session Videos" description="Videos: upload each recorded session and take it through to the finished video. Video Kit: the intro, music and every session's thumbnail, title card and lower thirds — generate, review and approve them." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholder Hub" />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '20px' }}>
        <button type="button" style={tabBtn(tab === 'videos')} onClick={() => setTab('videos')}>Videos</button>
        <button type="button" style={tabBtn(tab === 'kit')} onClick={() => setTab('kit')}>Video Kit</button>
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

      {tab === 'kit' && <VideoKitTab eventId={eventId} />}
    </div>
  )
}
