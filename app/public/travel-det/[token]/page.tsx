'use client'

import { use, useEffect, useState } from 'react'

/* Arrival & Travel — the DET contact's live, read-only table of every speaker's arrival and departure details. It re-reads every 30 seconds. */

type Row = { name: string; company: string | null; country: string | null; no_reception: boolean; phone: string | null; arr_flight: string | null; arr_class: string | null; arr_date: string | null; arr_time: string | null; dep_flight: string | null; dep_class: string | null; dep_date: string | null; dep_time: string | null; submitted_by: string | null; updated_at: string }
type Data = { event_name: string; contact: string | null; invited: number; rows: Row[]; generated_at: string }

const STYLES = `
  .dt-shell { min-height: 100vh; background: var(--surface); font-family: var(--font-manrope), Manrope, sans-serif; color: var(--ink); }
  .dt-wrap { padding: 22px clamp(12px, 3vw, 32px) 60px; }
  .dt-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--card); }
  .dt-table { border-collapse: collapse; width: 100%; font-size: 14px; }
  .dt-table th { text-align: left; padding: 10px 12px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink3); border-bottom: 1px solid var(--border); white-space: nowrap; }
  .dt-table td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); vertical-align: top; }
  .dt-table tr:last-child td { border-bottom: none; }
`
const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '')
const leg = (flight: string | null, cls: string | null, date: string | null, time: string | null) => (flight || date) ? <><strong>{flight}</strong>{cls ? ` · ${cls}` : ''}<br />{fmtDate(date)} {time}</> : <span style={{ color: 'var(--ink4)' }}>—</span>

export default function TravelDetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const read = () => fetch(`/api/public/travel-det/${token}`, { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!live) return
      if (!r.ok) setError(d.error ?? 'This link is not valid.'); else { setError(null); setData(d) }
    }).catch(() => undefined)
    void read()
    const t = setInterval(() => void read(), 30000)
    return () => { live = false; clearInterval(t) }
  }, [token])

  if (error) return <div className="dt-shell"><style>{STYLES}</style><div className="dt-wrap" style={{ fontSize: '15px' }}>{error}</div></div>
  if (!data) return <div className="dt-shell"><style>{STYLES}</style><div className="dt-wrap" style={{ color: 'var(--ink3)' }}>Loading…</div></div>
  const needing = data.rows.filter(r => !r.no_reception)
  return (
    <div className="dt-shell">
      <style>{STYLES}</style>
      <div className="dt-wrap">
        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.08em', color: 'var(--teal)', textTransform: 'uppercase' }}>{data.event_name}</div>
        <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '4px 0 6px' }}>Speaker arrivals</h1>
        <p style={{ fontSize: '14px', color: 'var(--ink3)', margin: '0 0 16px', lineHeight: 1.6 }}>{data.contact ? `${data.contact}, this ` : 'This '}page updates by itself as speakers submit their details. {data.rows.length} of {data.invited} invited speakers have responded; {needing.length} need airport reception. Last checked {new Date(data.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</p>
        <div className="dt-scroll">
          <table className="dt-table">
            <thead><tr><th>Speaker</th><th>Arrival</th><th>Departure</th><th>Contact number</th><th>Updated</th></tr></thead>
            <tbody>
              {data.rows.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink3)' }}>No details yet.</td></tr>}
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td><strong>{r.name}</strong><br /><span style={{ color: 'var(--ink3)' }}>{[r.company, r.country].filter(Boolean).join(' · ')}</span></td>
                  {r.no_reception ? <td colSpan={3} style={{ color: 'var(--ink3)' }}>No airport reception needed</td> : <>
                    <td>{leg(r.arr_flight, r.arr_class, r.arr_date, r.arr_time)}</td>
                    <td>{leg(r.dep_flight, r.dep_class, r.dep_date, r.dep_time)}</td>
                    <td>{r.phone}</td>
                  </>}
                  <td style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{new Date(r.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
