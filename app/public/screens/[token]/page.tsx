'use client'

/* eslint-disable @next/next/no-img-element -- the PNG itself is the content; no optimisation wanted */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flashTitle, playChime, primeAudio } from '@/app/lib/screens/alerts'

/* Stage Screens — the AV console's page (no login; the private link is the key). Built for the day itself:
   - Download all, per day, or only what changed since the last download (one zip each), or one PNG at a time. File names are stable, so a new file replaces the old one in Watchout.
   - The page remembers what THIS link downloaded. When anything changes afterwards (design, text, speaker, timing) the session flashes red with what changed, a notice stays at the
     top until it is closed (one big button), the tab title flashes and a soft chime plays. The row stays red until the new file is downloaded.
   - Changes are redrawn automatically about a minute after the last edit (when the event has auto-redraw on); "Redraw now" does it at once.
   - It checks every 15 s (every 3 s while something is being redrawn), keeps working on a poor hotel connection and says so loudly if it loses the server. */

type Status = 'ok' | 'changed' | 'updating' | 'new' | 'undownloaded'
type Item = {
  id: string; title: string; stage: string | null; date: string; start: string; end: string; layout: string; file_name: string; starts_at: string | null; ends_at: string | null
  png_url: string | null; width: number | null; height: number | null; generated_at: string | null; status: Status; reasons: string[]; downloaded_at: string | null; preparing: boolean; quiet_left: number
  people: { name: string; moderator: boolean }[]
}
type Data = { event_name: string; label: string; timezone: string; panel: 'light' | 'dark'; server_time: string; auto_redraw: boolean; baseline_at: string | null; sessions: Item[] }

// The panel the graphic sits on at the venue (preview only; the file itself is transparent).
/* eslint-disable no-restricted-syntax */
const PANEL_BG = { light: '#FFFFFF', dark: '#0B1220' } as const
/* eslint-enable no-restricted-syntax */

const FLASH_CSS = `
@keyframes avflash { 0%,100% { box-shadow: 0 0 0 0 transparent; background: var(--card) } 50% { box-shadow: 0 0 0 8px var(--red); background: var(--red-light) } }
@keyframes avbanner { 0%,100% { filter: none } 50% { filter: brightness(1.45) } }
.av-flash { animation: avflash 0.9s ease-in-out 14; }
.av-banner { animation: avbanner 0.9s ease-in-out 14; }
@media (prefers-reduced-motion: reduce) { .av-flash, .av-banner { animation: none } }
`

const isOut = (s: Item) => s.status === 'changed' || s.status === 'updating' || s.status === 'new'
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')

export default function ScreensForAv({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failing, setFailing] = useState(false)
  const [lastOk, setLastOk] = useState(() => Date.now())
  const [offset, setOffset] = useState(0)            // server clock minus this device's clock
  const [now, setNow] = useState(() => Date.now())
  const [day, setDay] = useState('all')
  const [dismissed, setDismissed] = useState('')
  const [sound, setSound] = useState(true)
  const [redrawing, setRedrawing] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const prevIds = useRef<Set<string> | null>(null)
  const pollMs = useRef(15_000)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/screens/${token}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (r.status === 404) { setError(d.error ?? 'This link is not valid.'); return }
      if (!r.ok) throw new Error('server')
      setError(null); setData(d); setFailing(false); setLastOk(Date.now()); setOffset(Date.parse(d.server_time) - Date.now())
    } catch { setFailing(true) }   // keep showing the last good data
  }, [token])

  // polling: every 15 s, every 3 s while something is being redrawn
  const busy = !!data?.sessions.some(s => s.status === 'updating' || s.preparing)
  useEffect(() => { pollMs.current = busy ? 3_000 : 15_000 }, [busy])
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout>
    const run = async () => { await load(); if (!cancelled) timer = setTimeout(run, pollMs.current) }
    void run()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [load])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  // sound preference + the first touch unlocks audio
  useEffect(() => {
    void (async () => { try { if (localStorage.getItem('screens-sound') === 'off') setSound(false) } catch { /* private mode */ } })()
    const unlock = () => primeAudio()
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => document.removeEventListener('pointerdown', unlock)
  }, [])

  const sessions = useMemo(() => data?.sessions ?? [], [data])
  const outstanding = useMemo(() => sessions.filter(isOut), [sessions])
  const outIds = useMemo(() => outstanding.map(s => s.id).sort().join(','), [outstanding])
  const readyChanged = sessions.filter(s => (s.status === 'changed' || s.status === 'new') && !s.preparing)

  // chime when a session newly needs attention (never on first load)
  useEffect(() => {
    const ids = new Set(outIds ? outIds.split(',') : [])
    const prev = prevIds.current
    prevIds.current = ids
    if (prev && sound && [...ids].some(id => !prev.has(id))) playChime()
  }, [outIds, sound])

  // flashing tab title while the tab is in the background
  useEffect(() => {
    if (!outstanding.length) return
    return flashTitle(`(${outstanding.length}) CHANGED — stage screens`, 'Stage screens')
  }, [outstanding.length])

  const showPopup = outstanding.length > 0 && dismissed !== outIds
  useEffect(() => {
    if (!showPopup) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDismissed(outIds) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [showPopup, outIds])

  const days = useMemo(() => [...new Set(sessions.map(s => s.date))].sort(), [sessions])
  const shown = sessions.filter(s => day === 'all' || s.date === day)
  const srvNow = now + offset
  const label = (s: Item): string | null => {
    const a = s.starts_at ? Date.parse(s.starts_at) : NaN, b = s.ends_at ? Date.parse(s.ends_at) : NaN
    if (a <= srvNow && srvNow <= b) return 'ON STAGE NOW'
    if (a > srvNow && a - srvNow <= 3_600_000) return `NEXT UP · ${Math.max(1, Math.round((a - srvNow) / 60000))} min`
    return null
  }
  const after = () => { setTimeout(() => void load(), 1500); setTimeout(() => void load(), 5000) }
  const lost = now - lastOk > 45_000

  async function redrawNow() {
    setRedrawing(true); setNote(null)
    try {
      for (let i = 0; i < 8; i++) {
        const r = await fetch(`/api/public/screens/${token}/redraw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        const d = await r.json().catch(() => ({})) as { drawn?: number; waiting?: number }
        await load()
        if (!r.ok || !d.waiting || (!d.drawn && i > 0)) break
      }
    } catch { setNote('Could not redraw — check the connection and try again.') } finally { setRedrawing(false) }
  }
  function toggleSound() {
    const next = !sound
    setSound(next); primeAudio()
    try { localStorage.setItem('screens-sound', next ? 'on' : 'off') } catch { /* ignore */ }
    if (next) playChime()
  }

  if (error) return <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif', color: 'var(--ink)', background: 'var(--surface)', minHeight: '100vh' }}>{error}</div>
  const btn = { padding: '10px 18px', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block', border: 'none' } as const
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-manrope), Manrope, sans-serif', padding: 'clamp(12px, 3vw, 32px)' }}>
      <style>{FLASH_CSS}</style>
      {!data ? <div>{failing ? 'Cannot reach the server — retrying…' : 'Loading…'}</div> : (
        <>
          {lost && <div role="alert" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'var(--red)', color: 'white', padding: '12px 16px', borderRadius: '10px', fontWeight: 800, marginBottom: '12px' }}>No connection to the server for {Math.round((now - lastOk) / 1000)} s — this page may be out of date. Retrying…</div>}

          {outstanding.length > 0 && (
            <div className="av-banner" role="alert" style={{ position: 'sticky', top: lost ? 56 : 0, zIndex: 30, background: 'var(--red)', color: 'white', padding: '14px 18px', borderRadius: '12px', marginBottom: '14px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'clamp(16px, 2.4vw, 22px)', fontWeight: 900 }}>{outstanding.length} {outstanding.length === 1 ? 'SESSION' : 'SESSIONS'} CHANGED</span>
              <span style={{ fontSize: '14px', opacity: 0.95 }}>{outstanding.slice(0, 3).map(s => `${s.start} ${s.title.slice(0, 40)}`).join(' · ')}{outstanding.length > 3 ? ` · +${outstanding.length - 3} more` : ''}</span>
              <span style={{ flex: 1 }} />
              {readyChanged.length > 0 && <a href={`/api/public/screens/${token}/zip?scope=changed`} onClick={after} style={{ ...btn, background: 'white', color: 'var(--red)' }}>Download changed ({readyChanged.length})</a>}
            </div>
          )}

          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 900 }}>{data.event_name} — stage screens</h1>
          <div style={{ color: 'var(--ink3)', fontSize: '14px', margin: '4px 0 12px' }}>
            {data.label}. Download the PNGs and drop them on the layer above the video in Watchout.{' '}
            <span style={{ color: failing ? 'var(--red)' : 'var(--green)', fontWeight: 800 }}>● {failing ? 'Retrying…' : `Live · checked ${clock(new Date(lastOk).toISOString())}`}</span>
            {' · '}{data.auto_redraw ? 'Changes redraw by themselves about a minute after the last edit.' : 'Auto-redraw is off — press Redraw now after a change.'}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
            <a href={`/api/public/screens/${token}/zip?scope=all`} onClick={after} style={{ ...btn, background: 'var(--teal)', color: 'white' }}>Download all (zip)</a>
            {day !== 'all' && <a href={`/api/public/screens/${token}/zip?scope=day&day=${day}`} onClick={after} style={{ ...btn, background: 'var(--teal)', color: 'white' }}>Download {day} (zip)</a>}
            <a href={readyChanged.length ? `/api/public/screens/${token}/zip?scope=changed` : undefined} onClick={readyChanged.length ? after : undefined} aria-disabled={!readyChanged.length}
              style={{ ...btn, background: readyChanged.length ? 'var(--red)' : 'var(--card)', color: readyChanged.length ? 'white' : 'var(--ink3)', border: readyChanged.length ? 'none' : '1.5px solid var(--border)', cursor: readyChanged.length ? 'pointer' : 'default' }}>
              Download only what changed ({readyChanged.length})
            </a>
            <button onClick={redrawNow} disabled={redrawing} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}>{redrawing ? 'Redrawing…' : 'Redraw now'}</button>
            <span style={{ flex: 1 }} />
            <button onClick={toggleSound} style={{ ...btn, background: 'var(--card)', color: 'var(--ink2)', border: '1.5px solid var(--border)', fontWeight: 700 }}>🔔 Alert sound: {sound ? 'on' : 'off'}</button>
            {sound && <button onClick={() => playChime()} style={{ ...btn, background: 'transparent', color: 'var(--ink3)', border: '1.5px solid var(--border)', fontWeight: 700 }}>Test</button>}
          </div>
          {note && <div style={{ color: 'var(--red)', fontSize: '13.5px', marginBottom: '10px' }}>{note}</div>}
          {!data.baseline_at && sessions.length > 0 && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border)', marginBottom: '12px', fontSize: '14px' }}>Start with <strong>Download all</strong> (or a day). From then on this page tells you the moment anything changes.</div>}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {['all', ...days].map(d => <button key={d} onClick={() => setDay(d)} style={{ padding: '7px 14px', borderRadius: '999px', border: '1.5px solid var(--border)', background: day === d ? 'var(--ink)' : 'transparent', color: day === d ? 'var(--card)' : 'var(--ink2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>{d === 'all' ? 'All days' : d}</button>)}
          </div>

          {!shown.length && <div style={{ color: 'var(--ink3)' }}>No screens have been published for this link yet.</div>}
          <div style={{ display: 'grid', gap: '14px' }}>
            {shown.map(s => {
              const out = isOut(s), red = s.status === 'changed' || s.status === 'updating', pri = label(s)
              return (
                <div key={`${s.id}:${s.status}`} className={red ? 'av-flash' : undefined} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', background: 'var(--card)', border: `${out ? 3 : 1}px solid ${red ? 'var(--red)' : s.status === 'new' ? 'var(--info)' : 'var(--border)'}`, borderRadius: '12px', padding: '12px' }}>
                  <div style={{ background: PANEL_BG[data.panel ?? 'light'], border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', alignSelf: 'start', minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.png_url ? <img src={s.png_url} alt={`Screen: ${s.title}`} style={{ width: '100%', display: 'block', opacity: s.status === 'updating' ? 0.45 : 1 }} /> : <span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Being prepared…</span>}
                  </div>
                  <div style={{ display: 'grid', gap: '6px', alignContent: 'start' }}>
                    {pri && <div style={{ justifySelf: 'start', padding: '3px 10px', borderRadius: '999px', background: pri.startsWith('ON') ? 'var(--red)' : 'var(--amber)', color: 'white', fontWeight: 900, fontSize: '12.5px' }}>{pri}</div>}
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700 }}>{s.date} · {s.start}–{s.end}{s.stage ? ` · ${s.stage}` : ''} · {s.layout}</div>
                    <div style={{ fontSize: '17px', fontWeight: 800, lineHeight: 1.3 }}>{s.title}</div>
                    <div style={{ fontSize: '13.5px', color: 'var(--ink2)' }}>{s.people.map(p => `${p.name}${p.moderator ? ' (Moderator)' : ''}`).join(' · ')}</div>

                    {s.status === 'changed' && <div style={{ color: 'var(--red)', fontWeight: 900, fontSize: '16px' }}>CHANGED — DOWNLOAD THE NEW FILE</div>}
                    {s.status === 'updating' && <div style={{ color: 'var(--red)', fontWeight: 900, fontSize: '16px' }}>CHANGED — NEW FILE BEING PREPARED{data.auto_redraw && s.quiet_left > 0 ? ` (about ${s.quiet_left} s)` : ''}</div>}
                    {s.status === 'new' && <div style={{ color: 'var(--info)', fontWeight: 900, fontSize: '15px' }}>NEW SESSION</div>}
                    {s.status === 'ok' && <div style={{ color: 'var(--green)', fontWeight: 800, fontSize: '13.5px' }}>✓ Up to date — downloaded {clock(s.downloaded_at)}</div>}
                    {s.status === 'undownloaded' && <div style={{ color: 'var(--ink3)', fontWeight: 700, fontSize: '13px' }}>Not downloaded yet</div>}
                    {s.reasons.length > 0 && <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', fontWeight: 700 }}>{s.reasons.map(r => <li key={r}>{r}</li>)}</ul>}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '2px' }}>
                      {s.png_url && s.status !== 'updating' && <a href={`/api/public/screens/${token}/file/${s.id}`} onClick={after} style={{ ...btn, background: red ? 'var(--red)' : 'var(--teal)', color: 'white' }}>Download PNG</a>}
                      {(s.status === 'updating' || s.preparing) && <button onClick={redrawNow} disabled={redrawing} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}>{redrawing ? 'Redrawing…' : 'Redraw now'}</button>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{s.file_name}{s.generated_at ? ` · file made ${clock(s.generated_at)}${s.width ? ` · ${s.width}×${s.height}px` : ''}` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {showPopup && (
            <div role="alertdialog" aria-label="Sessions changed" style={{ position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, width: 'min(560px, calc(100vw - 24px))', background: 'var(--card)', border: '4px solid var(--red)', borderRadius: '16px', padding: '16px 18px', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--red)', flex: 1 }}>{outstanding.length} {outstanding.length === 1 ? 'SESSION' : 'SESSIONS'} CHANGED</div>
                <button onClick={() => setDismissed(outIds)} aria-label="Close" style={{ ...btn, background: 'var(--ink)', color: 'var(--card)', fontSize: '22px', padding: '6px 16px', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gap: '8px', margin: '10px 0 12px', maxHeight: '38vh', overflow: 'auto' }}>
                {outstanding.map(s => (
                  <div key={s.id} style={{ fontSize: '14px' }}>
                    <strong>{s.date} {s.start}{s.stage ? ` · ${s.stage}` : ''}</strong> — {s.title.slice(0, 70)}
                    {label(s) && <strong style={{ color: 'var(--red)' }}> · {label(s)}</strong>}
                    {s.reasons.map(r => <div key={r} style={{ color: 'var(--ink2)', marginLeft: '12px' }}>• {r}</div>)}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {readyChanged.length > 0 && <a href={`/api/public/screens/${token}/zip?scope=changed`} onClick={() => { after(); setDismissed(outIds) }} style={{ ...btn, background: 'var(--red)', color: 'white', fontSize: '16px', padding: '14px 22px' }}>Download changed ({readyChanged.length})</a>}
                <button onClick={() => setDismissed(outIds)} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '2px solid var(--ink)', fontSize: '16px', padding: '14px 22px' }}>Close</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
