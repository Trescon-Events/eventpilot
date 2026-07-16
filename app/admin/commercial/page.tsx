'use client'

import { useState, useEffect, useMemo } from 'react'
import PortfolioReadinessCard from './PortfolioReadinessCard'
import PageHeader from '@/app/components/PageHeader'

type ReadinessBucket = 'ready' | 'partial' | 'high_risk'

interface EventCard {
  id: string; name: string; status: string; event_date: string | null
  country: string | null; region: string | null; business_unit: string | null
  event_director: string | null; currency: string
  revenue: number; pending_revenue: number; costs: number
  direct_costs: number; staff_costs: number; overhead_costs: number
  profit: number; margin: number; budget: number; achievement: number
  traffic_light: 'green' | 'amber' | 'red'
}

interface DashboardData {
  kpis: { total_events: number; total_revenue: number; total_direct_costs: number; total_staff_costs: number; total_overheads: number; total_costs: number; total_gross_profit: number; total_net_profit: number; avg_margin: number; revenue_achievement: number; cost_variance: number }
  events: EventCard[]
  filters: { regions: string[]; business_units: string[]; statuses: string[] }
}

const SL: Record<string,string> = { concept:'Concept', research:'Research', planning:'Planning', sales:'Sales', delivery:'Delivery', completed:'Completed', closed:'Closed', active:'Active' }
const SC: Record<string,{bg:string;fg:string}> = {
  concept:{bg:'#E3F2FD',fg:'#1565C0'}, research:{bg:'#F3E5F5',fg:'#7B1FA2'},
  planning:{bg:'#FFF8E1',fg:'#F57F17'}, sales:{bg:'#E8F5E9',fg:'#2E7D32'},
  delivery:{bg:'#E0F7FA',fg:'#00838F'}, completed:{bg:'#F1F8E9',fg:'#33691E'},
  closed:{bg:'#ECEFF1',fg:'#546E7A'}, active:{bg:'#E8F5E9',fg:'#2E7D32'},
}
const TL: Record<string,string> = { green:'#4CAF50', amber:'#FF9800', red:'#F44336' }

/* ── Mini Donut SVG ── */
function Donut({ pct, color, size = 44, strokeW = 5 }: { pct: number; color: string; size?: number; strokeW?: number }) {
  const r = (size - strokeW) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(Math.max(pct, 0), 100) / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E8EEF4" strokeWidth={strokeW} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeW}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  )
}

/* ── Mini Bar Sparkline ── */
function CostBar({ direct, staff, overhead, total }: { direct: number; staff: number; overhead: number; total: number }) {
  if (total <= 0) return <div style={{ height: '6px', background: '#EEF2F7', borderRadius: '3px' }} />
  return (
    <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: '#EEF2F7' }}>
      <div style={{ width: `${(direct/total)*100}%`, background: '#EF5350' }} title={`Direct: $${Math.round(direct).toLocaleString()}`} />
      <div style={{ width: `${(staff/total)*100}%`, background: '#FFA726' }} title={`Staff: $${Math.round(staff).toLocaleString()}`} />
      <div style={{ width: `${(overhead/total)*100}%`, background: '#AB47BC' }} title={`Overhead: $${Math.round(overhead).toLocaleString()}`} />
    </div>
  )
}

export default function CommercialDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [rF, setRF] = useState(''); const [bF, setBF] = useState(''); const [sF, setSF] = useState('')
  const [sortBy, setSortBy] = useState<'name'|'revenue'|'profit'|'margin'>('revenue')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [view, setView] = useState<'cards'|'table'>('cards')
  const [readinessBucket, setReadinessBucket] = useState<ReadinessBucket | null>(null)
  const [readinessEventIds, setReadinessEventIds] = useState<string[]>([])

  useEffect(() => {
    const p = new URLSearchParams()
    if (rF) p.set('region', rF); if (bF) p.set('bu', bF); if (sF) p.set('status', sF)
    fetch(`/api/events/commercial/executive?${p}`).then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [rF, bF, sF])

  const fmt = (n: number, c = 'USD') => new Intl.NumberFormat('en-US', { style:'currency', currency:c, maximumFractionDigits:0 }).format(n)
  const fc = (n: number) => { if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(1)}M`; if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(0)}K`; return `$${n.toFixed(0)}` }

  const sorted = useMemo(() => {
    if (!data?.events) return []
    const idSet = readinessBucket ? new Set(readinessEventIds) : null
    const filtered = idSet ? data.events.filter(e => idSet.has(e.id)) : data.events
    return [...filtered].sort((a, b) => {
      const m = sortDir === 'asc' ? 1 : -1
      return sortBy === 'name' ? m * a.name.localeCompare(b.name) : m * ((a[sortBy]||0) - (b[sortBy]||0))
    })
  }, [data?.events, sortBy, sortDir, readinessBucket, readinessEventIds])

  function doSort(c: 'name'|'revenue'|'profit'|'margin') {
    if (sortBy === c) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(c); setSortDir('desc') }
  }

  if (loading) return (
    <div style={{ background: '#E8EEF4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '28px', height: '28px', border: '3px solid #D8EAEB', borderTopColor: '#00A5A3', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const k = data?.kpis || { total_events:0, total_revenue:0, total_direct_costs:0, total_staff_costs:0, total_overheads:0, total_costs:0, total_gross_profit:0, total_net_profit:0, avg_margin:0, revenue_achievement:0, cost_variance:0 }
  const profitColor = k.total_net_profit >= 0 ? '#2E7D32' : '#D32F2F'
  const marginColor = k.avg_margin >= 20 ? '#2E7D32' : k.avg_margin >= 10 ? '#E65100' : '#D32F2F'

  return (
    <div style={{ background: '#E8EEF4', minHeight: '100vh' }}>
      <PageHeader eyebrow="Executive Dashboard" title="Commercial Tracker" />

      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '20px 24px' }}>

        {/* ── PORTFOLIO P&L READINESS ── */}
        <PortfolioReadinessCard
          activeBucket={readinessBucket}
          onBucketFilter={(b, ids) => { setReadinessBucket(b); setReadinessEventIds(ids) }}
        />

        {/* ── KPI ROW with Donut Charts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.5fr 1fr', gap: '12px', marginBottom: '18px' }}>
          {/* Events count */}
          <div style={{ ...card, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(14,116,144,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '22px', fontWeight: 900, color: '#0E7490' }}>{k.total_events}</span>
            </div>
            <div>
              <p style={{ ...kpiLabel }}>Total Events</p>
              <p style={{ fontSize: '11px', color: '#5B7080', margin: 0 }}>{sorted.filter(e => e.status === 'active' || e.status === 'delivery').length} active</p>
            </div>
          </div>

          {/* Revenue + Costs with donut */}
          <div style={{ ...card, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Donut pct={k.revenue_achievement} color="#00A5A3" size={52} strokeW={5} />
              <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(0deg)', fontSize: '10px', fontWeight: 900, color: '#0F1923' }}>
                {k.revenue_achievement}%
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...kpiLabel }}>Revenue vs Budget</p>
              <p style={{ fontSize: '20px', fontWeight: 900, color: '#00897B', margin: '2px 0 0', fontFamily: 'Manrope, system-ui' }}>{fc(k.total_revenue)}</p>
              <p style={{ fontSize: '11px', color: '#5B7080', margin: '2px 0 0' }}>Budget target achievement</p>
            </div>
          </div>

          {/* Profit with donut */}
          <div style={{ ...card, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Donut pct={Math.max(k.avg_margin, 0)} color={marginColor} size={52} strokeW={5} />
              <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(0deg)', fontSize: '10px', fontWeight: 900, color: '#0F1923' }}>
                {k.avg_margin}%
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...kpiLabel }}>Profit & Margin</p>
              <p style={{ fontSize: '20px', fontWeight: 900, color: profitColor, margin: '2px 0 0', fontFamily: 'Manrope, system-ui' }}>{fc(k.total_net_profit)}</p>
              <p style={{ fontSize: '11px', color: '#5B7080', margin: '2px 0 0' }}>Costs: {fc(k.total_costs)}</p>
            </div>
          </div>

          {/* Cost breakdown mini */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <p style={{ ...kpiLabel, marginBottom: '8px' }}>Cost Split (Portfolio)</p>
            {(() => {
              const td = sorted.reduce((s, e) => s + e.direct_costs, 0)
              const ts = sorted.reduce((s, e) => s + e.staff_costs, 0)
              const to = sorted.reduce((s, e) => s + e.overhead_costs, 0)
              const tt = td + ts + to
              return (
                <>
                  <CostBar direct={td} staff={ts} overhead={to} total={tt} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                    {[{ l:'Direct', v:td, c:'#EF5350' }, { l:'Staff', v:ts, c:'#FFA726' }, { l:'OH', v:to, c:'#AB47BC' }].map((c, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: c.c, margin: '0 auto 3px' }} />
                        <p style={{ fontSize: '9px', fontWeight: 700, color: '#5B7080', margin: 0 }}>{c.l}</p>
                        <p style={{ fontSize: '12px', fontWeight: 800, color: '#0F1923', margin: 0 }}>{fc(c.v)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* ── CONTROLS ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { v: rF, set: setRF, ph: 'Region', opts: data?.filters.regions || [] },
              { v: bF, set: setBF, ph: 'Business Unit', opts: data?.filters.business_units || [] },
              { v: sF, set: setSF, ph: 'Status', opts: data?.filters.statuses || [] },
            ].map((f, i) => (
              <select key={i} value={f.v} onChange={e => f.set(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #D8EAEB', fontSize: '12px', fontWeight: 600, background: f.v ? 'rgba(0,165,163,0.06)' : '#fff', color: f.v ? '#00897B' : '#5B7080', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                <option value="">{f.ph}</option>
                {f.opts.map(o => <option key={o} value={o}>{SL[o] || o}</option>)}
              </select>
            ))}
            {(rF || bF || sF) && (
              <button onClick={() => { setRF(''); setBF(''); setSF('') }}
                style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', background: '#D8EAEB', fontSize: '11px', fontWeight: 700, color: '#5B7080', cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
            )}
          </div>
          <div style={{ display: 'flex', border: '1px solid #D8EAEB', borderRadius: '8px', overflow: 'hidden', background: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            {(['cards','table'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: view === v ? '#0F1923' : '#FFFFFF', color: view === v ? '#C0F43C' : '#5B7080', fontSize: '11px', fontWeight: 800,
              }}>{v === 'cards' ? 'Cards' : 'Table'}</button>
            ))}
          </div>
        </div>

        {/* ── CARD VIEW ── */}
        {view === 'cards' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '12px' }}>
            {sorted.map(ev => {
              const sc = SC[ev.status] || SC.active
              return (
                <div key={ev.id} onClick={() => window.location.href = `/admin/commercial/${ev.id}`}
                  style={{
                    ...card, padding: '18px 20px', cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.15s',
                    borderLeft: `3px solid ${TL[ev.traffic_light]}`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</p>
                      <p style={{ fontSize: '11px', color: '#5B7080', margin: 0 }}>{[ev.region, ev.business_unit].filter(Boolean).join(' / ') || 'No region'}</p>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '5px', background: sc.bg, color: sc.fg, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                      {SL[ev.status] || ev.status}
                    </span>
                  </div>
                  {/* Financials row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '14px' }}>
                    {[
                      { l: 'Revenue', v: fc(ev.revenue), c: '#00897B' },
                      { l: 'Profit', v: fc(ev.profit), c: ev.profit >= 0 ? '#2E7D32' : '#D32F2F' },
                      { l: 'Margin', v: `${ev.margin}%`, c: ev.margin >= 20 ? '#2E7D32' : ev.margin >= 10 ? '#E65100' : '#D32F2F' },
                    ].map((m, i) => (
                      <div key={i} style={{ background: '#F8FAFB', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: '#8CA0B3', margin: '0 0 2px' }}>{m.l}</p>
                        <p style={{ fontSize: '16px', fontWeight: 900, color: m.c, margin: 0, fontFamily: 'Manrope, system-ui' }}>{m.v}</p>
                      </div>
                    ))}
                  </div>
                  {/* Cost breakdown bar */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#8CA0B3', textTransform: 'uppercase', letterSpacing: '1px' }}>Cost Breakdown</span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#D32F2F' }}>{fc(ev.costs)}</span>
                    </div>
                    <CostBar direct={ev.direct_costs} staff={ev.staff_costs} overhead={ev.overhead_costs} total={ev.costs} />
                    <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                      {[{ l:'Direct', v:ev.direct_costs, c:'#EF5350' }, { l:'Staff', v:ev.staff_costs, c:'#FFA726' }, { l:'OH', v:ev.overhead_costs, c:'#AB47BC' }].map((c, i) => (
                        <span key={i} style={{ fontSize: '10px', fontWeight: 600, color: c.c }}>{c.l} {fc(c.v)}</span>
                      ))}
                    </div>
                  </div>
                  {/* Achievement with donut */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F8FAFB', borderRadius: '8px', padding: '8px 12px' }}>
                    <Donut pct={ev.achievement} color={ev.achievement >= 80 ? '#4CAF50' : ev.achievement >= 50 ? '#FF9800' : '#F44336'} size={32} strokeW={3} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '10px', fontWeight: 700, color: '#8CA0B3', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Revenue Target</p>
                      <p style={{ fontSize: '14px', fontWeight: 900, color: '#0F1923', margin: 0 }}>{ev.achievement}%</p>
                    </div>
                    {ev.budget > 0 && <span style={{ fontSize: '11px', fontWeight: 600, color: '#5B7080' }}>of {fc(ev.budget)}</span>}
                  </div>
                </div>
              )
            })}
            {sorted.length === 0 && (
              <div style={{ gridColumn: '1 / -1', ...card, padding: '60px', textAlign: 'center', color: '#5B7080', fontSize: '14px' }}>No events found.</div>
            )}
          </div>
        )}

        {/* ── TABLE VIEW ── */}
        {view === 'table' && (
          <div style={{ ...card, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFB' }}>
                  {[
                    { k:'l', l:'', w:'30px', s:false },
                    { k:'name', l:'Event', w:'auto', s:true },
                    { k:'r', l:'Region / BU', w:'110px', s:false },
                    { k:'s', l:'Status', w:'85px', s:false },
                    { k:'revenue', l:'Revenue', w:'100px', s:true },
                    { k:'c', l:'Costs', w:'100px', s:false },
                    { k:'profit', l:'Profit', w:'100px', s:true },
                    { k:'margin', l:'Margin', w:'65px', s:true },
                    { k:'a', l:'Target', w:'100px', s:false },
                  ].map(col => (
                    <th key={col.k} style={{
                      padding: '10px 12px', fontSize: '10px', fontWeight: 800,
                      letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8CA0B3',
                      textAlign: col.k === 'name' ? 'left' : 'right', width: col.w,
                      cursor: col.s ? 'pointer' : 'default', borderBottom: '1px solid #E8EEF4',
                    }} onClick={() => col.s && doSort(col.k as 'name'|'revenue'|'profit'|'margin')}>
                      {col.l}{col.s && sortBy === col.k && <span style={{ color:'#00A5A3', marginLeft:'3px' }}>{sortDir==='asc'?'\u2191':'\u2193'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((ev, idx) => {
                  const sc = SC[ev.status] || SC.active
                  return (
                    <tr key={ev.id} onClick={() => window.location.href = `/admin/commercial/${ev.id}`}
                      style={{ borderBottom: idx < sorted.length-1 ? '1px solid #F0F4F8' : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', background:TL[ev.traffic_light], boxShadow:`0 0 6px ${TL[ev.traffic_light]}40` }} />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <p style={{ fontSize:'13px', fontWeight:700, color:'#0F1923', margin:0 }}>{ev.name}</p>
                        {ev.event_director && <p style={{ fontSize:'10px', color:'#8CA0B3', margin:'1px 0 0' }}>{ev.event_director}</p>}
                      </td>
                      <td style={{ padding:'10px 12px', textAlign:'right' }}>
                        <p style={{ fontSize:'11px', fontWeight:600, color:'#5B7080', margin:0 }}>{ev.region || '-'}</p>
                        <p style={{ fontSize:'10px', color:'#8CA0B3', margin:0 }}>{ev.business_unit || ''}</p>
                      </td>
                      <td style={{ padding:'10px 12px', textAlign:'right' }}>
                        <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'5px', background:sc.bg, color:sc.fg }}>{SL[ev.status]||ev.status}</span>
                      </td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', fontWeight:800, color:'#00897B', textAlign:'right', fontFamily:'Manrope, system-ui' }}>{fmt(ev.revenue, ev.currency)}</td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', fontWeight:700, color:'#D32F2F', textAlign:'right', fontFamily:'Manrope, system-ui' }}>{fmt(ev.costs, ev.currency)}</td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', fontWeight:800, textAlign:'right', fontFamily:'Manrope, system-ui', color:ev.profit>=0?'#2E7D32':'#D32F2F' }}>{fmt(ev.profit, ev.currency)}</td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', fontWeight:800, textAlign:'right', color:ev.margin>=20?'#2E7D32':ev.margin>=10?'#E65100':'#D32F2F' }}>{ev.margin}%</td>
                      <td style={{ padding:'10px 12px', textAlign:'right' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'6px' }}>
                          <Donut pct={ev.achievement} color={ev.achievement>=80?'#4CAF50':ev.achievement>=50?'#FF9800':'#F44336'} size={22} strokeW={2.5} />
                          <span style={{ fontSize:'11px', fontWeight:800, color:'#0F1923' }}>{ev.achievement}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {sorted.length === 0 && (
                  <tr><td colSpan={9} style={{ padding:'40px', textAlign:'center', color:'#8CA0B3', fontSize:'13px' }}>No events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}

/* ── Shared Styles ── */
const card: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}
const kpiLabel: React.CSSProperties = {
  fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8CA0B3', margin: 0,
}
