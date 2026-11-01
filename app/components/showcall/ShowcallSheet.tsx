'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { actualDur, fmtDur, hmToSec, secToHm, VOCAB, type Row } from '@/app/lib/showcall/model'

/* Show Caller — the live sheet. One row per cue, built from the Agenda (grey cells come from there and cannot be edited) with everything the show caller adds
   in editable cells that save as you leave them. It fills its parent, checks for changes every 3 s and says so loudly if the server is lost. The producers' page
   and the show caller's private link both render this; they differ only in how they load and save (props). */

export type SheetPayload = { event_name: string; timezone: string; stages: { id: string; name: string }[]; rows: Row[]; server_time: string; label?: string }
type Props = { load: () => Promise<SheetPayload>; act: (body: Record<string, unknown>) => Promise<string | null>; readOnly?: boolean; onExcel?: (p: SheetPayload, opts: { mc: boolean }) => void; title?: string }

const CSS = `
.scx { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--surface); color: var(--ink); font-size: var(--scx-fs, 12.5px); }
.scx * { box-sizing: border-box; }
.scx-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--card); }
.scx-pill { padding: 5px 11px; border-radius: 999px; border: 1.5px solid var(--border); background: transparent; color: var(--ink2); cursor: pointer; font: inherit; font-weight: 700; white-space: nowrap; }
.scx-pill.on { border-color: var(--teal); color: var(--ink); background: var(--teal-light); }
.scx-btn { padding: 5px 10px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--card-hi); color: var(--ink); cursor: pointer; font: inherit; font-weight: 700; white-space: nowrap; }
.scx-btn:hover { border-color: var(--teal); }
.scx-btn:disabled { opacity: .5; cursor: default; }
.scx-now { display: flex; gap: 18px; align-items: baseline; padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--surface); flex-wrap: wrap; }
.scx-grid { flex: 1; min-height: 0; overflow: auto; }
.scx table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 1180px; table-layout: fixed; }
.scx th { position: sticky; top: 0; z-index: 2; background: var(--sidebar-bg); color: var(--ink2); text-align: left; font-size: .8em; letter-spacing: .04em; text-transform: uppercase; padding: 6px 6px; border-bottom: 2px solid var(--border); border-right: 1px solid var(--border-light); }
.scx td { padding: 0; border-bottom: 1px solid var(--border); border-right: 1px solid var(--border-light); vertical-align: top; }
.scx td.ro { padding: 5px 6px; color: var(--ink2); background: color-mix(in srgb, var(--ink) 4%, transparent); }
.scx td.ro.strong { color: var(--ink); font-weight: 700; }
.scx tr.mc td { background: color-mix(in srgb, var(--success) 9%, transparent); }
.scx tr.mc td.ro { background: color-mix(in srgb, var(--success) 12%, var(--surface)); }
.scx tr.custom td { background: color-mix(in srgb, var(--amber) 10%, transparent); }
.scx tr.now td { box-shadow: inset 0 2px 0 var(--teal), inset 0 -2px 0 var(--teal); }
.scx tr.done td { opacity: .6; }
.scx tr.removed td { opacity: .55; text-decoration: line-through; }
.scx tr.changed td.cue { background: var(--red-light); }
.scx tr.new td.cue { background: var(--info-light); }
.scx input.c, .scx textarea.c { width: 100%; height: 100%; min-height: 28px; border: 0; background: transparent; color: var(--ink); font: inherit; padding: 5px 6px; outline: none; resize: none; display: block; }
.scx input.c:focus, .scx textarea.c:focus { background: var(--card-hi); box-shadow: inset 0 0 0 2px var(--teal); }
.scx input.c::placeholder { color: var(--ink4); }
.scx .tag { display: inline-block; font-size: .72em; font-weight: 800; padding: 1px 6px; border-radius: 6px; letter-spacing: .04em; }
.scx .mod { color: var(--red); font-weight: 800; }
.scx .chip { display: inline-block; margin: 0 6px 4px; padding: 1px 7px; border-radius: 999px; border: 1px dashed var(--teal); color: var(--teal-mid); cursor: pointer; font-size: .85em; background: transparent; font-family: inherit; }
.scx select.fill { max-width: 100%; margin-top: 3px; font-size: .85em; background: var(--card); color: var(--ink2); border: 1px solid var(--border); border-radius: 6px; }
.scx-err { background: var(--red); color: var(--surface); padding: 8px 12px; font-weight: 800; }
.scx-modal { position: fixed; inset: 0; z-index: 50; background: color-mix(in srgb, var(--ink) 45%, transparent); display: flex; align-items: center; justify-content: center; padding: 16px; }
.scx-dlg { width: min(560px, 100%); max-height: 100%; overflow: auto; background: var(--card); color: var(--ink); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-md); padding: 18px; display: grid; gap: 14px; font-size: 14px; }
.scx-dlg label.l { display: grid; gap: 5px; font-weight: 800; color: var(--ink2); font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.scx-dlg input, .scx-dlg select, .scx-dlg textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1.5px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--ink); text-transform: none; letter-spacing: 0; font-weight: 600; }
.scx-dlg input:focus, .scx-dlg select:focus, .scx-dlg textarea:focus { outline: none; border-color: var(--teal); }
@media print { .scx-bar, .scx-now { display: none } .scx-grid { overflow: visible } }
`

type ColKey = 'actual' | 'type' | 'mc' | 'people' | 'topic' | 'screen' | 'live' | 'mic' | 'audio' | 'lx' | 'seats' | 'comments'
const COLS: { key: ColKey; label: string; w: number }[] = [
  { key: 'actual', label: 'Actual start / end', w: 150 }, { key: 'type', label: 'Session type', w: 120 }, { key: 'mc', label: 'MC', w: 100 }, { key: 'people', label: 'Speakers', w: 230 },
  { key: 'topic', label: 'Session topic', w: 200 }, { key: 'screen', label: 'Screen', w: 110 }, { key: 'live', label: 'Live', w: 90 }, { key: 'mic', label: 'Mic', w: 95 }, { key: 'audio', label: 'Audio', w: 95 },
  { key: 'lx', label: 'LX', w: 120 }, { key: 'seats', label: 'Seats', w: 60 }, { key: 'comments', label: 'Comments', w: 200 },
]

const zoned = (tz: string, now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now)
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return { date: `${g('year')}-${g('month')}-${g('day')}`, sec: +g('hour') * 3600 + +g('minute') * 60 + +g('second'), hms: `${g('hour')}:${g('minute')}:${g('second')}` }
}
const ls = (k: string, v?: string): string | null => { try { if (v !== undefined) localStorage.setItem(k, v); return localStorage.getItem(k) } catch { return null } }

function Cell({ value, onSave, ro, list, placeholder, multiline }: { value: string; onSave: (v: string) => void; ro?: boolean; list?: string; placeholder?: string; multiline?: boolean }) {
  const [v, setV] = useState(value), focus = useRef(false)
  useEffect(() => { if (!focus.current) setV(value) }, [value])
  const common = {
    className: 'c', value: v, placeholder, readOnly: ro, onFocus: () => { focus.current = true }, onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: () => { focus.current = false; if (v.trim() !== value.trim()) onSave(v) },
  }
  return multiline
    ? <textarea {...common} rows={1} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur() } }} />
    : <input {...common} list={list} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLElement).blur() } }} />
}

const QUICK = ['VIP arrival', 'Registration open', 'Holding / walk-in', 'Sponsor video', 'Break', 'Delay filler', 'Group photo', 'Announcement']
const MINS = [1, 2, 5, 10, 15, 30]

/** The Add-cue pop-up: say what it is, where it goes (after which row) and how long. The start time follows the chosen row until it is typed over. */
function AddCue({ rows, first, busy, onAdd, onClose }: { rows: Row[]; first: string; busy: boolean; onAdd: (v: { title: string; notes: string; start: string; sec: number }) => void | Promise<void>; onClose: () => void }) {
  const endOf = (id: string, mins: number) => { const r = rows.find(x => x.id === id); const sec = r ? r.startSec + r.durSec : Math.max(0, (rows[0]?.startSec ?? 0) - mins * 60); return secToHm(Math.round(sec / 60) * 60) }
  const [title, setTitle] = useState(''), [notes, setNotes] = useState(''), [after, setAfter] = useState(first), [mins, setMins] = useState(2)
  const [start, setStart] = useState(() => endOf(first, 2))
  const ok = title.trim().length > 0 && hmToSec(start) !== null && mins > 0
  const submit = () => { if (ok && !busy) void onAdd({ title: title.trim(), notes: notes.trim(), start, sec: Math.round(mins * 60) }) }
  const label = (r: Row) => `Cue ${r.cue} · ${secToHm(r.startSec)} · ${(r.typeLabel || r.topic || 'Cue').slice(0, 40)}${r.kind === 'mc' ? ' (MC)' : ''}`
  return (
    <div className="scx-modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="scx-dlg" role="dialog" aria-label="Add a cue">
        <div><strong style={{ fontSize: 17 }}>Add a cue</strong><div style={{ color: 'var(--ink3)', marginTop: 3 }}>For things that are not in the Agenda and should not be public, such as a VIP arriving. The Agenda is not changed.</div></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{QUICK.map(q => <button key={q} type="button" className={`scx-pill${title === q ? ' on' : ''}`} onClick={() => setTitle(q)}>{q}</button>)}</div>
        <label className="l">What is it?<input autoFocus value={title} placeholder="Type, or pick one above" maxLength={80} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10 }}>
          <label className="l">Goes after
            <select value={after} onChange={e => { setAfter(e.target.value); setStart(endOf(e.target.value, mins)) }}>
              <option value="">At the very start of the day</option>
              {rows.map(r => <option key={r.id} value={r.id}>{label(r)}</option>)}
            </select>
          </label>
          <label className="l">Starts at<input type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
        </div>
        <div className="l" style={{ display: 'grid', gap: 5, fontWeight: 800, color: 'var(--ink2)', fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>How long?
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {MINS.map(m => <button key={m} type="button" className={`scx-pill${mins === m ? ' on' : ''}`} onClick={() => setMins(m)}>{m} min</button>)}
            <input type="number" min={1} max={600} value={mins} style={{ width: 80, padding: '5px 8px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', font: 'inherit' }} onChange={e => setMins(Math.max(0, parseFloat(e.target.value) || 0))} />
          </div>
        </div>
        <label className="l">Notes (optional)<input value={notes} placeholder="e.g. Chief Guest arrives at Gate 2, escort to front row" onChange={e => setNotes(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="scx-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="scx-btn" style={{ background: 'var(--teal)', color: 'var(--surface)', borderColor: 'var(--teal)' }} disabled={!ok || busy} onClick={submit}>Add cue</button>
        </div>
      </div>
    </div>
  )
}

export default function ShowcallSheet({ load, act, readOnly, onExcel, title }: Props) {
  const [data, setData] = useState<SheetPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lost, setLost] = useState(false)
  const [pickDay, setDay] = useState(''), [pickStage, setStageId] = useState('')
  // remembered per browser; the sheet only draws after the first load, so reading storage in the initialisers cannot disagree with the server render
  const [showMc, setShowMc] = useState(() => ls('scx-mc') !== '0')
  const [hidden, setHidden] = useState<Set<ColKey>>(() => { try { return new Set(JSON.parse(ls('scx-hidden') ?? '[]') as ColKey[]) } catch { return new Set() } })
  const [fs, setFs] = useState(() => { const f = parseFloat(ls('scx-fs') ?? ''); return f >= 9 && f <= 22 ? f : 12.5 })
  const [clock, setClock] = useState('')
  const [mcName, setMcName] = useState('')
  const [adding, setAdding] = useState<{ after: string } | null>(null)   // the Add-cue pop-up; `after` is the row it goes after ('' = very start)
  const [busy, setBusy] = useState(false)
  const loading = useRef(false)

  const refresh = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try { const d = await load(); setData(d); setError(null); setLost(false) }
    catch (e) { const m = e instanceof Error ? e.message : 'Could not load.'; if (data) setLost(true); else setError(m) }
    finally { loading.current = false }
  }, [load, data])
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh })
  useEffect(() => { void refreshRef.current(); const t = setInterval(() => { if (!document.hidden) void refreshRef.current() }, 3000); return () => clearInterval(t) }, [])

  const tz = data?.timezone ?? 'UTC'
  useEffect(() => { const tick = () => setClock(zoned(tz).hms); const t = setInterval(tick, 1000), first = setTimeout(tick, 0); return () => { clearInterval(t); clearTimeout(first) } }, [tz])

  const days = useMemo(() => [...new Set((data?.rows ?? []).map(r => r.date).filter(Boolean))].sort(), [data])
  const stages = useMemo(() => data?.stages ?? [], [data])
  // what is shown: the pick, else today (or the first day), and the first stage that has cues
  const day = days.includes(pickDay) ? pickDay : days.includes(zoned(tz).date) ? zoned(tz).date : days[0] ?? ''
  const stageId = stages.some(s => s.id === pickStage) ? pickStage : stages.find(s => (data?.rows ?? []).some(r => r.trackId === s.id))?.id ?? stages[0]?.id ?? ''

  const all = useMemo(() => (data?.rows ?? []).filter(r => r.date === day && r.trackId === stageId), [data, day, stageId])
  const rows = useMemo(() => all.filter(r => showMc || r.kind !== 'mc'), [all, showMc])
  const today = zoned(tz), isToday = day === today.date
  const nowRow = isToday ? [...all].reverse().find(r => r.kind !== 'mc' && r.flag !== 'removed' && r.startSec <= today.sec && today.sec < r.startSec + Math.max(r.durSec, 60)) : undefined
  const nextRow = isToday ? all.find(r => r.kind !== 'mc' && r.flag !== 'removed' && r.startSec > today.sec) : undefined

  const run = async (body: Record<string, unknown>) => { setBusy(true); const e = await act(body); setBusy(false); if (e) setError(e); else setError(null); await refresh() }
  const set = (r: Row, fields: Record<string, string>) => { if (data) setData({ ...data, rows: data.rows.map(x => x.id === r.id ? { ...x, fields: { ...x.fields, ...fields } } : x) }); void run({ action: 'set', id: r.id, fields }) }
  const stamp = (r: Row, key: 'actual_start' | 'actual_end') => set(r, { [key]: zoned(tz).hms })
  const toggleCol = (k: ColKey) => { const n = new Set(hidden); if (n.has(k)) n.delete(k); else n.add(k); setHidden(n); ls('scx-hidden', JSON.stringify([...n])) }
  const show = (k: ColKey) => !hidden.has(k)
  const colsShown = COLS.filter(c => show(c.key))

  if (error && !data) return <div className="scx"><style>{CSS}</style><div className="scx-err">{error}</div></div>
  if (!data) return <div className="scx"><style>{CSS}</style><div style={{ padding: 24, color: 'var(--ink3)' }}>Loading the sheet…</div></div>

  const stage = stages.find(s => s.id === stageId)
  const colCount = 5 + colsShown.length + (readOnly ? 0 : 1)
  const opts = (k: string) => `scx-${k}`

  return (
    <div className="scx" style={{ ['--scx-fs' as string]: `${fs}px` }}>
      <style>{CSS}</style>
      {Object.keys(VOCAB).map(k => <datalist key={k} id={opts(k)}>{VOCAB[k].map(v => <option key={v} value={v} />)}</datalist>)}
      {lost && <div className="scx-err">Lost the connection to the server. What you see may be out of date; edits are not being saved. Trying again…</div>}
      {error && data && <div className="scx-err">{error}</div>}
      <div className="scx-bar">
        <strong style={{ fontSize: '1.15em' }}>{title ?? data.event_name}</strong>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: '1.2em', color: 'var(--teal-mid)' }}>{clock}</span>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{days.map(d => <button key={d} className={`scx-pill${d === day ? ' on' : ''}`} onClick={() => setDay(d)}>{new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</button>)}</span>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{stages.map(s => <button key={s.id} className={`scx-pill${s.id === stageId ? ' on' : ''}`} onClick={() => setStageId(s.id)}>{s.name}</button>)}</span>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={showMc} onChange={e => { setShowMc(e.target.checked); ls('scx-mc', e.target.checked ? '1' : '0') }} /> MC rows</label>
        <button className="scx-btn" title="Smaller text" onClick={() => { const n = Math.max(9, fs - 1); setFs(n); ls('scx-fs', String(n)) }}>A−</button>
        <button className="scx-btn" title="Bigger text" onClick={() => { const n = Math.min(22, fs + 1); setFs(n); ls('scx-fs', String(n)) }}>A+</button>
        <details style={{ position: 'relative' }}>
          <summary className="scx-btn" style={{ listStyle: 'none' }}>Columns</summary>
          <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 5, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'grid', gap: 5, minWidth: 170, boxShadow: 'var(--shadow-md)' }}>
            {COLS.map(c => <label key={c.key} style={{ display: 'flex', gap: 6 }}><input type="checkbox" checked={show(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}</label>)}
          </div>
        </details>
        {onExcel && <button className="scx-btn" onClick={() => onExcel(data, { mc: showMc })}>Download Excel</button>}
      </div>
      {!readOnly && (
        <div className="scx-bar" style={{ background: 'var(--surface)' }}>
          <span style={{ color: 'var(--ink3)', fontWeight: 700 }}>{stage?.name} · MC for the whole day:</span>
          <input className="c" style={{ width: 170, height: 30, border: '1.5px solid var(--border)', borderRadius: 8 }} placeholder="MC name" value={mcName} onChange={e => setMcName(e.target.value)} />
          <button className="scx-btn" disabled={busy || !mcName.trim()} onClick={() => run({ action: 'fill', key: 'mc', value: mcName.trim(), track_id: stageId, day })}>Copy to all rows</button>
          <button className="scx-btn" title="Add a cue that is not in the Agenda, such as a VIP arrival" onClick={() => setAdding({ after: (nowRow ?? all[all.length - 1])?.id ?? '' })}>+ Add cue</button>
          <button className="scx-btn" disabled={busy} title="Bring back MC rows you removed" onClick={() => run({ action: 'restore_mc', track_id: stageId, day })}>Restore MC rows</button>
        </div>
      )}
      <div className="scx-now">
        <span><span style={{ color: 'var(--ink3)', fontWeight: 800 }}>NOW </span>{nowRow ? <strong>Cue {nowRow.cue} · {nowRow.typeLabel || nowRow.topic} — {nowRow.topic}</strong> : <span style={{ color: 'var(--ink3)' }}>{isToday ? 'Between cues' : 'Not today'}</span>}</span>
        {nextRow && <span><span style={{ color: 'var(--ink3)', fontWeight: 800 }}>NEXT </span><strong>Cue {nextRow.cue} at {secToHm(nextRow.startSec)}</strong> · in {fmtDur(Math.max(0, nextRow.startSec - today.sec))} · {nextRow.typeLabel} — {nextRow.topic}</span>}
      </div>
      {adding && <AddCue rows={all} onClose={() => setAdding(null)} first={adding.after} busy={busy}
        onAdd={async (v) => { await run({ action: 'add', track_id: stageId, day, start: v.start, dur_sec: v.sec, type: v.title, topic: v.notes }); setAdding(null) }} />}
      <div className="scx-grid">
        <table>
          <colgroup><col style={{ width: 52 }} /><col style={{ width: 62 }} /><col style={{ width: 62 }} />{colsShown.map(c => <col key={c.key} style={{ width: c.w }} />)}<col style={{ width: 62 }} />{!readOnly && <col style={{ width: 40 }} />}</colgroup>
          <thead><tr>
            <th>Cue</th><th>Time</th><th>Dur.</th>
            {colsShown.map(c => (
              <th key={c.key}>{c.label}
                {!readOnly && VOCAB[c.key] && <select className="fill" value="" onChange={e => { if (e.target.value) void run({ action: 'fill', key: c.key, value: e.target.value, track_id: stageId, day, only_empty: true }) }}><option value="">Fill empty…</option>{VOCAB[c.key].map(v => <option key={v} value={v}>{v}</option>)}</select>}
              </th>
            ))}
            <th>Actual dur.</th>{!readOnly && <th />}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={colCount} className="ro" style={{ padding: 20 }}>No cues for this stage and day. Sessions appear here once they are published in the Agenda.</td></tr>}
            {rows.map(r => {
              const over = !!r.fields.actual_end, started = !!r.fields.actual_start
              const cls = [r.kind, r.flag ?? '', nowRow?.id === r.id ? 'now' : '', over ? 'done' : ''].filter(Boolean).join(' ')
              const editable = !readOnly && r.flag !== 'removed'
              const fv = (k: string) => r.fields[k] ?? ''
              const text = (k: ColKey, extra?: { list?: string; multiline?: boolean; placeholder?: string }) => <td key={k}><Cell value={fv(k)} ro={!editable} list={extra?.list} multiline={extra?.multiline} placeholder={extra?.placeholder} onSave={v => set(r, { [k]: v })} /></td>
              return (
                <tr key={r.id} className={cls}>
                  <td className="ro strong cue">{r.cue}
                    {r.flag && <div><span className="tag" style={{ background: r.flag === 'changed' || r.flag === 'removed' ? 'var(--red)' : 'var(--info)', color: 'var(--surface)' }}>{r.flag.toUpperCase()}</span></div>}
                  </td>
                  <td className={r.kind === 'custom' && editable ? 'strong' : 'ro strong'}>{r.kind === 'custom' && editable ? <Cell value={secToHm(r.startSec)} onSave={v => set(r, { start: v })} /> : secToHm(r.startSec)}</td>
                  <td className="ro">{(r.kind === 'mc' || r.kind === 'custom') && editable
                    ? <Cell value={String(r.durSec)} onSave={v => set(r, { dur_sec: v })} />
                    : fmtDur(r.durSec)}</td>
                  {colsShown.map(c => {
                    switch (c.key) {
                      case 'actual': return (
                        <td key="actual" style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><Cell value={fv('actual_start')} ro={!editable} placeholder="start" onSave={v => set(r, { actual_start: v })} />{editable && !started && <button className="scx-btn" style={{ padding: '2px 6px' }} title="Stamp the time now" onClick={() => stamp(r, 'actual_start')}>▶</button>}</div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><Cell value={fv('actual_end')} ro={!editable} placeholder="end" onSave={v => set(r, { actual_end: v })} />{editable && started && !over && <button className="scx-btn" style={{ padding: '2px 6px' }} title="Stamp the time now" onClick={() => stamp(r, 'actual_end')}>■</button>}</div>
                          </div>
                        </td>)
                      case 'type': return <td key="type" className="ro strong">{r.typeLabel}</td>
                      case 'people': return <td key="people" className="ro" style={{ whiteSpace: 'pre-line' }}>{r.people.length ? r.people.map((p, i) => <div key={i}>{p.moderator && <span className="mod">(MOD) </span>}{p.name}</div>) : r.peopleText}</td>
                      case 'topic': return (
                        <td key="topic" className="ro" style={{ color: 'var(--ink)' }}>
                          {r.kind === 'custom' && editable ? <Cell value={r.topic} onSave={v => set(r, { topic: v })} /> : r.topic}
                          {r.changes.map((c2, i) => <div key={i} style={{ color: 'var(--red)', fontWeight: 700, fontSize: '.9em' }}>{c2}</div>)}
                          {!readOnly && r.flag && r.flag !== 'removed' && <button className="scx-btn" style={{ marginTop: 3, padding: '1px 8px' }} onClick={() => run({ action: 'accept', id: r.id })}>OK, noted</button>}
                          {!readOnly && r.flag === 'removed' && <button className="scx-btn" style={{ marginTop: 3, padding: '1px 8px', textDecoration: 'none' }} onClick={() => run({ action: 'accept', id: r.id })}>Dismiss</button>}
                        </td>)
                      case 'seats': return <td key="seats"><Cell value={fv('seats')} ro={!editable || r.kind === 'mc'} placeholder={r.seatsAuto ? String(r.seatsAuto) : ''} onSave={v => set(r, { seats: v })} /></td>
                      case 'comments': return (
                        <td key="comments">
                          <Cell value={fv('comments')} ro={!editable} multiline onSave={v => set(r, { comments: v })} />
                          {editable && !fv('comments') && r.suggest && <button className="chip" onClick={() => set(r, { comments: r.suggest })}>↳ {r.suggest}</button>}
                        </td>)
                      default: return text(c.key, { list: VOCAB[c.key] ? opts(c.key) : undefined })
                    }
                  })}
                  <td className="ro">{actualDur(r.fields.actual_start, r.fields.actual_end)}</td>
                  {!readOnly && <td className="ro" style={{ textAlign: 'center' }}><button className="scx-btn" style={{ padding: '0 6px', marginBottom: 2 }} title="Add a cue after this row" onClick={() => setAdding({ after: r.id })}>+</button>{(r.kind === 'mc' || r.kind === 'custom') && <button className="scx-btn" style={{ padding: '0 6px' }} title="Remove this row" onClick={() => run({ action: 'delete', id: r.id })}>×</button>}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
