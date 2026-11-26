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
type Cand = { speaker_id: string; start_s: number; run_s: number; seen?: 'yes' | 'wide' | 'other' | 'unknown' }
type Review = { cues: Cue[]; confirmed: boolean; lowerThirds: Lt[]; setupMissing: string[]; sessionId: string | null; scanStatus: string | null; scanError: string | null; candidates: Cand[]; skipped: string[]; speakers: Array<{ id: string; name: string; moderator: boolean }> }

const SEEN: Record<NonNullable<Cand['seen']>, { label: string; color: string }> = {
  yes: { label: 'Close-up', color: 'var(--green)' }, wide: { label: 'Wide shot', color: 'var(--amber)' },
  other: { label: 'Someone else on screen', color: 'var(--red)' }, unknown: { label: 'Not checked', color: 'var(--ink3)' },
}
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

const PAGE = 3   // options shown per speaker at a time
const ORDER: Record<string, number> = { yes: 0, wide: 1, unknown: 2 }
/** Same ranking as the server's rankOptions: close-ups, then wide shots, then unchecked; longer turns first; never "someone else". */
const rank = (cands: Cand[], sp: string) => cands.filter(c => c.speaker_id === sp && c.seen !== 'other').sort((a, b) => (ORDER[a.seen ?? 'unknown'] ?? 2) - (ORDER[b.seen ?? 'unknown'] ?? 2) || b.run_s - a.run_s)

export default function CueReview({ eventId, videoId, proxyUrl, durationS, speakers, canGenerate, onSummary }: {
  eventId: string; videoId: string; proxyUrl: string | null; durationS: number | null
  speakers: Speaker[]; canGenerate: boolean; onSummary: (s: CueReviewSummary) => void
}) {
  const [data, setData] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [page, setPage] = useState<Record<string, number>>({})       // per speaker: how many "find other moments" clicks
  const [typed, setTyped] = useState<Record<string, string>>({})
  const preparedFor = useRef<string>('')

  const api = useCallback(async (action: string | null, body: Record<string, unknown> = {}): Promise<Review> => {
    const r = action
      ? await fetch(`/api/events/session-videos/${videoId}/cues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, action, ...body }) })
      : await fetch(`/api/events/session-videos/${videoId}/cues?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({})) as Review & { error?: string }
    if (!r.ok) throw new Error(j.error ?? 'Something went wrong.')
    return j
  }, [eventId, videoId])

  const run = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null)
    try { await api(action, body); setData(await api(null)) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }, [api])

  useEffect(() => { api(null).then(setData).catch(e => setMsg(e instanceof Error ? e.message : 'Could not load the cues.')) }, [api])
  useEffect(() => { if (data) onSummary({ count: data.cues.length, confirmed: data.confirmed }) }, [data, onSummary])

  const scanning = data?.scanStatus === 'scanning'
  const preparing = !!data && data.cues.some(c => !data.lowerThirds.find(l => l.speaker_id === c.speaker_id)?.ready)
  // While the worker scans the video, or lower-third clips are being made, check back every few seconds.
  useEffect(() => {
    if (!data || (!scanning && (!preparing || data.setupMissing.length))) return
    const t = setInterval(() => { api(null).then(setData).catch(() => undefined) }, 4000)
    return () => clearInterval(t)
  }, [scanning, preparing, data, api])

  // Each selected speaker needs a lower-third clip (the render skips those that don't) — made automatically, once per set.
  useEffect(() => {
    if (!data || !data.cues.length || data.setupMissing.length || scanning) return
    const byId = new Map(data.lowerThirds.map(l => [l.speaker_id, l]))
    const need = [...new Set(data.cues.map(c => c.speaker_id))].filter(id => { const l = byId.get(id); return !l?.ready && l?.status !== 'generating' })
    const key = need.sort().join(',')
    if (!need.length || preparedFor.current === key) return
    preparedFor.current = key
    void run('prepare')
  }, [data, run, scanning])

  if (!data) return <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{msg ?? 'Loading…'}</div>

  // Speakers come from the agenda (moderator first); the page's list is only a fallback.
  const rows = data.speakers.length ? data.speakers : speakers.map(s => ({ id: s.id, name: s.public_name || s.name, moderator: false }))
  const ltOf = (id: string) => data.lowerThirds.find(l => l.speaker_id === id)
  const chosenOf = (sp: string) => data.cues.find(c => c.speaker_id === sp)
  const scanned = data.scanStatus === 'done' || data.candidates.length > 0
  const decided = rows.filter(sp => chosenOf(sp.id) || data.skipped.includes(sp.id)).length
  const allDecided = rows.length > 0 && decided === rows.length
  const chosenSpeakers = rows.filter(sp => chosenOf(sp.id))
  const readyCount = chosenSpeakers.filter(sp => ltOf(sp.id)?.ready).length
  const allReady = readyCount === chosenSpeakers.length
  const ghost = { padding: '4px 10px', fontSize: 12, border: '1px solid var(--border-light)', borderRadius: 6, background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink2)' } as const
  const clashes = (sp: string, t: number) => data.cues.some(c => c.speaker_id !== sp && Math.abs(c.start_s - t) < LT_SECONDS + 2)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6 }}>
        Each speaker gets <b>one</b> lower third. For every speaker, pick the moment that looks best — close-ups are shown first. Nothing is rendered until you confirm.
      </div>

      {data.setupMissing.length > 0 && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: 13, lineHeight: 1.6 }}>
          The lower-third design isn&apos;t set up yet: {data.setupMissing.join('; ')}.{' '}
          Set it up in <Link href={`/admin/events/${eventId}/creative-templates/admin?tab=lower_thirds`} style={{ color: 'var(--teal)', fontWeight: 700 }}>Admin Console → Lower Thirds</Link> (upload the graphic and save).
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant={scanned ? 'ghost' : 'teal'} disabled={busy || !canGenerate || scanning} onClick={() => { preparedFor.current = ''; setPage({}); void run('generate') }}>
          {scanning ? 'Looking through the video…' : scanned ? 'Look through the video again' : 'Find moments for the lower thirds'}
        </Button>
        {!canGenerate && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Name the voices first (Step 4).</span>}
        {scanned && !scanning && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{decided} of {rows.length} speakers chosen</span>}
      </div>
      {scanning && <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>Checking who is on screen at each possible moment — about a minute. This page updates by itself.</div>}
      {data.scanStatus === 'failed' && data.scanError && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>The video check failed: {data.scanError}</div>}
      {data.scanStatus === 'done' && data.scanError && <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>{data.scanError}</div>}
      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{msg}</div>}

      {scanned && !scanning && rows.map(sp => {
        const all = rank(data.candidates, sp.id)
        const p = page[sp.id] ?? 0
        const opts = all.slice(p * PAGE, p * PAGE + PAGE)
        const exhausted = all.length === 0 || (p + 1) * PAGE >= all.length
        const chosen = chosenOf(sp.id)
        const skipped = data.skipped.includes(sp.id)
        const chosenInView = !!chosen && opts.some(o => Math.abs(o.start_s - chosen.start_s) < 1)
        const lt = ltOf(sp.id)
        const card = (t: number, seen: Cand['seen'] | undefined, run_s: number | null, isChosen: boolean) => (
          <div key={t} style={{ border: `2px solid ${isChosen ? 'var(--green)' : 'var(--border-light)'}`, borderRadius: 10, padding: 8, display: 'grid', gap: 6, background: 'var(--surface)' }}>
            {proxyUrl ? <Frame src={proxyUrl} at={t} duration={durationS} still={lt?.still_url ?? null} name={sp.name} /> : <div style={{ aspectRatio: '16 / 9', background: 'var(--card)', borderRadius: 8 }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}><b style={{ fontFamily: 'monospace', color: 'var(--ink)' }}>{fmt(t)}</b>{durationS ? ` of ${fmt(durationS)}` : ''}{run_s ? ` · speaks ${Math.round(run_s)}s` : ''}</span>
              {seen && <span style={{ fontSize: 11.5, fontWeight: 700, color: SEEN[seen].color }}>{SEEN[seen].label}</span>}
            </div>
            {clashes(sp.id, t) && <div style={{ fontSize: 11.5, color: 'var(--amber)' }}>Too close to another speaker&apos;s lower third.</div>}
            {isChosen
              ? <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--green)' }}>✓ Selected{!lt?.ready && !data.setupMissing.length ? ' · preparing the lower third…' : ''}</div>
              : <div><Button variant="ghost" disabled={busy} onClick={() => void run('select', { speaker_id: sp.id, start_s: t })}>Select</Button></div>}
          </div>
        )
        return (
          <div key={sp.id} style={{ border: '1px solid var(--border-light)', borderRadius: 12, padding: 12, display: 'grid', gap: 10, background: 'var(--card)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{sp.name}</span>
              {sp.moderator && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-mid)' }}>MODERATOR</span>}
              <span style={{ fontSize: 12.5, fontWeight: 700, color: chosen ? 'var(--green)' : skipped ? 'var(--ink3)' : 'var(--amber)' }}>{chosen ? `✓ Shows at ${fmt(chosen.start_s)}` : skipped ? 'No lower third' : 'Choose one'}</span>
              <span style={{ flex: 1 }} />
              {all.length > PAGE && !exhausted && <button type="button" style={ghost} disabled={busy} onClick={() => setPage(x => ({ ...x, [sp.id]: p + 1 }))}>Find other moments</button>}
              {p > 0 && <button type="button" style={ghost} onClick={() => setPage(x => ({ ...x, [sp.id]: 0 }))}>Back to best</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {opts.map(o => card(o.start_s, o.seen, o.run_s, !!chosen && Math.abs(o.start_s - chosen.start_s) < 1))}
              {chosen && !chosenInView && card(chosen.start_s, data.candidates.find(c => c.speaker_id === sp.id && Math.abs(c.start_s - chosen.start_s) < 1)?.seen, null, true)}
            </div>
            {(exhausted || all.length === 0) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink3)' }}>
                <span>{all.length === 0 ? 'No moments found for this speaker.' : 'No more moments found.'} Know a good time?</span>
                <input value={typed[sp.id] ?? ''} onChange={e => setTyped(x => ({ ...x, [sp.id]: e.target.value }))} placeholder="m:ss" style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5 }} />
                <button type="button" style={ghost} disabled={busy || parseTime(typed[sp.id] ?? '') === null} onClick={() => { const t = parseTime(typed[sp.id] ?? ''); if (t !== null) void run('select', { speaker_id: sp.id, start_s: t }) }}>Use this time</button>
                {!skipped && <button type="button" style={ghost} disabled={busy} onClick={() => void run('skip', { speaker_id: sp.id })}>No lower third for this speaker</button>}
              </div>
            )}
          </div>
        )
      })}

      {scanned && !scanning && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
          {data.confirmed && allDecided ? (
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>✓ Lower thirds confirmed. Continue to Step 8.</div>
          ) : (
            <>
              <Button variant="teal" disabled={busy || !allDecided || !allReady || !chosenSpeakers.length || data.setupMissing.length > 0} onClick={() => void run('confirm')}>Confirm lower thirds</Button>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                {!allDecided ? `${decided} of ${rows.length} speakers chosen — pick one moment for each.` : !allReady ? `Preparing the animated lower thirds (${readyCount} of ${chosenSpeakers.length}) — a minute or two.` : 'Ready to confirm.'}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
