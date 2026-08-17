'use client'

import { useState, useEffect } from 'react'
import { Card, Badge } from '@/app/components/ui'

type Announcement = {
  id: string; stakeholder_type: 'speaker' | 'partner'; stakeholder_name: string | null
  post_copy: string | null; creative_url: string | null; status: string
  scheduled_for: string | null; platforms: string[] | null
  announcement_kind: 'org_promo' | 'self_promo'
}

const DOT_COLOR: Record<string, string> = { speaker: 'var(--indigo)', partner: 'var(--amber)' }

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function CalendarView({ eventId }: { eventId: string }) {
  const now = new Date()
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth()) // 0-indexed
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Announcement | null>(null)

  useEffect(() => {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-dependency-change; same pattern already used elsewhere in this page's own effects
    setLoading(true)
    fetch(`/api/events/stakeholders/announcements?event_id=${eventId}&month=${monthStr}`)
      .then(r => r.json())
      .then(data => setAnnouncements(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [eventId, year, month])

  const byDay = new Map<number, Announcement[]>()
  for (const a of announcements) {
    if (!a.scheduled_for) continue
    // Self Promo (2026-08-18) rows are emailed to the speaker, never
    // scheduled/posted on Trescon's own channels — the "send to speaker"
    // route never sets scheduled_for, so this should never actually fire.
    // Kept as a defensive filter rather than trusting that invariant holds
    // forever (a self_promo row shouldn't be able to leak onto the
    // calendar even if it somehow did get a scheduled_for set).
    if (a.announcement_kind === 'self_promo') continue
    const day = new Date(a.scheduled_for).getUTCDate()
    byDay.set(day, [...(byDay.get(day) ?? []), a])
  }

  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7 // Monday-first grid

  const scheduledDays = new Set(byDay.keys())
  let nextAvailable: Date | null = null
  for (let d = new Date(); d.getTime() < new Date(Date.UTC(year, month + 2, 0)).getTime(); d.setDate(d.getDate() + 1)) {
    const sameMonth = d.getUTCFullYear() === year && d.getUTCMonth() === month
    if (sameMonth && !scheduledDays.has(d.getUTCDate())) { nextAvailable = new Date(d); break }
    if (!sameMonth && d.getUTCMonth() !== month) break
  }

  function goMonth(delta: number) {
    const next = new Date(Date.UTC(year, month + delta, 1))
    setYear(next.getUTCFullYear())
    setMonth(next.getUTCMonth())
  }

  return (
    <Card padded>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => goMonth(-1)} style={navBtnStyle}>‹</button>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', minWidth: '160px', textAlign: 'center' }}>{monthLabel(year, month)}</div>
          <button onClick={() => goMonth(1)} style={navBtnStyle}>›</button>
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--ink3)' }}>
          <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: DOT_COLOR.speaker, marginRight: '5px' }} />Speaker</span>
          <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: DOT_COLOR.partner, marginRight: '5px' }} />Partner</span>
        </div>
      </div>

      {nextAvailable && (
        <div style={{ fontSize: '12px', color: 'var(--teal-mid)', marginBottom: '12px' }}>
          Next available day: {nextAvailable.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', fontSize: '10px', fontWeight: 800, color: 'var(--ink4)', marginBottom: '6px', textTransform: 'uppercase' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} style={{ textAlign: 'center' }}>{d}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', opacity: loading ? 0.5 : 1 }}>
        {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const items = byDay.get(day) ?? []
          return (
            <div key={day} style={{ minHeight: '54px', borderRadius: '8px', border: '1px solid var(--border-light)', padding: '6px', background: 'var(--surface)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '4px' }}>{day}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {items.map(a => (
                  <button key={a.id} onClick={() => setSelected(a)} title={a.stakeholder_name ?? ''}
                    style={{ width: '8px', height: '8px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: DOT_COLOR[a.stakeholder_type] }} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 50%, transparent)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '380px', maxWidth: '90%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{selected.stakeholder_name ?? '—'}</div>
              <Badge color={selected.status === 'published' ? 'teal' : selected.status === 'failed' ? 'red' : 'amber'}>{selected.status}</Badge>
            </div>
            {selected.creative_url && <img src={selected.creative_url} alt="" style={{ width: '100%', borderRadius: '8px', marginBottom: '10px' }} />}
            <div style={{ fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: '10px' }}>{selected.post_copy}</div>
            {selected.platforms && <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>Platforms: {selected.platforms.join(', ')}</div>}
            {selected.scheduled_for && <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{new Date(selected.scheduled_for).toLocaleString()}</div>}
            <button onClick={() => setSelected(null)} style={{ marginTop: '14px', padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
          </div>
        </div>
      )}
    </Card>
  )
}

const navBtnStyle: React.CSSProperties = {
  width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--ink2)', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit',
}
