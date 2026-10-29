'use client'

import { use, useEffect, useState } from 'react'

/* Arrival & Travel — the page a speaker (or their assistant) opens from the email link, on a phone. No login; the private link is the key. One screen, big tap targets,
   native date/time pickers. Anyone with the link sees what is saved and can change it; each save records who they said they are. */

type Cls = 'first' | 'business' | 'economy'
type Saved = { no_reception: boolean; phone: string | null; arr_flight: string | null; arr_class: Cls | null; arr_date: string | null; arr_time: string | null; dep_flight: string | null; dep_class: Cls | null; dep_date: string | null; dep_time: string | null; submitted_by: string | null; submitted_at: string; updated_at: string }
type Data = { event_name: string; speaker_name: string; deadline: string | null; people: string[]; saved: Saved | null }
const CLASSES: { key: Cls; label: string }[] = [{ key: 'first', label: 'First' }, { key: 'business', label: 'Business' }, { key: 'economy', label: 'Economy' }]
const OTHER = '__other'

const STYLES = `
  .tv-shell { min-height: 100vh; background: var(--surface); font-family: var(--font-manrope), Manrope, sans-serif; color: var(--ink); }
  .tv-wrap { max-width: 520px; margin: 0 auto; padding: 22px 16px 60px; }
  .tv-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px 16px; margin-bottom: 14px; }
  .tv-h { font-size: 15px; font-weight: 900; margin: 0 0 12px; }
  .tv-l { display: block; font-size: 13.5px; font-weight: 700; color: var(--ink2); margin: 12px 0 6px; }
  .tv-in { width: 100%; box-sizing: border-box; padding: 14px 14px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface); color: var(--ink); font-size: 17px; font-family: inherit; min-height: 52px; color-scheme: dark; }
  .tv-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .tv-seg button { padding: 14px 6px; border-radius: 10px; border: 1.5px solid var(--border); background: transparent; color: var(--ink2); font-size: 16px; font-weight: 800; font-family: inherit; cursor: pointer; min-height: 52px; }
  .tv-seg button.on { background: var(--teal); border-color: var(--teal); color: white; }
  .tv-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tv-btn { width: 100%; padding: 16px; border-radius: 12px; border: none; background: var(--teal); color: white; font-size: 17px; font-weight: 900; font-family: inherit; cursor: pointer; min-height: 56px; }
  .tv-btn[disabled] { opacity: .55; }
  .tv-note { font-size: 13px; color: var(--ink3); line-height: 1.55; }
  .tv-err { padding: 12px 14px; border-radius: 10px; background: var(--card); border: 1.5px solid var(--red); color: var(--red); font-size: 14px; font-weight: 700; margin-bottom: 12px; }
  .tv-ok { padding: 12px 14px; border-radius: 10px; background: var(--card); border: 1.5px solid var(--teal); color: var(--ink); font-size: 14px; line-height: 1.55; margin-bottom: 12px; }
`

const fmtDeadline = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

export default function TravelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const api = `/api/public/travel/${token}`
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [who, setWho] = useState('')
  const [whoOther, setWhoOther] = useState('')
  const [none, setNone] = useState(false)
  const [f, setF] = useState({ phone: '', arr_flight: '', arr_class: '' as Cls | '', arr_date: '', arr_time: '', dep_flight: '', dep_class: '' as Cls | '', dep_date: '', dep_time: '' })
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    let live = true
    fetch(api, { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!live) return
      if (!r.ok) { setError(d.error ?? 'This link is not valid.'); return }
      setData(d)
      if (d.saved) {
        const s = d.saved as Saved
        setNone(s.no_reception)
        setF({ phone: s.phone ?? '', arr_flight: s.arr_flight ?? '', arr_class: s.arr_class ?? '', arr_date: s.arr_date ?? '', arr_time: s.arr_time ?? '', dep_flight: s.dep_flight ?? '', dep_class: s.dep_class ?? '', dep_date: s.dep_date ?? '', dep_time: s.dep_time ?? '' })
      }
      if (d.people?.length === 1) setWho(d.people[0])
    }).catch(() => live && setError('Could not load this page. Please check your connection and try again.'))
    return () => { live = false }
  }, [api])

  async function submit() {
    setMsg(null); setBusy(true)
    const by = who === OTHER ? whoOther.trim() : who
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ by_name: by, no_reception: none, ...f }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(d.error ?? 'Could not save. Please try again.'); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    const res = await fetch(api, { cache: 'no-store' }); if (res.ok) setData(await res.json())
    setMsg('ok'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (error) return <div className="tv-shell"><style>{STYLES}</style><div className="tv-wrap" style={{ paddingTop: '60px', fontSize: '15px', lineHeight: 1.6 }}>{error}</div></div>
  if (!data) return <div className="tv-shell"><style>{STYLES}</style><div className="tv-wrap" style={{ color: 'var(--ink3)' }}>Loading…</div></div>

  const deadline = fmtDeadline(data.deadline)
  const saved = data.saved
  return (
    <div className="tv-shell">
      <style>{STYLES}</style>
      <div className="tv-wrap">
        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.08em', color: 'var(--teal)', textTransform: 'uppercase' }}>{data.event_name}</div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, margin: '4px 0 6px', lineHeight: 1.2 }}>Your arrival details</h1>
        <p className="tv-note" style={{ marginTop: 0 }}>For {data.speaker_name}. The Dubai Department of Economy and Tourism (DET) uses these to arrange airport reception. It takes about a minute.{deadline ? <> Please complete it by <strong>{deadline}</strong>.</> : null}</p>

        {msg === 'ok' && <div className="tv-ok"><strong>Thank you, saved.</strong> You can open this same link any time to change your details.</div>}
        {msg && msg !== 'ok' && <div className="tv-err">{msg}</div>}
        {saved && msg !== 'ok' && <div className="tv-ok">Details were saved by <strong>{saved.submitted_by}</strong> on {new Date(saved.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. You can change them below.</div>}

        <div className="tv-card">
          <h2 className="tv-h">Who is filling this in?</h2>
          <select className="tv-in" value={who} onChange={e => setWho(e.target.value)}>
            <option value="">Choose…</option>
            {data.people.map(p => <option key={p} value={p}>{p}</option>)}
            <option value={OTHER}>Someone else…</option>
          </select>
          {who === OTHER && <input className="tv-in" style={{ marginTop: '10px' }} placeholder="Your name" value={whoOther} onChange={e => setWhoOther(e.target.value)} />}
        </div>

        <div className="tv-card">
          <label style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}>
            <input type="checkbox" checked={none} onChange={e => setNone(e.target.checked)} style={{ width: '24px', height: '24px', flexShrink: 0 }} />
            I do not need airport reception
          </label>
        </div>

        {!none && (
          <>
            <div className="tv-card">
              <h2 className="tv-h">Arrival flight</h2>
              <label className="tv-l" style={{ marginTop: 0 }}>Flight number</label>
              <input className="tv-in" placeholder="e.g. EK 202" autoCapitalize="characters" value={f.arr_flight} onChange={e => set('arr_flight', e.target.value)} />
              <label className="tv-l">Travel class</label>
              <div className="tv-seg">{CLASSES.map(c => <button key={c.key} type="button" className={f.arr_class === c.key ? 'on' : ''} onClick={() => set('arr_class', c.key)}>{c.label}</button>)}</div>
              <div className="tv-two">
                <div><label className="tv-l">Arrival date</label><input className="tv-in" type="date" value={f.arr_date} onChange={e => set('arr_date', e.target.value)} /></div>
                <div><label className="tv-l">Arrival time</label><input className="tv-in" type="time" value={f.arr_time} onChange={e => set('arr_time', e.target.value)} /></div>
              </div>
            </div>

            <div className="tv-card">
              <h2 className="tv-h">Departure flight <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>(if you know it)</span></h2>
              <label className="tv-l" style={{ marginTop: 0 }}>Flight number</label>
              <input className="tv-in" placeholder="e.g. EK 203" autoCapitalize="characters" value={f.dep_flight} onChange={e => set('dep_flight', e.target.value)} />
              <label className="tv-l">Travel class</label>
              <div className="tv-seg">{CLASSES.map(c => <button key={c.key} type="button" className={f.dep_class === c.key ? 'on' : ''} onClick={() => set('dep_class', c.key)}>{c.label}</button>)}</div>
              <div className="tv-two">
                <div><label className="tv-l">Departure date</label><input className="tv-in" type="date" value={f.dep_date} onChange={e => set('dep_date', e.target.value)} /></div>
                <div><label className="tv-l">Departure time</label><input className="tv-in" type="time" value={f.dep_time} onChange={e => set('dep_time', e.target.value)} /></div>
              </div>
            </div>

            <div className="tv-card">
              <h2 className="tv-h">Contact number</h2>
              <input className="tv-in" type="tel" inputMode="tel" placeholder="Mobile / WhatsApp, with country code" value={f.phone} onChange={e => set('phone', e.target.value)} />
              <p className="tv-note" style={{ marginBottom: 0 }}>The reception team will use this number to reach you at the airport.</p>
            </div>
          </>
        )}

        <p className="tv-note">These details are shared with the Dubai Department of Economy and Tourism and the event team to arrange your airport reception.</p>
        <button className="tv-btn" onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : saved ? 'Save changes' : 'Submit'}</button>
      </div>
    </div>
  )
}
