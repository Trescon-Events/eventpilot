'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { dayBlocks, mergeWindows, slotOf, toMinutes, type MediaDay, type MediaWindow } from '@/app/lib/pr/windows'

/* Media interview interest (2026-10-21) — the page a speaker opens from the email. No login; the private link in the URL is the key.
   One question (open to media bites / interviews?) and, if yes, the hours they are free on each event day, tapped as hour blocks that merge into ranges.
   Their own agenda sessions are shown as busy. It is a preference, not a booking: the PR team arranges as many interviews as it can inside the chosen hours.
   Mobile first; the answer can be changed any time until the link expires. */

type Pr = { name: string; role: string | null; email: string; phone: string | null }
type Busy = { date: string; from: string; to: string; title: string }
type Data = {
  speaker_name: string; event_name: string; timezone: string; days: MediaDay[]; busy: Busy[]; intro: string | null; pr: Pr[]
  answer: { interested: boolean; windows: MediaWindow[]; note: string | null; submitted_at: string | null } | null; expires_at: string
}

const STYLES = `
  .mi-shell { min-height: 100vh; background: var(--surface); font-family: var(--font-manrope), Manrope, sans-serif; color: var(--ink); }
  .mi-wrap { max-width: 720px; margin: 0 auto; padding: clamp(16px, 4vw, 36px) 16px 80px; }
  .mi-event { font-size: 12.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--teal); }
  .mi-h1 { font-size: clamp(22px, 5vw, 30px); font-weight: 900; margin: 6px 0 10px; line-height: 1.2; }
  .mi-p { font-size: 15px; line-height: 1.6; color: var(--ink2); margin: 0 0 14px; }
  .mi-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .mi-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 480px) { .mi-choice { grid-template-columns: 1fr; } }
  .mi-big { padding: 16px; border-radius: 12px; border: 2px solid var(--border); background: var(--card); color: var(--ink); font-size: 15.5px; font-weight: 800; cursor: pointer; font-family: inherit; text-align: left; line-height: 1.35; }
  .mi-big.on { border-color: var(--teal); background: var(--teal-light); }
  .mi-big small { display: block; font-weight: 500; font-size: 13px; color: var(--ink3); margin-top: 4px; }
  .mi-day { font-size: 16px; font-weight: 900; margin: 0 0 2px; }
  .mi-hint { font-size: 12.5px; color: var(--ink3); margin: 0 0 10px; }
  .mi-presets { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .mi-chip { padding: 7px 13px; border-radius: 999px; border: 1.5px solid var(--border); background: transparent; color: var(--ink2); font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .mi-blocks { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
  .mi-block { padding: 11px 6px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface); color: var(--ink); font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; text-align: center; min-height: 44px; }
  .mi-block.on { background: var(--teal); border-color: var(--teal); color: white; }
  .mi-block.busy { background: transparent; border-style: dashed; color: var(--ink4); cursor: not-allowed; font-size: 12px; font-weight: 600; }
  .mi-summary { font-size: 13.5px; color: var(--ink2); margin-top: 10px; min-height: 20px; }
  .mi-text { width: 100%; box-sizing: border-box; min-height: 80px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 14.5px; font-family: inherit; resize: vertical; }
  .mi-btn { padding: 14px 22px; border-radius: 12px; border: none; background: var(--teal); color: white; font-weight: 800; font-size: 15.5px; cursor: pointer; font-family: inherit; width: 100%; }
  .mi-btn[disabled] { opacity: .5; cursor: default; }
  .mi-btn.ghost { background: transparent; color: var(--ink2); border: 1.5px solid var(--border); }
  .mi-err { padding: 11px 14px; border-radius: 10px; background: var(--red-light); border: 1px solid var(--red-border); color: var(--red); font-size: 14px; margin-bottom: 12px; }
  .mi-pr { display: grid; gap: 2px; font-size: 14.5px; line-height: 1.5; }
`

const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const key = (date: string, from: string) => `${date}|${from}`

export default function MediaInterestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [interested, setInterested] = useState<boolean | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/public/media-interest/${token}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'This link could not be opened.'); return }
      setData(d)
      if (d.answer) {
        setInterested(d.answer.interested); setNote(d.answer.note ?? ''); setDone(true)
        const s = new Set<string>()
        for (const day of d.days as MediaDay[]) for (const b of dayBlocks(day.open, day.close, slotOf(day))) {
          if ((d.answer.windows as MediaWindow[]).some(w => w.date === day.day && toMinutes(w.from) <= toMinutes(b.from) && toMinutes(w.to) >= toMinutes(b.to))) s.add(key(day.day, b.from))
        }
        setPicked(s)
      }
    }).catch(() => setError('This link could not be opened. Please check your connection and try again.'))
  }, [token])

  const busyOf = useMemo(() => (date: string, from: string, to: string) => (data?.busy ?? []).find(b => b.date === date && toMinutes(b.from) < toMinutes(to) && toMinutes(b.to) > toMinutes(from)) ?? null, [data])

  function toggle(date: string, from: string) { setPicked(p => { const n = new Set(p); const k = key(date, from); if (n.has(k)) n.delete(k); else n.add(k); return n }) }
  function preset(day: MediaDay, fromMin: number | null, toMin: number | null) {
    setPicked(p => {
      const n = new Set(p)
      const blocks = dayBlocks(day.open, day.close, slotOf(day)).filter(b => (fromMin === null || toMinutes(b.from) >= fromMin) && (toMin === null || toMinutes(b.to) <= toMin) && !busyOf(day.day, b.from, b.to))
      const allOn = blocks.length > 0 && blocks.every(b => n.has(key(day.day, b.from)))
      for (const b of blocks) { if (allOn) n.delete(key(day.day, b.from)); else n.add(key(day.day, b.from)) }
      return n
    })
  }
  const windows = useMemo<MediaWindow[]>(() => {
    const ws: MediaWindow[] = []
    for (const day of data?.days ?? []) for (const b of dayBlocks(day.open, day.close, slotOf(day))) if (picked.has(key(day.day, b.from))) ws.push({ date: day.day, from: b.from, to: b.to })
    return mergeWindows(ws)
  }, [data, picked])

  async function submit() {
    setFormError(null)
    if (interested === null) { setFormError('Please choose Yes or No first.'); return }
    if (interested && !windows.length) { setFormError('Please tap at least one time block, or choose “No, not this time”.'); return }
    setSaving(true)
    const r = await fetch(`/api/public/media-interest/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interested, windows: interested ? windows : [], note }) })
    setSaving(false)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setFormError(d.error || 'Your answer could not be saved. Please try again.'); return }
    setDone(true); window.scrollTo({ top: 0 })
  }

  if (error) return <div className="mi-shell"><style>{STYLES}</style><div className="mi-wrap"><h1 className="mi-h1">This link can’t be used</h1><p className="mi-p">{error}</p></div></div>
  if (!data) return <div className="mi-shell"><style>{STYLES}</style><div className="mi-wrap"><p className="mi-p">Loading…</p></div></div>

  const first = data.speaker_name.split(' ')[0] || 'there'
  const pr = data.pr

  if (done) {
    return (
      <div className="mi-shell"><style>{STYLES}</style>
        <div className="mi-wrap">
          <div className="mi-event">{data.event_name}</div>
          <h1 className="mi-h1">{interested ? `Thank you, ${first} — you’re down for media` : `Thank you, ${first}`}</h1>
          {interested ? (
            <>
              <p className="mi-p">We have noted that you are open to media interviews during these times (event time, {data.timezone.replace('_', ' ')}):</p>
              <div className="mi-card">
                {[...new Set(windows.map(w => w.date))].map(d => <div key={d} style={{ marginBottom: 6 }}><strong>{fmtDay(d)}</strong>: {windows.filter(w => w.date === d).map(w => `${w.from}–${w.to}`).join(', ')}</div>)}
              </div>
            </>
          ) : <p className="mi-p">We have noted that you are not available for media interviews this time. Thank you for letting us know.</p>}
          {interested && pr.length > 0 && (
            <div className="mi-card">
              <div style={{ fontWeight: 900, marginBottom: 6 }}>What happens next</div>
              <p className="mi-p" style={{ marginBottom: 8 }}>{data.intro || 'Our PR team will contact you to arrange interviews with the media attending the event, within the times you chose.'}</p>
              {pr.map(c => (
                <div key={c.email} className="mi-pr" style={{ marginBottom: 8 }}>
                  <strong>{c.name}{c.role ? ` — ${c.role}` : ''}</strong>
                  <a href={`mailto:${c.email}`} style={{ color: 'var(--teal)' }}>{c.email}</a>
                  {c.phone && <a href={`tel:${c.phone}`} style={{ color: 'var(--teal)' }}>{c.phone}</a>}
                </div>
              ))}
            </div>
          )}
          <button className="mi-btn ghost" onClick={() => setDone(false)}>Change my answer</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mi-shell"><style>{STYLES}</style>
      <div className="mi-wrap">
        <div className="mi-event">{data.event_name}</div>
        <h1 className="mi-h1">Media Interviews</h1>
        <p className="mi-p">Media houses and journalists will be at the event, and many would like short bites or interviews with our speakers. Tell us if you are open to it and when you are free. There is nothing to book: our PR team will coordinate with you, within the times you choose.</p>

        <div className="mi-choice" style={{ marginBottom: 16 }}>
          <button className={`mi-big${interested === true ? ' on' : ''}`} onClick={() => setInterested(true)}>Yes, I’m open to it<small>I’ll choose the times I’m free</small></button>
          <button className={`mi-big${interested === false ? ' on' : ''}`} onClick={() => setInterested(false)}>No, not this time<small>Thanks for asking</small></button>
        </div>

        {interested === true && (
          <>
            {data.days.map(day => (
              <div key={day.day} className="mi-card">
                <h2 className="mi-day">{fmtDay(day.day)}</h2>
                <p className="mi-hint">Tap every {slotOf(day) === 30 ? 'half-hour' : 'hour'} slot you could do — as many as you like (event time, {data.timezone.replace('_', ' ')}). Tap again to remove.</p>
                <div className="mi-presets">
                  <button className="mi-chip" onClick={() => preset(day, null, 12 * 60)}>Morning</button>
                  <button className="mi-chip" onClick={() => preset(day, 12 * 60, 14 * 60)}>Lunch</button>
                  <button className="mi-chip" onClick={() => preset(day, 14 * 60, null)}>Afternoon</button>
                  <button className="mi-chip" onClick={() => preset(day, null, null)}>Whole day</button>
                </div>
                <div className="mi-blocks">
                  {dayBlocks(day.open, day.close, slotOf(day)).map(b => {
                    const busy = busyOf(day.day, b.from, b.to)
                    const on = picked.has(key(day.day, b.from))
                    return busy
                      ? <button key={b.from} className="mi-block busy" disabled title={busy.title}>{b.from}–{b.to}<br />on stage</button>
                      : <button key={b.from} className={`mi-block${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(day.day, b.from)}>{b.from}–{b.to}</button>
                  })}
                </div>
                <div className="mi-summary">{windows.filter(w => w.date === day.day).map(w => `${w.from}–${w.to}`).join(', ') || 'Nothing chosen for this day'}</div>
              </div>
            ))}
            <div className="mi-card">
              <label htmlFor="mi-note" style={{ fontWeight: 800, fontSize: 14.5, display: 'block', marginBottom: 6 }}>Anything we should know? <span style={{ fontWeight: 500, color: 'var(--ink3)' }}>(optional)</span></label>
              <textarea id="mi-note" className="mi-text" value={note} onChange={e => setNote(e.target.value)} placeholder="Topics you’d like to speak on, languages, outlets you prefer or would rather avoid…" maxLength={1000} />
            </div>
          </>
        )}

        {formError && <div className="mi-err" role="alert">{formError}</div>}
        {interested !== null && <button className="mi-btn" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Submit my answer'}</button>}
        <p className="mi-hint" style={{ marginTop: 12, textAlign: 'center' }}>You can change your answer later using this same link.</p>
      </div>
    </div>
  )
}
