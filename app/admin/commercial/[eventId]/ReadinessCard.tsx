'use client'

import { useCallback, useEffect, useState } from 'react'

/*
  Per-event P&L Readiness card.
  Renders as the first card inside the per-event commercial workspace,
  above the KPI strip. Reads from /api/events/commercial/readiness?event_id={id}.
*/

type CheckStatus = 'ok' | 'partial' | 'missing'
type Owner = 'Sales' | 'Finance' | 'HR' | 'Ops'
type EventStatus = 'ready' | 'partial' | 'high_risk'

interface Check {
  key: string
  label: string
  status: CheckStatus
  detail: string
  owner: Owner
  fix_url: string | null
  weight: number
}

interface Readiness {
  event_id: string
  event_name: string
  score_pct: number
  status: EventStatus
  checks: Check[]
  updated_at: string
}

const STATUS_COLOR: Record<EventStatus, string> = {
  ready: 'var(--success)',
  partial: 'var(--amber)',
  high_risk: 'var(--red)',
}

// Companion "-light" tint for each STATUS_COLOR entry — used as the score badge's
// background instead of computing a translucent wash via string-alpha concatenation
// (which doesn't work once the color is a css var reference).
const STATUS_BG: Record<EventStatus, string> = {
  ready: 'var(--success-light)',
  partial: 'var(--amber-light)',
  high_risk: 'var(--red-light)',
}

const STATUS_LABEL: Record<EventStatus, string> = {
  ready: 'Ready',
  partial: 'Partial',
  high_risk: 'High risk',
}

const CHECK_COLOR: Record<CheckStatus, string> = {
  ok: 'var(--success)',
  partial: 'var(--amber)',
  missing: 'var(--red)',
}

const CHECK_ICON: Record<CheckStatus, string> = {
  ok: '✓',       // check
  partial: '⚠',  // warning
  missing: '✗',  // cross
}

export default function ReadinessCard({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Readiness | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/events/commercial/readiness?event_id=${eventId}`)
      .then(r => r.json())
      .then(d => { if (d && d.checks) setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [eventId])

  useEffect(() => { if (eventId) load() }, [eventId, load])

  const cardStyle: React.CSSProperties = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }

  if (loading || !data) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>P&amp;L Readiness</span>
          <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>Loading&hellip;</span>
        </div>
        <div style={{ height: '6px', background: 'var(--surface)', borderRadius: '3px', marginBottom: '14px' }} />
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ height: '14px', background: 'var(--surface)', borderRadius: '3px', marginBottom: '10px', opacity: 0.6 - i * 0.06 }} />
        ))}
      </div>
    )
  }

  const color = STATUS_COLOR[data.status]
  const bg = STATUS_BG[data.status]

  return (
    <div style={cardStyle}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>P&amp;L Readiness</span>
          <span style={{
            fontSize: '14px', fontWeight: 800, color, padding: '2px 10px', borderRadius: '10px',
            background: bg,
          }}>
            {data.score_pct}% &middot; {STATUS_LABEL[data.status]}
          </span>
        </div>
        <button
          onClick={load}
          style={{
            fontSize: '11px', fontWeight: 700, color: 'var(--teal)', background: 'transparent',
            border: '1px solid var(--border)', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Refresh
        </button>
      </div>

      {/* ── Progress bar ── */}
      <div style={{
        height: '6px', background: 'var(--surface)', borderRadius: '3px',
        overflow: 'hidden', marginBottom: '16px',
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, data.score_pct))}%`,
          height: '100%', background: color, transition: 'width 0.4s ease',
        }} />
      </div>

      {/* ── Check rows ── */}
      <div>
        {data.checks.map((c, i) => (
          <div key={c.key} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0',
            borderBottom: i < data.checks.length - 1 ? '1px solid var(--surface)' : 'none',
          }}>
            <span style={{
              fontSize: '15px', fontWeight: 900, color: CHECK_COLOR[c.status],
              width: '18px', textAlign: 'center', flexShrink: 0,
            }}>
              {CHECK_ICON[c.status]}
            </span>
            <span style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600, flexShrink: 0 }}>
              {c.label}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--ink3)', flex: 1, textAlign: 'right' }}>
              {c.detail}
            </span>
            <span style={{
              fontSize: '10px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase',
              color: 'var(--ink3)', background: 'var(--surface)', padding: '3px 8px', borderRadius: '10px',
              flexShrink: 0,
            }}>
              {c.owner}
            </span>
            {c.status !== 'ok' && c.fix_url && (
              <a
                href={c.fix_url}
                style={{
                  fontSize: '12px', fontWeight: 700, color: 'var(--teal)', textDecoration: 'none',
                  flexShrink: 0, minWidth: '30px', textAlign: 'right',
                }}
              >
                Fix &rarr;
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
