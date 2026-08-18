'use client'
/**
 * Lightweight hand-rolled SVG charts — EventPilot has no charting library
 * installed anywhere, so these are built by hand (a few dozen lines each)
 * rather than adding a new dependency for two small charts, matching the
 * app's existing "no new dependencies, thin wrapper components" approach.
 */

const BAR_COLOR = 'var(--indigo)'

export function WorkloadBarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return <div style={{ fontSize: '12px', color: 'var(--ink4)', padding: '8px 0' }}>No open tasks to chart.</div>
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {data.map(d => (
        <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--ink2)', fontWeight: 600, width: '140px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.label}
          </span>
          <div style={{ flex: 1, background: 'var(--border-light)', borderRadius: '6px', height: '18px', position: 'relative' }}>
            <div style={{ height: '100%', width: `${(d.value / max) * 100}%`, minWidth: '4px', background: BAR_COLOR, borderRadius: '6px', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)', width: '24px', textAlign: 'right', flexShrink: 0 }}>{d.value}</span>
        </div>
      ))}
    </div>
  )
}

const DONUT_COLORS = ['var(--teal-mid)', 'var(--indigo)', 'var(--purple)', 'var(--amber)', 'var(--red)', 'var(--lime)']

export function CategoryDonutChart({ data }: { data: { label: string; seconds: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.seconds, 0)
  if (total === 0) return <div style={{ fontSize: '12px', color: 'var(--ink4)', padding: '8px 0' }}>No tracked time to chart yet.</div>

  const radius = 15.9155 // circumference ≈ 100, so each % of total maps directly to a dasharray unit
  const segments = data.filter(d => d.seconds > 0).reduce<Array<{ label: string; seconds: number; pct: number; offset: number; color: string }>>((acc, d) => {
    const pct = (d.seconds / total) * 100
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].pct : 0
    acc.push({ ...d, pct, offset, color: DONUT_COLORS[acc.length % DONUT_COLORS.length] })
    return acc
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
      <svg width="120" height="120" viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
        <circle cx="20" cy="20" r={radius} fill="transparent" stroke="var(--border-light)" strokeWidth="6" />
        {segments.map(s => (
          <circle
            key={s.label}
            cx="20" cy="20" r={radius}
            fill="transparent"
            stroke={s.color}
            strokeWidth="6"
            strokeDasharray={`${s.pct} ${100 - s.pct}`}
            strokeDashoffset={-s.offset}
            transform="rotate(-90 20 20)"
          />
        ))}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>{s.label}</span>
            <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>{Math.round(s.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
