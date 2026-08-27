'use client'

import { useState, useMemo } from 'react'

/* Week-view calendar for "other posts already scheduled on these channels"
   (2026-08-27, per Madhu — a flat per-channel list "isn't practical or
   visually good," wanted something closer to Postiz's own Calendar/Week
   view, see reference screenshot). A real hour-row grid with day columns,
   not just a stacked agenda list — event chips are positioned by actual
   time-of-day within each column, same spatial "is this day/hour free"
   read Postiz's own UI gives.

   Deliberately NOT a full 0-23h grid — an embedded panel inside the
   announcement detail view has nowhere near a full calendar page's height
   to work with, so the visible window is a fixed, scrollable 6am-11pm
   range (covers the overwhelming majority of real post times; anything
   outside it is still reachable by scrolling the grid, never hidden). */

export type ScheduledPost = {
  id: string; channel_id: string; channel_name: string; state: string
  publish_date: string | null; content_preview: string
}

const START_HOUR = 6
const END_HOUR = 23
const ROW_HEIGHT = 34 // px per hour
const VISIBLE_HOURS = END_HOUR - START_HOUR + 1

function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day // Monday-start week
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() + diff)
  return out
}

const CHANNEL_COLORS = ['var(--teal-mid)', 'var(--purple)', 'var(--amber)', 'var(--red)', 'var(--lime-dark)']

export default function PostizWeekCalendar({ posts, loading, anchorDate }: { posts: ScheduledPost[]; loading: boolean; anchorDate?: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(anchorDate ? new Date(anchorDate) : new Date()))

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  }), [weekStart])

  const channelColor = useMemo(() => {
    const ids = [...new Set(posts.map(p => p.channel_id))]
    return new Map(ids.map((id, i) => [id, CHANNEL_COLORS[i % CHANNEL_COLORS.length]]))
  }, [posts])

  const postsByDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>()
    for (const p of posts) {
      if (!p.publish_date) continue
      const key = p.publish_date.slice(0, 10)
      const list = map.get(key) ?? []
      list.push(p)
      map.set(key, list)
    }
    return map
  }, [posts])

  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const rangeLabel = `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div style={{ marginBottom: '14px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)' }}>
          {loading
            ? 'Checking what else is scheduled on these channels…'
            : posts.length === 0
              ? 'Nothing else scheduled on these channels right now'
              : `Already scheduled on these channels (${posts.length})`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer', fontSize: '13px' }}>‹</button>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', minWidth: '150px', textAlign: 'center' }}>{rangeLabel}</span>
          <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer', fontSize: '13px' }}>›</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700 }}>Today</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)' }}>
        <div /> {/* corner spacer */}
        {days.map(d => {
          const key = d.toISOString().slice(0, 10)
          return (
            <div key={key} style={{ textAlign: 'center', padding: '6px 2px', borderLeft: '1px solid var(--border-light)', background: key === todayKey ? 'var(--teal-light)' : 'transparent' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: key === todayKey ? 'var(--teal)' : 'var(--ink)' }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', maxHeight: '340px', overflowY: 'auto', position: 'relative' }}>
        {/* Hour labels column */}
        <div>
          {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
            <div key={i} style={{ height: `${ROW_HEIGHT}px`, fontSize: '10px', color: 'var(--ink4)', textAlign: 'right', paddingRight: '6px', boxSizing: 'border-box', borderTop: '1px solid var(--border-light)' }}>
              {(START_HOUR + i) % 24}:00
            </div>
          ))}
        </div>

        {days.map(d => {
          const key = d.toISOString().slice(0, 10)
          const dayPosts = postsByDay.get(key) ?? []
          return (
            <div key={key} style={{ position: 'relative', borderLeft: '1px solid var(--border-light)' }}>
              {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
                <div key={i} style={{ height: `${ROW_HEIGHT}px`, borderTop: '1px solid var(--border-light)' }} />
              ))}
              {dayPosts.map(p => {
                const dt = new Date(p.publish_date!)
                const hourFloat = dt.getHours() + dt.getMinutes() / 60
                const clamped = Math.min(Math.max(hourFloat, START_HOUR), END_HOUR + 1)
                const top = (clamped - START_HOUR) * ROW_HEIGHT
                return (
                  <div key={p.id} title={`${dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${p.channel_name} · ${p.content_preview}`}
                    style={{
                      position: 'absolute', top: `${top}px`, left: '2px', right: '2px', minHeight: `${ROW_HEIGHT - 4}px`,
                      background: channelColor.get(p.channel_id) ?? 'var(--teal-mid)', borderRadius: '4px', padding: '2px 5px',
                      fontSize: '9.5px', color: 'white', fontWeight: 700, overflow: 'hidden', cursor: 'default', lineHeight: 1.3,
                    }}>
                    {dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {p.channel_name}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
