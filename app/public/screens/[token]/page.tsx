'use client'

/* eslint-disable @next/next/no-img-element -- the PNG itself is the content; no optimisation wanted */

import { use, useCallback, useEffect, useMemo, useState } from 'react'

/* Stage Screens — the AV team's page (2026-10-25). No login; the private link is the key. Lists the sessions for the stage in time order with the latest PNG for each.
   Refreshes itself every 60 s so a last-minute swap shows up without anyone reloading; a session whose agenda changed after its file was drawn is marked
   "update coming", and a file drawn in the last hour is marked NEW. Download names are stable (day_stage_time_layout.png). */

type Item = {
  id: string; title: string; stage: string | null; date: string; start: string; end: string; layout: string; file_name: string
  png_url: string; width: number | null; height: number | null; generated_at: string | null; update_pending: boolean; people: { name: string; moderator: boolean }[]
}
type Data = { event_name: string; label: string; timezone: string; panel: 'light' | 'dark'; sessions: Item[] }

// The panel the graphic sits on at the venue (preview only; the file itself is transparent).
/* eslint-disable no-restricted-syntax */
const PANEL_BG = { light: '#FFFFFF', dark: '#0B1220' } as const
/* eslint-enable no-restricted-syntax */

export default function ScreensForAv({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [day, setDay] = useState('all')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    const r = await fetch(`/api/public/screens/${token}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'This link is not valid.'); return }
    setError(null); setData(d); setNow(Date.now())
  }, [token])

  useEffect(() => {
    let cancelled = false
    const tick = () => { if (!cancelled) void load() }
    tick()
    const t = setInterval(tick, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [load])

  const days = useMemo(() => [...new Set((data?.sessions ?? []).map(s => s.date))].sort(), [data])
  const shown = (data?.sessions ?? []).filter(s => day === 'all' || s.date === day)
  const fresh = (s: Item) => !!s.generated_at && now - new Date(s.generated_at).getTime() < 3_600_000

  if (error) return <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif', color: 'var(--ink)', background: 'var(--surface)', minHeight: '100vh' }}>{error}</div>
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-manrope), Manrope, sans-serif', padding: 'clamp(12px, 3vw, 32px)' }}>
      {!data ? <div>Loading…</div> : (
        <>
          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 900 }}>{data.event_name} — stage screens</h1>
          <div style={{ color: 'var(--ink3)', fontSize: '14px', margin: '4px 0 14px' }}>{data.label}. Download the PNG, drop it on the layer above the video in Watchout. Updates itself every minute.</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {['all', ...days].map(d => <button key={d} onClick={() => setDay(d)} style={{ padding: '7px 14px', borderRadius: '999px', border: '1.5px solid var(--border)', background: day === d ? 'var(--ink)' : 'transparent', color: day === d ? 'var(--card)' : 'var(--ink2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>{d === 'all' ? 'All days' : d}</button>)}
          </div>
          {data.sessions.some(fresh) && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--amber)', marginBottom: '16px', fontSize: '14px' }}>
              <strong>Updated in the last hour:</strong> {data.sessions.filter(fresh).map(s => `${s.date} ${s.start} ${s.stage ?? ''}`.trim()).join(' · ')}
            </div>
          )}
          {!shown.length && <div style={{ color: 'var(--ink3)' }}>No screens have been published for this link yet.</div>}
          <div style={{ display: 'grid', gap: '14px' }}>
            {shown.map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', background: 'var(--card)', border: `1px solid ${s.update_pending ? 'var(--amber)' : 'var(--border)'}`, borderRadius: '12px', padding: '12px' }}>
                <div style={{ background: PANEL_BG[data.panel ?? 'light'], border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', alignSelf: 'start' }}><img src={s.png_url} alt={`Screen: ${s.title}`} style={{ width: '100%', display: 'block' }} /></div>
                <div style={{ display: 'grid', gap: '6px', alignContent: 'start' }}>
                  <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700 }}>{s.date} · {s.start}–{s.end}{s.stage ? ` · ${s.stage}` : ''} · {s.layout}</div>
                  <div style={{ fontSize: '17px', fontWeight: 800, lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ fontSize: '13.5px', color: 'var(--ink2)' }}>{s.people.map(p => `${p.name}${p.moderator ? ' (Moderator)' : ''}`).join(' · ')}</div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12.5px' }}>
                    {fresh(s) && <strong style={{ color: 'var(--green)' }}>NEW</strong>}
                    {s.update_pending && <strong style={{ color: 'var(--amber)' }}>Agenda changed — updated file coming. Check back before using this one.</strong>}
                    {s.generated_at && <span style={{ color: 'var(--ink3)' }}>file made {new Date(s.generated_at).toLocaleString()}{s.width ? ` · ${s.width}×${s.height}px` : ''}</span>}
                  </div>
                  <a href={`/api/public/screens/${token}/file/${s.id}`} style={{ marginTop: '4px', justifySelf: 'start', padding: '11px 20px', borderRadius: '10px', background: 'var(--teal)', color: 'white', fontWeight: 800, fontSize: '14px', textDecoration: 'none' }}>Download PNG</a>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{s.file_name}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
