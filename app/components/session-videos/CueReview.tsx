'use client'

/* eslint-disable @next/next/no-img-element -- lower-third overlay is a transparent remote PNG laid over a video frame */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/app/components/ui'
import { LT_TOTAL_DEFAULT } from '@/app/lib/lower-thirds/config'

/* Step 7 — review the lower-third cues before any render starts.
   For every cue the producer sees a snapshot of the actual video at that moment with the speaker's lower third drawn over it,
   the exact time, and can nudge or delete it. When every cue looks right they confirm once; any later change to the cues
   makes the confirmation stale automatically (the server compares fingerprints), so a changed cue can never slip into a render. */

type Cue = { id: string; speaker_id: string; start_s: number }
type Lt = { speaker_id: string; status: string; still_url: string | null; ready: boolean }
type Review = { cues: Cue[]; confirmed: boolean; lowerThirds: Lt[]; setupMissing: string[]; sessionId: string | null }
type Speaker = { id: string; name: string; public_name: string | null }

export type CueReviewSummary = { count: number; confirmed: boolean }

const LT_SECONDS = LT_TOTAL_DEFAULT
const fmt = (s: number) => { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}` }
const parseTime = (v: string): number | null => {
  const m = v.trim().match(/^(\d+):([0-5]?\d)$/) ; if (m) return Number(m[1]) * 60 + Number(m[2])
  const n = Number(v.trim()); return Number.isFinite(n) && v.trim() !== '' ? n : null
}

/** One paused frame of the video at `at` seconds. Re-seeks live when the cue is nudged. */
function Frame({ src, at, duration, still, name }: { src: string; at: number; duration: number | null; still: string | null; name: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [shown, setShown] = useState(false)
  // Look a little after the cue starts so the lower third has finished fading in.
  const seekTo = Math.max(0, Math.min(at + 1.5, (duration ?? at + 10) - 0.2))
  useEffect(() => { const v = ref.current; if (v && v.readyState >= 1) { setShown(false); v.currentTime = seekTo } }, [seekTo])
  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9', background: 'var(--card)', borderRadius: 8, overflow: 'hidden' }}>
      <video ref={ref} src={src} muted playsInline preload="metadata"
        onLoadedMetadata={e => { e.currentTarget.currentTime = seekTo }}
        onSeeked={() => setShown(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', opacity: shown ? 1 : 0.15, transition: 'opacity .2s' }} />
      {!shown && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12 }}>Loading frame…</div>}
      {shown && (still
        ? <img src={still} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        : <div style={{ position: 'absolute', left: 12, bottom: 12, padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 12, borderRadius: 6 }}>{name} — lower third not made yet</div>)}
    </div>
  )
}

export default function CueReview({ eventId, videoId, proxyUrl, durationS, speakers, canGenerate, onSummary }: {
  eventId: string; videoId: string; proxyUrl: string | null; durationS: number | null
  speakers: Speaker[]; canGenerate: boolean; onSummary: (s: CueReviewSummary) => void
}) {
  const [data, setData] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [addFor, setAddFor] = useState<Record<string, string>>({})
  const preparedFor = useRef<string>('')
  const nameOf = (id: string) => { const s = speakers.find(x => x.id === id); return s ? (s.public_name || s.name) : 'Unknown speaker' }

  const api = useCallback(async (action: string | null, body: Record<string, unknown> = {}): Promise<Review> => {
    const r = action
      ? await fetch(`/api/events/session-videos/${videoId}/cues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, action, ...body }) })
      : await fetch(`/api/events/session-videos/${videoId}/cues?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({})) as Review & { error?: string }
    if (!r.ok) throw new Error(j.error ?? 'Something went wrong.')
    return j
  }, [eventId, videoId])

  // Cue actions return only the cues; always refresh the whole review state afterwards.
  const run = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null)
    try { await api(action, body); setData(await api(null)) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }, [api])

  useEffect(() => { api(null).then(setData).catch(e => setMsg(e instanceof Error ? e.message : 'Could not load the cues.')) }, [api])

  useEffect(() => { if (data) onSummary({ count: data.cues.length, confirmed: data.confirmed }) }, [data, onSummary])

  // Make sure every cued speaker has a lower-third clip (the render silently skips those that don't) — automatically, once per cue set.
  useEffect(() => {
    if (!data || !data.cues.length || data.setupMissing.length) return
    const byId = new Map(data.lowerThirds.map(l => [l.speaker_id, l]))
    const need = [...new Set(data.cues.map(c => c.speaker_id))].filter(id => { const l = byId.get(id); return !l?.ready && l?.status !== 'generating' })
    const key = need.sort().join(',')
    if (!need.length || preparedFor.current === key) return
    preparedFor.current = key
    void run('prepare')
  }, [data, run])

  // While lower-third clips are being made, check back every few seconds.
  const preparing = !!data && data.cues.some(c => !data.lowerThirds.find(l => l.speaker_id === c.speaker_id)?.ready)
  useEffect(() => {
    if (!preparing || !data || data.setupMissing.length) return
    const t = setInterval(() => { api(null).then(setData).catch(() => undefined) }, 4000)
    return () => clearInterval(t)
  }, [preparing, data, api])

  if (!data) return <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{msg ?? 'Loading…'}</div>

  const ltOf = (id: string) => data.lowerThirds.find(l => l.speaker_id === id)
  const cuedIds = new Set(data.cues.map(c => c.speaker_id))
  const uncued = speakers.filter(s => !cuedIds.has(s.id))
  const readyCount = [...cuedIds].filter(id => ltOf(id)?.ready).length
  const allReady = cuedIds.size > 0 && readyCount === cuedIds.size
  const ghost = { padding: '3px 8px', fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 5, background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink2)' } as const

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6 }}>
        Each box shows the video at the moment a speaker&apos;s name appears, with their lower third on top. Check the right person is on screen, move the time if not, then confirm. Nothing is rendered until you confirm.
      </div>

      {data.setupMissing.length > 0 && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: 13, lineHeight: 1.6 }}>
          The lower-third design isn&apos;t set up yet: {data.setupMissing.join('; ')}.{' '}
          Set it up in <Link href={`/admin/events/${eventId}/creative-templates/admin?tab=lower_thirds`} style={{ color: 'var(--teal)', fontWeight: 700 }}>Admin Console → Lower Thirds</Link> (upload the graphic and save).
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant={data.cues.length ? 'ghost' : 'teal'} disabled={busy || !canGenerate} onClick={() => { preparedFor.current = ''; void run('generate') }}>
          {busy ? 'Working…' : data.cues.length ? 'Regenerate cues from transcript' : 'Find where to show lower thirds'}
        </Button>
        {!canGenerate && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Name the voices first (Step 4).</span>}
        {data.cues.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{data.cues.length} lower third{data.cues.length === 1 ? '' : 's'} · {cuedIds.size} speaker{cuedIds.size === 1 ? '' : 's'}</span>}
      </div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{msg}</div>}

      {data.cues.length > 0 && !data.setupMissing.length && preparing && (
        <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>Preparing the animated lower thirds ({readyCount} of {cuedIds.size} ready) — this takes a minute or two. You can already check the frames below.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {data.cues.map((cue, i) => {
          const lt = ltOf(cue.speaker_id)
          return (
            <div key={cue.id} style={{ border: '1px solid var(--border-light)', borderRadius: 10, padding: 10, display: 'grid', gap: 8, background: 'var(--surface)' }}>
              {proxyUrl
                ? <Frame src={proxyUrl} at={cue.start_s} duration={durationS} still={lt?.still_url ?? null} name={nameOf(cue.speaker_id)} />
                : <div style={{ aspectRatio: '16 / 9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink4)', fontSize: 12, background: 'var(--card)', borderRadius: 8 }}>Video not ready</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{i + 1}. {nameOf(cue.speaker_id)}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  shows at <b style={{ fontFamily: 'monospace' }}>{fmt(cue.start_s)}</b>{durationS ? ` of ${fmt(durationS)}` : ''} · {LT_SECONDS.toFixed(1)}s
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {([-5, -1, 1, 5] as const).map(d => <button key={d} type="button" disabled={busy} onClick={() => void run('move', { cue_id: cue.id, delta_s: d })} style={ghost}>{d > 0 ? '+' : '−'}{Math.abs(d)}s</button>)}
                <button type="button" disabled={busy} onClick={() => void run('delete', { cue_id: cue.id })} style={{ ...ghost, border: '1px solid var(--red)', color: 'var(--red)', marginLeft: 'auto' }}>Remove</button>
              </div>
              {!lt?.ready && !data.setupMissing.length && <div style={{ fontSize: 11.5, color: 'var(--amber)' }}>{lt?.status === 'generating' ? 'Animated lower third is being made…' : 'Lower third not made yet — starting…'}</div>}
            </div>
          )
        })}
      </div>

      {data.cues.length > 0 && uncued.length > 0 && (
        <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--amber-border)', background: 'var(--amber-light)', display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 700 }}>These speakers have no lower third yet:</div>
          {uncued.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--ink2)' }}>
              <span style={{ minWidth: 140 }}>{s.public_name || s.name}</span>
              <input value={addFor[s.id] ?? ''} onChange={e => setAddFor(p => ({ ...p, [s.id]: e.target.value }))} placeholder="m:ss" style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5 }} />
              <button type="button" disabled={busy || parseTime(addFor[s.id] ?? '') === null} onClick={() => { const t = parseTime(addFor[s.id] ?? ''); if (t !== null) { preparedFor.current = ''; void run('add', { speaker_id: s.id, start_s: t }) } }} style={ghost}>Add at this time</button>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Optional — add one if you want them introduced on screen. Type where they first speak, e.g. 1:30.</div>
        </div>
      )}

      {data.cues.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
          {data.confirmed ? (
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>✓ Confirmed — {data.cues.length} lower third{data.cues.length === 1 ? '' : 's'} will appear exactly as shown. Continue to Step 8.</div>
          ) : (
            <>
              <Button variant="teal" disabled={busy || !allReady || data.setupMissing.length > 0} onClick={() => void run('confirm')}>
                These look right — confirm {data.cues.length} lower third{data.cues.length === 1 ? '' : 's'}
              </Button>
              {!allReady && !data.setupMissing.length && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Available once the animated lower thirds are ready.</span>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
