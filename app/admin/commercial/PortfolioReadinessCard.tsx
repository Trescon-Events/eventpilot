'use client'

import { useCallback, useEffect, useState } from 'react'

/*
  Portfolio P&L Readiness card.
  Rendered as the FIRST card on the portfolio dashboard, above the KPI strip.
  Reads from /api/events/commercial/readiness (no event_id).

  Bucket tiles are clickable — clicking one calls onBucketFilter(bucket)
  so the parent can filter its event list. Passing null (or clicking the
  same bucket again) clears the filter.
*/

type Bucket = 'ready' | 'partial' | 'high_risk'
type Owner = 'Sales' | 'Finance' | 'HR' | 'Ops'

interface PortfolioReadiness {
  scope: 'portfolio'
  event_count: number
  buckets: {
    ready:     { count: number; event_ids: string[] }
    partial:   { count: number; event_ids: string[] }
    high_risk: { count: number; event_ids: string[] }
  }
  overall_score_pct: number
  gaps_by_owner: Record<Owner, number>
  top_5_worst: Array<{ event_id: string; event_name: string; score_pct: number }>
  updated_at: string
}

const BUCKET_COLOR: Record<Bucket, { bg: string; fg: string; label: string }> = {
  ready:     { bg: 'rgba(46,125,50,0.10)',  fg: '#2E7D32', label: 'Ready' },
  partial:   { bg: 'rgba(245,127,23,0.10)', fg: '#F57F17', label: 'Partial' },
  high_risk: { bg: 'rgba(198,40,40,0.10)',  fg: '#C62828', label: 'High risk' },
}

function statusBucketForScore(pct: number): Bucket {
  if (pct >= 95) return 'ready'
  if (pct >= 60) return 'partial'
  return 'high_risk'
}

export default function PortfolioReadinessCard({
  onBucketFilter,
  activeBucket,
}: {
  onBucketFilter?: (bucket: Bucket | null, event_ids: string[]) => void
  activeBucket?: Bucket | null
}) {
  const [data, setData] = useState<PortfolioReadiness | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/events/commercial/readiness')
      .then(r => r.json())
      .then(d => { if (d && d.buckets) setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #DDE8EE',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }

  if (loading || !data) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '17px', fontWeight: 800, color: '#0F1923' }}>Portfolio P&amp;L Readiness</span>
          <span style={{ fontSize: '11px', color: '#5B7080' }}>Loading&hellip;</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: '52px', background: '#F0F4F8', borderRadius: '8px' }} />
          ))}
        </div>
      </div>
    )
  }

  const scoreBucket = statusBucketForScore(data.overall_score_pct)
  const scoreColor = BUCKET_COLOR[scoreBucket].fg

  const buckets: Array<{ key: Bucket; count: number }> = [
    { key: 'ready',     count: data.buckets.ready.count     },
    { key: 'partial',   count: data.buckets.partial.count   },
    { key: 'high_risk', count: data.buckets.high_risk.count },
  ]

  const ownerOrder: Owner[] = ['Finance', 'Sales', 'HR', 'Ops']
  const ownerRows = ownerOrder
    .map(o => ({ owner: o, count: data.gaps_by_owner[o] || 0 }))
    .filter(r => r.count > 0)

  return (
    <div style={cardStyle}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#0F1923' }}>Portfolio P&amp;L Readiness</span>
          <span style={{
            fontSize: '14px', fontWeight: 800, color: scoreColor,
            padding: '2px 10px', borderRadius: '10px',
            background: `${scoreColor}14`,
          }}>
            {data.overall_score_pct}% &middot; {data.event_count} event{data.event_count === 1 ? '' : 's'}
          </span>
        </div>
        <button
          onClick={load}
          style={{
            fontSize: '11px', fontWeight: 700, color: '#00695C', background: 'transparent',
            border: '1px solid #DDE8EE', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Refresh
        </button>
      </div>

      {/* ── Progress bar ── */}
      <div style={{
        height: '6px', background: '#E8EEF4', borderRadius: '3px',
        overflow: 'hidden', marginBottom: '16px',
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, data.overall_score_pct))}%`,
          height: '100%', background: scoreColor, transition: 'width 0.4s ease',
        }} />
      </div>

      {/* ── Bucket tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        {buckets.map(b => {
          const c = BUCKET_COLOR[b.key]
          const active = activeBucket === b.key
          return (
            <button
              key={b.key}
              onClick={() => onBucketFilter && onBucketFilter(
                active ? null : b.key,
                active ? [] : data.buckets[b.key].event_ids,
              )}
              style={{
                background: c.bg, color: c.fg, border: active ? `2px solid ${c.fg}` : `1px solid ${c.fg}33`,
                padding: '12px 14px', borderRadius: '10px', cursor: onBucketFilter ? 'pointer' : 'default',
                textAlign: 'left', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
                {c.label}
              </span>
              <span style={{ fontSize: '22px', fontWeight: 900, fontFamily: 'Manrope, system-ui' }}>
                {b.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Gaps by owner ── */}
      {ownerRows.length > 0 && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{
            fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
            color: '#5B7080', margin: '0 0 8px',
          }}>
            Gaps by owner
          </p>
          <div>
            {ownerRows.map((r, i) => (
              <div key={r.owner} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: i < ownerRows.length - 1 ? '1px solid #F0F4F8' : 'none',
              }}>
                <span style={{ fontSize: '13px', color: '#0F1923', fontWeight: 600 }}>{r.owner}</span>
                <span style={{ fontSize: '13px', color: '#5B7080' }}>
                  {r.count} open item{r.count === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Worst 5 events ── */}
      {data.top_5_worst.length > 0 && (
        <div>
          <p style={{
            fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
            color: '#5B7080', margin: '0 0 8px',
          }}>
            Worst {data.top_5_worst.length} event{data.top_5_worst.length === 1 ? '' : 's'} dragging the portfolio
          </p>
          <div>
            {data.top_5_worst.map((e, i) => {
              const b = statusBucketForScore(e.score_pct)
              const c = BUCKET_COLOR[b].fg
              return (
                <div key={e.event_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 0', borderBottom: i < data.top_5_worst.length - 1 ? '1px solid #F0F4F8' : 'none',
                }}>
                  <a
                    href={`/admin/commercial/${e.event_id}`}
                    style={{
                      fontSize: '13px', color: '#0F1923', fontWeight: 600, textDecoration: 'none',
                      flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {e.event_name}
                  </a>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: c, marginLeft: '10px' }}>
                    {e.score_pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
