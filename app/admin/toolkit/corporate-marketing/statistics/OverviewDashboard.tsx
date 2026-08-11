'use client'

/*
  Overview Dashboard — CMOS 2.1 spec §3.
  Reads /api/corporate-marketing/statistics/dashboard.
*/

import { useCallback, useEffect, useState } from 'react'

const BRAND = '#F1667A'

type TabId = 'overview' | 'company' | 'event_series' | 'event' | 'recent' | 'dependencies' | 'settings'

type DashboardData = {
  counts: {
    total_company_stats:      number
    total_event_series_stats: number
    total_event_stats:        number
    recently_updated:         number
    pending_approval:         number
    outdated_statistics:      number
    used_in_corporate_deck:   number
  }
  last_updated: string | null
  recent_activity: Array<{
    id: string
    changed_at: string
    reason: string | null
    old_value: string | null
    new_value: string | null
    status_after: string | null
    changer:  { id: string; name: string } | null
    statistic:{ id: string; name: string; scope: string } | null
  }>
}

export default function OverviewDashboard({ onJumpToTab }: { onJumpToTab: (t: TabId) => void }) {
  const [data, setData]   = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/corporate-marketing/statistics/dashboard', { cache: 'no-store' })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      setData(await r.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <SkeletonGrid />
  if (error)   return <ErrorBox>{error}</ErrorBox>
  if (!data)   return null

  const c = data.counts
  const cards: Array<{ label: string; value: number; hint?: string; jump?: TabId; accent?: string }> = [
    { label: 'Company Statistics',      value: c.total_company_stats,      jump: 'company' },
    { label: 'Event Series Statistics', value: c.total_event_series_stats, jump: 'event_series' },
    { label: 'Event Statistics',        value: c.total_event_stats,        jump: 'event' },
    { label: 'Recently Updated',        value: c.recently_updated,         hint: 'last 7 days',  jump: 'recent' },
    { label: 'Pending Approval',        value: c.pending_approval,         hint: 'awaiting admin', accent: c.pending_approval > 0 ? '#F5B94D' : undefined },
    { label: 'Outdated',                value: c.outdated_statistics,      hint: 'approved > 90d ago', accent: c.outdated_statistics > 0 ? BRAND : undefined },
    { label: 'Used in Corporate Deck',  value: c.used_in_corporate_deck,   hint: 'dependency links', jump: 'dependencies' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '14px',
      }}>
        {cards.map(card => (
          <MetricCard key={card.label} card={card} onJump={onJumpToTab} />
        ))}
      </div>

      {/* Last-updated strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '12px', color: 'var(--ink4)',
      }}>
        <span style={{ fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Last change</span>
        <span>{data.last_updated ? fmtWhen(data.last_updated) : 'no changes yet'}</span>
      </div>

      {/* Recent activity */}
      <section style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Recent Activity
          </div>
          <button
            onClick={() => onJumpToTab('recent')}
            style={{
              fontSize: '11px', fontWeight: 700, color: BRAND,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            View all →
          </button>
        </div>
        {data.recent_activity.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)', fontStyle: 'italic', padding: '12px 0' }}>
            No activity yet. Once someone updates a statistic, it appears here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.recent_activity.map(row => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function MetricCard({ card, onJump }: {
  card: { label: string; value: number; hint?: string; jump?: TabId; accent?: string }
  onJump: (t: TabId) => void
}) {
  const clickable = !!card.jump
  return (
    <div
      onClick={() => card.jump && onJump(card.jump)}
      style={{
        background: 'var(--card)',
        border: `1px solid ${card.accent ?? 'var(--border)'}`,
        borderRadius: '14px',
        padding: '16px 18px',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = 'var(--card-hi)' }}
      onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = 'var(--card)' }}
    >
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {card.label}
      </div>
      <div style={{ fontSize: '30px', fontWeight: 900, color: card.accent ?? 'var(--ink)', letterSpacing: '-0.5px', marginTop: '4px', lineHeight: 1 }}>
        {card.value}
      </div>
      {card.hint && (
        <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '4px' }}>{card.hint}</div>
      )}
    </div>
  )
}

function ActivityRow({ row }: { row: DashboardData['recent_activity'][number] }) {
  const stat = row.statistic
  const who  = row.changer?.name ?? 'Someone'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '18px 1fr auto',
      gap: '10px', padding: '10px 12px',
      background: 'var(--surface)',
      borderRadius: '10px', border: '1px solid var(--border)',
      fontSize: '13px', color: 'var(--ink)', lineHeight: 1.45,
    }}>
      <div style={{ color: 'var(--success)', fontWeight: 900 }}>✓</div>
      <div>
        <strong style={{ fontWeight: 800 }}>{stat?.name ?? 'Statistic'}</strong>
        <span style={{ color: 'var(--ink3)' }}> — {row.reason ?? 'updated'}</span>
        {row.old_value != null && row.new_value != null && row.old_value !== row.new_value && (
          <span style={{ color: 'var(--ink4)', marginLeft: '8px' }}>
            (<code style={{ background: 'var(--border-light)', padding: '1px 5px', borderRadius: '3px' }}>{row.old_value || '∅'}</code>
            {' → '}
            <code style={{ background: 'var(--border-light)', padding: '1px 5px', borderRadius: '3px' }}>{row.new_value || '∅'}</code>)
          </span>
        )}
        <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>{who} · {fmtWhen(row.changed_at)}</div>
      </div>
      {row.status_after && <StatusPill status={row.status_after} />}
    </div>
  )
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    draft:          { bg: 'var(--border-light)', fg: 'var(--ink3)',  label: 'Draft' },
    pending_review: { bg: '#F5B94D22',           fg: '#B87400',      label: 'Pending Review' },
    approved:       { bg: 'var(--success-light)', fg: 'var(--success)', label: 'Approved' },
    archived:       { bg: 'var(--ink4)22',       fg: 'var(--ink4)',  label: 'Archived' },
  }
  const s = map[status] ?? { bg: 'var(--border-light)', fg: 'var(--ink3)', label: status }
  return (
    <span style={{
      fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px',
      background: s.bg, color: s.fg, padding: '3px 8px', borderRadius: '10px',
      alignSelf: 'flex-start', whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 18px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', borderRadius: '10px', fontSize: '13px', fontWeight: 700 }}>
      {children}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: '14px',
    }}>
      {[...Array(7)].map((_, i) => (
        <div key={i} style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '20px', height: '90px',
        }} />
      ))}
    </div>
  )
}

function fmtWhen(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const min = Math.round((now - then) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.round(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
