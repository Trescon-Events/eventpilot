'use client'

/* eslint-disable @next/next/no-img-element -- the card PNG itself is the content; no optimisation wanted */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_TABLE_COUNT, MAX_TABLES, parseTableOrder, seatPlan, standbyFileName, tableFileName } from '@/app/lib/screens/tables'
import type { LiveView } from '@/app/lib/screens/table-live'

/* Table Screens (Phase 1) — the console for the small screens on the tables beside each speaker's seat. Used on the producers' Stage Screens page and on the AV console's private link.

   The stage manager tells the technician which tables are on stage and, once they are placed, their order from the left. He picks the session, types the table numbers in seat order
   ("4 2 6 1 3": the moderator's table first), checks the preview of every card, and downloads one zip (a PNG per table, named Table4_Seat1_Moderator_Name.png, plus Standby.png) to push with his app.
   Names come from the agenda and the speaker records; a substitute or last-minute speaker can be typed in here. Cards are drawn on request from the Table Screen template the branding team made
   (Admin Console › Variants). Nothing is saved: the page is a worksheet for the session. */

type Template = { id: string; name: string; width: number; height: number; standby: boolean; version: string }
type SeatIn = { speakerId: string; name: string; moderator: boolean }
type Session = { id: string; topic: string; date: string; startHM: string; endHM: string; stage: string | null; seats: SeatIn[] }
type Payload = { table_count: number; templates: Template[]; sessions: Session[] }
type Seat = { name: string; moderator: boolean; manual?: boolean }   // manual = added here for a substitute; only those can be flagged Moderator by hand — an agenda speaker's tag comes from their record

const btn = { display: 'inline-block', padding: '10px 18px', borderRadius: '10px', border: 'none', fontWeight: 800, fontSize: '14px', cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit' } as const
const input = { padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '14px', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' } as const
const sig = (s: SeatIn[]) => s.map(x => `${x.name}|${x.moderator ? 1 : 0}`).join('~')

function readCount(): number {
  try { const n = parseInt(localStorage.getItem('tables:count') ?? '', 10); return n >= 1 && n <= MAX_TABLES ? n : DEFAULT_TABLE_COUNT } catch { return DEFAULT_TABLE_COUNT }
}


type LiveCmd = Record<string, unknown>

/* Live control (Phase 2): sends the cards to the tables through the Table Hub program on the technician's laptop, and shows whether the program and each table screen are online. */
function LivePanel({ url, query, canSend, buildShow, tableCount, standbyId, programLinks }: { url: (p: string, e?: Record<string, string>) => string; query: string; canSend: boolean; buildShow: () => LiveCmd | null; tableCount: number; standbyId?: string; programLinks: boolean }) {
  const [live, setLive] = useState<LiveView | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    const tick = async () => {
      if (document.hidden) return
      try { const r = await fetch(url('/live'), { cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (stop) return; if (r.ok) { setLive(d as LiveView); setErr(null) } else setErr(d.error ?? 'Could not read the live status.') } catch { /* offline for a moment */ }
    }
    void tick(); const t = setInterval(tick, 3000)
    return () => { stop = true; clearInterval(t) }
  }, [url])

  async function send(cmd: LiveCmd, okMsg: string) {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(url('/live'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cmd, ...(query ? Object.fromEntries(new URLSearchParams(query)) : {}) }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setMsg(d.error ?? 'Could not send.'); else { setLive(d as LiveView); setMsg(okMsg) }
    } catch { setMsg('Could not reach EventPilot — try again.') }
    setBusy(false)
  }

  const p = live?.program
  const ago = (ms: number | null | undefined) => ms == null ? null : ms < 8000 ? 'online' : ms < 60000 ? `${Math.round(ms / 1000)}s ago` : 'offline'
  const chip = (on: boolean) => ({ fontSize: '12px', fontWeight: 800, padding: '3px 10px', whiteSpace: 'nowrap', borderRadius: '999px', background: on ? 'var(--teal)' : 'var(--border)', color: on ? 'white' : 'var(--ink3)' }) as const
  const show = buildShow()
  // The picture each table is showing right now (the same card the program fetched), drawn small; a new send changes the address, so it is never a stale one.
  const liveImg = (img: string) => { const q = new URLSearchParams(img.split('?')[1] ?? ''); const extra: Record<string, string> = {}; q.forEach((v, k) => { extra[k] = v }); extra.scale = '0.2'; extra.v = String(live?.seq ?? 0); return url('/card', extra) }
  return (
    <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--border)', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '15px', fontWeight: 900 }}>Live to the tables</div>
        <span style={chip(!!p?.online)}>{p?.online ? 'Table Hub connected' : p ? 'Table Hub offline' : 'Table Hub not started yet'}</span>
        {p?.online && p.version != null && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>program v{p.version}</span>}
      </div>
      {err && <div style={{ color: 'var(--red)', fontSize: '13.5px', fontWeight: 700 }}>{err}</div>}
      {p?.needs_update && <div role="alert" style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--amber)', color: 'white', fontWeight: 800, fontSize: '13.5px' }}>Update the program: the one running on the laptop is out of date for this feature. Download it again and restart it.</div>}
      {!p?.online && <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.7, display: 'grid', gap: '8px' }}>
        <div><strong>On the technician&apos;s Windows laptop:</strong> 1. Download and double-click the file below. 2. If Windows says &quot;Windows protected your PC&quot;, click <strong>More info</strong> then <strong>Run anyway</strong>; if it asks about the firewall, click <strong>Allow access</strong>. 3. A black window opens and lists an address for each table. Open that address in Chrome on the table PC, then click once on the page (or press F11) for full screen. A screen that is turned on its side is handled automatically; if a card comes out upside down, add <code>?rotate=270</code> to that address once. This page then shows the hub as connected, and <strong>Send to tables</strong> works. Nothing else to install.</div>
        {programLinks && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <a href={url('/program', { file: 'exe' })} style={{ ...btn, background: 'var(--teal)', color: 'white', fontSize: '15px', padding: '12px 20px' }}>Download Table Hub for Windows</a>
          <details style={{ fontSize: '12.5px' }}><summary style={{ cursor: 'pointer', color: 'var(--ink3)' }}>Mac, or a laptop that already has Node.js</summary>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <a href={url('/program', { file: 'hub' })} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)', fontSize: '13px', padding: '8px 14px' }}>table-hub.cjs</a>
              <a href={url('/program', { file: 'bat' })} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)', fontSize: '13px', padding: '8px 14px' }}>start-table-hub.bat</a>
            </div>
            <div style={{ marginTop: '6px' }}>Same folder; Windows: double-click the .bat. Mac: in Terminal run <code>node table-hub.cjs</code>.</div>
          </details>
        </div>}
      </div>}
      {p?.online && p.lan.length > 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Table PCs open: {p.lan.map(a => `${a}/table/N`).join('  or  ')}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
        {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => {
          const t = p?.tables[String(n)], w = ago(t?.seen_ms_ago), on = w === 'online', showing = live?.state.tables[String(n)]
          return (
            <div key={n} style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px', display: 'grid', gap: '3px', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong style={{ fontSize: '14px' }}>Table {n}</strong><span style={chip(on)}>{w ?? 'not seen'}</span></div>
              <div style={{ aspectRatio: '9 / 16', borderRadius: '6px', background: 'var(--surface)', overflow: 'hidden', display: 'grid', placeItems: 'center', color: 'var(--ink3)', fontSize: '11px' }}>
                {showing?.img
                  ? <img src={liveImg(showing.img)} alt={`What Table ${n} shows now`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  : showing ? 'Blank' : 'Nothing sent'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.3, wordBreak: 'break-word' }}>{showing ? (showing.mode === 'card' ? showing.name : showing.mode === 'standby' ? 'Standby' : 'Blank') : '—'}{showing?.mode === 'card' && showing.moderator ? ' · Moderator' : ''}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button disabled={busy || !canSend || !show} onClick={() => show && send(show, 'Sent. The tables update within a couple of seconds.')} style={{ ...btn, background: busy || !canSend || !show ? 'var(--border)' : 'var(--teal)', color: 'white', fontSize: '16px', padding: '14px 24px' }}>{busy ? 'Sending…' : 'Send to tables'}</button>
        <button disabled={busy || !canSend} onClick={() => send({ action: 'all', mode: 'standby', table_count: tableCount, ...(standbyId ? { standby_template: standbyId } : {}) }, 'All tables on standby.')} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}>All standby</button>
        <button disabled={busy || !canSend} onClick={() => send({ action: 'all', mode: 'blank', table_count: tableCount }, 'All tables blank.')} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}>All blank</button>
        <button disabled={busy || !canSend} onClick={() => send({ action: 'identify', seconds: 15 }, 'Every table now flashes its number for 15 seconds.')} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}>Identify tables</button>
      </div>
      {msg && <div style={{ fontSize: '13.5px', fontWeight: 700, color: /could not|does not|twice|no name|nothing/i.test(msg) ? 'var(--red)' : 'var(--ink2)' }}>{msg}</div>}
      {live?.state.session && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Last sent: {live.state.session}</div>}
    </div>
  )
}

export default function TableScreensConsole({ apiBase, query = '', showStage = false }: { apiBase: string; query?: string; showStage?: boolean }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [tableCount, setTableCount] = useState(readCount)   // nothing drawn from it until the data has loaded, so no server/browser mismatch shows
  const [orderText, setOrderText] = useState('')
  const [edits, setEdits] = useState<Record<string, { seats: Seat[]; baseline: string }>>({})
  const [templateId, setTemplateId] = useState('')
  const [standbyId, setStandbyId] = useState('')
  const [day, setDay] = useState('all')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)   // bumped by Refresh so every preview is drawn again from the template as it is now
  const [refreshing, setRefreshing] = useState(false)

  const url = useCallback((path: string, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(query); for (const [k, v] of Object.entries(extra)) q.set(k, v)
    return `${apiBase}${path}${q.toString() ? `?${q}` : ''}`
  }, [apiBase, query])

  const load = useCallback(async () => {
    try {
      const r = await fetch(url(''), { cache: 'no-store' }); const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'Could not load the table screens.'); return }
      setError(null); setData(d as Payload)
    } catch { /* offline for a moment: keep what is on screen */ }
  }, [url])
  useEffect(() => { let cancelled = false; void (async () => { if (!cancelled) await load() })(); return () => { cancelled = true } }, [load])
  useEffect(() => {   // the agenda can change while the technician is waiting for the stage manager: look again every 30 s
    const t = setInterval(() => { if (!document.hidden) void load() }, 30_000)
    return () => clearInterval(t)
  }, [load])

  const days = useMemo(() => [...new Set((data?.sessions ?? []).map(s => s.date))].sort(), [data])
  const shown = useMemo(() => (data?.sessions ?? []).filter(s => day === 'all' || s.date === day), [data, day])
  const session = data?.sessions.find(s => s.id === sessionId) ?? null
  const cardTemplates = (data?.templates ?? []).filter(t => !t.standby), standbyTemplates = (data?.templates ?? []).filter(t => t.standby)
  const tpl = cardTemplates.find(t => t.id === templateId) ?? cardTemplates[0] ?? null
  const sb = standbyTemplates.find(t => t.id === standbyId) ?? standbyTemplates[0] ?? null

  // The seats as the agenda has them, unless this session's names were edited here (then the edited list, with a warning if the agenda moved on meanwhile).
  const agendaSeats: Seat[] = (session?.seats ?? []).map(s => ({ name: s.name, moderator: s.moderator }))
  const edited = session ? edits[session.id] : undefined
  const seats = edited?.seats ?? agendaSeats
  const agendaMoved = !!(session && edited && edited.baseline !== sig(session.seats))
  const setSeats = (next: Seat[]) => { if (session) setEdits(e => ({ ...e, [session.id]: { seats: next, baseline: e[session.id]?.baseline ?? sig(session.seats) } })) }

  const parsed = parseTableOrder(orderText, seats.length, tableCount)
  const plan = seatPlan(seats, parsed.errors.length ? [] : parsed.order, tableCount)
  const ready = plan.seats.filter(s => s.table !== null && s.name.trim())

  async function refresh() { setRefreshing(true); await load(); setNonce(n => n + 1); setRefreshing(false) }
  function pickSession(id: string) { setSessionId(id); setOrderText(''); setNote(null) }
  // The table dropdowns fill the order in sequence (a seat can only be set once the seat before it has a table); clearing one clears the rest of the order from that seat on.
  function setTable(seatIdx: number, table: number | null) {
    const order = parsed.errors.length ? [] : parsed.order.slice(0, seatIdx)
    if (table !== null) order.push(table)
    setOrderText(order.join(' '))
  }
  function changeCount(n: number) { const c = Math.min(MAX_TABLES, Math.max(1, n || 1)); setTableCount(c); try { localStorage.setItem('tables:count', String(c)) } catch { /* private window */ } }

  async function downloadZip() {
    if (!session) return
    setBusy(true); setNote(null)
    try {
      const body = { template: tpl?.id, standby_template: sb?.id, table_count: tableCount, session: { date: session.date, startHM: session.startHM, topic: session.topic }, seats: plan.seats.map(s => ({ name: s.name, moderator: s.moderator, table: s.table })) }
      const r = await fetch(url('/zip'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...(query ? Object.fromEntries(new URLSearchParams(query)) : {}) }) })
      if (!r.ok) { setNote((await r.json().catch(() => ({}))).error ?? 'Could not make the download.'); setBusy(false); return }
      const blob = await r.blob()
      const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'table-screens.zip'
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } catch { setNote('The download failed — check the connection and try again.') }
    setBusy(false)
  }

  const cardSrc = (name: string, moderator: boolean, extra: Record<string, string> = {}) => url('/card', { name, ...(moderator ? { moderator: '1' } : {}), ...(tpl ? { template: tpl.id, v: `${tpl.version}${nonce}` } : {}), ...extra })
  const hasProblem = parsed.errors.length > 0

  if (error) return <div style={{ color: 'var(--red)', padding: '12px 0' }}>{error}</div>
  if (!data) return <div style={{ color: 'var(--ink3)', padding: '12px 0' }}>Loading…</div>
  if (!cardTemplates.length) return (
    <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border)', fontSize: '14px', lineHeight: 1.6 }}>
      <strong>No Table Screen template yet.</strong> The branding team makes it in the Admin Console: <em>Variants › + New Variant › Table Screen Card</em> (and a <em>Table Screen — standby</em> for between sessions). Once it is saved it appears here.
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.6, flex: '1 1 320px' }}>
          1. Pick the session. 2. When the stage manager says which table is in which seat, type the table numbers <strong>in seat order, from the left</strong> (moderator first). 3. Check the cards and download them for your app.
        </div>
        <button onClick={refresh} disabled={refreshing} title="Reload the speakers and the card design, and draw every preview again" style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}>{refreshing ? 'Refreshing…' : '↻ Refresh designs & names'}</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['all', ...days].map(d => <button key={d} onClick={() => setDay(d)} style={{ padding: '6px 14px', borderRadius: '999px', border: '1.5px solid var(--border)', background: day === d ? 'var(--ink)' : 'transparent', color: day === d ? 'var(--card)' : 'var(--ink2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>{d === 'all' ? 'All days' : d}</button>)}
      </div>

      <div style={{ display: 'grid', gap: '6px' }}>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Session</label>
        <select value={sessionId} onChange={e => pickSession(e.target.value)} style={{ ...input, maxWidth: '100%' }}>
          <option value="">Choose a session…</option>
          {shown.map(s => <option key={s.id} value={s.id}>{s.date} {s.startHM}{showStage && s.stage ? ` · ${s.stage}` : ''} — {s.topic.slice(0, 90)} ({s.seats.length})</option>)}
        </select>
        {!shown.length && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>No sessions with speakers yet.</div>}
      </div>

      {session && (
        <>
          {agendaMoved && (
            <div role="alert" style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--red)', color: 'white', fontWeight: 800, display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              The speakers for this session changed in EventPilot after you started editing it.
              <button onClick={() => setEdits(e => { const n = { ...e }; delete n[session.id]; return n })} style={{ ...btn, background: 'white', color: 'var(--red)', padding: '6px 14px' }}>Use the new list</button>
            </div>
          )}

          <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--border)', display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, lineHeight: 1.3 }}>{session.topic}</div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{session.date} · {session.startHM}–{session.endHM}{session.stage ? ` · ${session.stage}` : ''}</div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
              <div style={{ display: 'grid', gap: '4px', flex: '1 1 260px' }}>
                <label style={{ fontWeight: 800, fontSize: '13px' }}>Tables, in seat order from the left</label>
                <input value={orderText} onChange={e => setOrderText(e.target.value)} placeholder={`for example  ${Array.from({ length: Math.min(seats.length || 4, tableCount) }, (_, i) => ((i * 2) % tableCount) + 1).join(' ')}`} inputMode="numeric" autoFocus
                  style={{ ...input, fontSize: '22px', fontWeight: 800, letterSpacing: '2px', borderColor: hasProblem ? 'var(--red)' : 'var(--border)' }} />
              </div>
              <label style={{ display: 'grid', gap: '4px', fontWeight: 800, fontSize: '13px' }}>Tables on stage
                <input type="number" min={1} max={MAX_TABLES} value={tableCount} onChange={e => changeCount(parseInt(e.target.value, 10))} style={{ ...input, width: '90px' }} />
              </label>
            </div>
            {parsed.errors.map(e => <div key={e} style={{ color: 'var(--red)', fontWeight: 800, fontSize: '14px' }}>{e}</div>)}
            {!hasProblem && parsed.warnings.map(w => <div key={w} style={{ color: 'var(--amber)', fontWeight: 700, fontSize: '13.5px' }}>{w}</div>)}

            <div style={{ display: 'grid', gap: '6px' }}>
              <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Seats, left to right as seen from the audience, with the moderator first. Names and the Moderator tag come from the agenda and the speaker records. Change a name here only for a substitute or a last-minute speaker.</div>
              {seats.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ width: '58px', fontWeight: 800, fontSize: '13px', color: 'var(--ink3)' }}>Seat {i + 1}</span>
                  <input value={s.name} onChange={e => setSeats(seats.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} style={{ ...input, flex: '1 1 220px', minWidth: 0 }} aria-label={`Name for seat ${i + 1}`} />
                  {s.manual
                    ? <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}><input type="checkbox" checked={s.moderator} onChange={e => setSeats(seats.map((x, j) => j === i ? { ...x, moderator: e.target.checked } : x))} /> Moderator</label>
                    : s.moderator && <span style={{ fontSize: '11.5px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: 'var(--teal)', color: 'white' }}>MODERATOR</span>}
                  <select value={plan.seats[i]?.table ?? ''} disabled={i > (parsed.errors.length ? 0 : parsed.order.length)} onChange={e => setTable(i, e.target.value ? Number(e.target.value) : null)} style={{ ...input, width: '110px' }} aria-label={`Table for seat ${i + 1}`}>
                    <option value="">Table…</option>
                    {Array.from({ length: tableCount }, (_, k) => k + 1).map(t => <option key={t} value={t}>Table {t}</option>)}
                  </select>
                  <button onClick={() => { setSeats(seats.filter((_, j) => j !== i)); setOrderText('') }} aria-label={`Remove seat ${i + 1}`} title="Remove this seat (clears the table order)" style={{ ...btn, padding: '6px 10px', background: 'transparent', color: 'var(--red)', border: '1.5px solid var(--border)' }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => { setSeats([...seats, { name: '', moderator: false, manual: true }]); setOrderText('') }} style={{ ...btn, padding: '6px 12px', background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}>+ Add a speaker</button>
                {edited && <button onClick={() => setEdits(e => { const n = { ...e }; delete n[session.id]; return n })} style={{ ...btn, padding: '6px 12px', background: 'transparent', color: 'var(--ink3)', border: '1.5px solid var(--border)' }}>Reset names to the agenda</button>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={downloadZip} disabled={busy || hasProblem || (!ready.length && !sb)} style={{ ...btn, background: hasProblem || (!ready.length && !sb) ? 'var(--border)' : 'var(--teal)', color: 'white', fontSize: '16px', padding: '14px 24px' }}>{busy ? 'Making the zip…' : `Download ${ready.length} card${ready.length === 1 ? '' : 's'}${sb ? ' + standby' : ''} (zip)`}</button>
            {sb && <a href={url('/card', { standby: '1', template: sb.id, download: '1', file: standbyFileName() })} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}>Standby only</a>}
            {cardTemplates.length > 1 && (
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>Design <select value={tpl?.id ?? ''} onChange={e => setTemplateId(e.target.value)} style={input}>{cardTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            )}
            {standbyTemplates.length > 1 && (
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>Standby <select value={sb?.id ?? ''} onChange={e => setStandbyId(e.target.value)} style={input}>{standbyTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            )}
          </div>
          <LivePanel url={url} query={query} canSend={!hasProblem} tableCount={tableCount} standbyId={sb?.id} programLinks={apiBase.includes('/api/public/')}
            buildShow={() => {
              if (hasProblem || (!ready.length)) return null
              return { action: 'show', template: tpl?.id, standby_template: sb?.id, session: session.topic,
                tables: [...ready.map(s => ({ n: s.table, mode: 'card', name: s.name.trim(), moderator: s.moderator })), ...plan.standby.map(n => ({ n, mode: sb ? 'standby' : 'blank' }))] }
            }} />
          {!sb && <div style={{ fontSize: '13px', color: 'var(--amber)' }}>No standby screen template has been made yet, so the zip has only the speaker cards. The branding team adds one under Variants › Table Screen — standby.</div>}
          {note && <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: '14px' }}>{note}</div>}

          <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Worksheet previews for the session you picked, in seat order from the left. These are not what is on the tables now: that is in the “Live to the tables” boxes above.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
            {plan.seats.map(s => (
              <div key={s.seat} style={{ background: 'var(--card)', border: `1.5px solid ${s.table && s.name.trim() ? 'var(--border)' : 'var(--amber)'}`, borderRadius: '10px', padding: '8px', display: 'grid', gap: '6px', alignContent: 'start' }}>
                <div style={{ fontSize: '13px', fontWeight: 900 }}>{s.table ? `Table ${s.table}` : 'No table yet'} <span style={{ color: 'var(--ink3)', fontWeight: 700 }}>· Seat {s.seat}{s.moderator ? ' · Moderator' : ''}</span></div>
                {s.name.trim()
                  ? <img src={cardSrc(s.name.trim(), s.moderator, { scale: '0.2' })} alt={`Card for ${s.name}`} style={{ width: '100%', display: 'block', borderRadius: '6px', background: 'var(--surface)', aspectRatio: tpl ? `${tpl.width} / ${tpl.height}` : '9 / 16' }} />
                  : <div style={{ aspectRatio: '9 / 16', display: 'grid', placeItems: 'center', color: 'var(--ink3)', fontSize: '12px', background: 'var(--surface)', borderRadius: '6px' }}>Type a name</div>}
                <div style={{ fontSize: '12.5px', lineHeight: 1.3, wordBreak: 'break-word' }}>{s.name || '—'}</div>
                {s.table && s.name.trim() && <a href={cardSrc(s.name.trim(), s.moderator, { download: '1', file: tableFileName({ table: s.table, seat: s.seat, moderator: s.moderator, name: s.name.trim() }) })} style={{ ...btn, background: 'var(--card)', color: 'var(--ink)', border: '1.5px solid var(--border)', fontSize: '12px', padding: '6px 10px', textAlign: 'center' }}>Download PNG</a>}
              </div>
            ))}
            {sb && plan.standby.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1.5px dashed var(--border)', borderRadius: '10px', padding: '8px', display: 'grid', gap: '6px', alignContent: 'start' }}>
                <div style={{ fontSize: '13px', fontWeight: 900 }}>Standby <span style={{ color: 'var(--ink3)', fontWeight: 700 }}>· {plan.standby.map(t => `T${t}`).join(' ')}</span></div>
                <img src={url('/card', { standby: '1', template: sb.id, v: `${sb.version}${nonce}`, scale: '0.2' })} alt="Standby screen" style={{ width: '100%', display: 'block', borderRadius: '6px', background: 'var(--surface)', aspectRatio: `${sb.width} / ${sb.height}` }} />
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Tables without a speaker show this.</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
