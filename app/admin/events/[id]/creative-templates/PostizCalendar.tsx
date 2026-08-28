'use client'

import { useState, useMemo } from 'react'

/* Calendar for "other posts already scheduled on these channels"
   (2026-08-27/28, per Madhu — a flat per-channel list "isn't practical or
   visually good," wanted something closer to Postiz's own Calendar view,
   iterated twice against live screenshots of the real Postiz UI).

   Renamed from PostizWeekCalendar.tsx (2026-08-28) — no longer week-only.

   Real fixes from the second round of feedback, in order:

   1. Stable per-platform color/icon, not an index into whatever subset of
      posts happened to be loaded. The old CHANNEL_COLORS array assigned
      color-by-array-index over the CURRENTLY VISIBLE posts — since
      toggling a channel checkbox changes which posts are fetched, the
      SAME real post visibly changed color every time another channel got
      checked, which read as "overlapping/inconsistent" even though
      nothing was actually overlapping yet. Fixed by keying color/icon off
      channel_identifier (the actual platform type, now returned by
      /api/events/postiz-scheduled) instead of array position.

   2. Real overlap when 2+ posts land in the same hour — the old layout
      absolute-positioned every chip by continuous top-offset within a
      FIXED row height, so same-hour posts rendered on top of each other.
      Rebuilt on a real CSS grid: posts are bucketed per (day, hour), and
      gridTemplateRows is computed per hour so a busy hour's row grows
      tall enough to stack every post in it (matches Postiz's own
      behavior — busy rows grow, empty rows stay compact) while every
      column shares the same row boundaries automatically (a CSS grid
      property, not manual pixel math).

   3. Each chip shows the channel's actual icon (Postiz's own picture URL,
      falling back to a platform initial) plus a truncated content
      preview, not just a time + channel name.

   4. Day / Week / Month view switcher, Week the default — Month is
      intentionally simpler than Postiz's own (a compact 1-2-chip-plus-
      "+N more" per day cell, not full-size cards) to stay reasonable
      inside an embedded panel; clicking a date in Month view drills into
      Day view for that date rather than picking a slot directly.

   Known boundary: the underlying fetch (postiz-scheduled/route.ts) is a
   fixed "now -14d to +90d" window, not a live re-fetch per navigated
   range — Month/Day navigation outside that window will just show empty
   rather than actually querying further out. Not rebuilt in this pass. */

export type ScheduledPost = {
  id: string; channel_id: string; channel_name: string
  channel_identifier: string; channel_picture: string | null
  state: string; publish_date: string | null; content_preview: string
}

type ViewMode = 'day' | 'week' | 'month'

const START_HOUR = 6
const END_HOUR = 23
const VISIBLE_HOURS = END_HOUR - START_HOUR + 1
const BASE_ROW_HEIGHT = 34 // px, empty-hour row height
const CHIP_HEIGHT = 28
const CHIP_GAP = 3

const PLATFORM_COLOR: Record<string, string> = {
  x: 'var(--ink2)', linkedin: 'var(--teal-mid)', 'linkedin-page': 'var(--teal-mid)',
  instagram: 'var(--purple)', youtube: 'var(--red)',
}
const PLATFORM_INITIAL: Record<string, string> = {
  x: '𝕏', linkedin: 'in', 'linkedin-page': 'in', instagram: 'IG', youtube: '▶',
}
const PLATFORM_LABEL: Record<string, string> = {
  x: 'X', linkedin: 'LinkedIn', 'linkedin-page': 'LinkedIn Page', instagram: 'Instagram', youtube: 'YouTube',
}

function startOfDay(d: Date): Date { const c = new Date(d); c.setHours(0, 0, 0, 0); return c }
function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day // Monday-start week
  const out = startOfDay(d)
  out.setDate(out.getDate() + diff)
  return out
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function toLocalDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ChannelIcon({ post, size }: { post: ScheduledPost; size: number }) {
  if (post.channel_picture) {
    return <img src={post.channel_picture} alt="" style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <span style={{
      width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'color-mix(in srgb, white 30%, transparent)', color: 'white', fontSize: `${Math.max(8, size - 12)}px`, fontWeight: 800,
    }}>
      {PLATFORM_INITIAL[post.channel_identifier] ?? post.channel_name.slice(0, 1)}
    </span>
  )
}

function Chip({ post, height }: { post: ScheduledPost; height: number }) {
  const dt = new Date(post.publish_date!)
  const color = PLATFORM_COLOR[post.channel_identifier] ?? 'var(--teal-mid)'
  return (
    <div title={`${dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${PLATFORM_LABEL[post.channel_identifier] ?? post.channel_name} · ${post.content_preview}`}
      style={{
        height: `${height}px`, display: 'flex', alignItems: 'center', gap: '5px', background: color, borderRadius: '5px', padding: '0 6px',
        fontSize: '9.5px', color: 'white', fontWeight: 700, overflow: 'hidden', cursor: 'default', flexShrink: 0,
      }}>
      <ChannelIcon post={post} size={16} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {post.content_preview}
      </span>
    </div>
  )
}

type Props = {
  posts: ScheduledPost[]
  loading: boolean
  anchorDate?: string
  onSlotClick?: (localDateTimeValue: string) => void
}

export default function PostizCalendar({ posts, loading, anchorDate, onSlotClick }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState(() => anchorDate ? new Date(anchorDate) : new Date())

  const postsByDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>()
    for (const p of posts) {
      if (!p.publish_date) continue
      const key = dateKey(new Date(p.publish_date))
      const list = map.get(key) ?? []
      list.push(p)
      map.set(key, list)
    }
    return map
  }, [posts])

  const today = new Date()
  const todayKey = dateKey(today)

  // Selected-slot highlight (2026-08-29, per Madhu — after picking a slot
  // the datetime shows at the bottom, but the calendar itself gave no
  // visual sign anything was picked, so it looked unselected until you
  // noticed the field below). Derived fresh from the live anchorDate PROP
  // every render, not from the internal `anchor` navigation state — so it
  // stays correct even if scheduleAt changes some other way (typed
  // directly into the datetime field) without needing this component to
  // know about it.
  const selectedDt = anchorDate ? new Date(anchorDate) : null
  const selectedKey = selectedDt && !isNaN(selectedDt.getTime()) ? `${dateKey(selectedDt)}T${selectedDt.getHours()}` : null

  function shift(dir: 1 | -1) {
    setAnchor(d => {
      const n = new Date(d)
      if (viewMode === 'day') n.setDate(n.getDate() + dir)
      else if (viewMode === 'week') n.setDate(n.getDate() + dir * 7)
      else n.setMonth(n.getMonth() + dir)
      return n
    })
  }
  function goToday() { setAnchor(new Date()) }

  // ---- Day / Week (shared hour-grid) ----
  if (viewMode === 'day' || viewMode === 'week') {
    const periodStart = viewMode === 'day' ? startOfDay(anchor) : startOfWeek(anchor)
    const dayCount = viewMode === 'day' ? 1 : 7
    const days = Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(periodStart)
      d.setDate(d.getDate() + i)
      return d
    })

    const bucketsByDay = days.map(d => {
      const dayPosts = postsByDay.get(dateKey(d)) ?? []
      const buckets: ScheduledPost[][] = Array.from({ length: VISIBLE_HOURS }, () => [])
      for (const p of dayPosts) {
        const dt = new Date(p.publish_date!)
        const hourIdx = Math.min(Math.max(dt.getHours() - START_HOUR, 0), VISIBLE_HOURS - 1)
        buckets[hourIdx].push(p)
      }
      return buckets
    })

    const rowHeights = Array.from({ length: VISIBLE_HOURS }, (_, i) => {
      const maxCount = Math.max(0, ...bucketsByDay.map(b => b[i].length))
      return maxCount === 0 ? BASE_ROW_HEIGHT : Math.max(BASE_ROW_HEIGHT, maxCount * (CHIP_HEIGHT + CHIP_GAP) + CHIP_GAP)
    })

    const rangeLabel = viewMode === 'day'
      ? days[0].toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      : `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`

    return (
      <div style={{ marginBottom: '14px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)', overflow: 'hidden' }}>
        <CalendarHeader loading={loading} count={posts.length} rangeLabel={rangeLabel} viewMode={viewMode} setViewMode={setViewMode} shift={shift} goToday={goToday} />

        <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${dayCount}, 1fr)` }}>
          <div />
          {days.map(d => {
            const key = dateKey(d)
            return (
              <div key={key} style={{ textAlign: 'center', padding: '6px 2px', borderLeft: '1px solid var(--border-light)', background: key === todayKey ? 'var(--teal-light)' : 'transparent' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase' }}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: key === todayKey ? 'var(--teal)' : 'var(--ink)' }}>{d.getDate()}</div>
              </div>
            )
          })}
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: `44px repeat(${dayCount}, 1fr)`,
          gridTemplateRows: rowHeights.map(h => `${h}px`).join(' '),
          maxHeight: '340px', overflowY: 'auto',
        }}>
          {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
            <div key={`h${i}`} style={{ gridColumn: 1, gridRow: i + 1, fontSize: '10px', color: 'var(--ink4)', textAlign: 'right', paddingRight: '6px', boxSizing: 'border-box', borderTop: '1px solid var(--border-light)' }}>
              {(START_HOUR + i) % 24}:00
            </div>
          ))}
          {days.map((d, dayIdx) => bucketsByDay[dayIdx].map((bucket, hourIdx) => {
            const hour = START_HOUR + hourIdx
            const slotDate = new Date(d)
            slotDate.setHours(hour, 0, 0, 0)
            const empty = bucket.length === 0
            const selected = selectedKey === `${dateKey(d)}T${hour}`
            return (
              <div key={`${dayIdx}-${hourIdx}`} style={{
                gridColumn: dayIdx + 2, gridRow: hourIdx + 1, position: 'relative', boxSizing: 'border-box',
                borderTop: selected ? '2px solid var(--teal-mid)' : '1px solid var(--border-light)',
                borderLeft: selected ? '2px solid var(--teal-mid)' : '1px solid var(--border-light)',
                borderRight: selected ? '2px solid var(--teal-mid)' : 'none',
                borderBottom: selected ? '2px solid var(--teal-mid)' : 'none',
                background: selected ? 'var(--teal-light)' : 'transparent',
              }}>
                {empty && onSlotClick ? (
                  <button type="button" className="postiz-cal-slot"
                    onClick={() => onSlotClick(toLocalDateTimeValue(slotDate))}
                    title={selected ? 'Selected' : `Pick ${slotDate.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}
                    style={{ display: 'block', width: '100%', height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, position: 'relative' }}>
                    <span className="postiz-cal-plus" style={{ opacity: selected ? 1 : 0, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: 'var(--teal-mid)', pointerEvents: 'none' }}>+</span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: `${CHIP_GAP}px`, padding: `${CHIP_GAP}px 2px` }}>
                    {bucket.map(p => <Chip key={p.id} post={p} height={CHIP_HEIGHT} />)}
                  </div>
                )}
              </div>
            )
          }))}
        </div>
        {onSlotClick && <style>{'.postiz-cal-slot:hover .postiz-cal-plus { opacity: 1 !important; }'}</style>}
      </div>
    )
  }

  // ---- Month ----
  const monthStart = startOfMonth(anchor)
  const gridStart = startOfWeek(monthStart)
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(d.getDate() + w * 7 + i)
    return d
  }))
  const rangeLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const MAX_CHIPS_PER_CELL = 2

  return (
    <div style={{ marginBottom: '14px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)', overflow: 'hidden' }}>
      <CalendarHeader loading={loading} count={posts.length} rangeLabel={rangeLabel} viewMode={viewMode} setViewMode={setViewMode} shift={shift} goToday={goToday} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {weeks[0].map(d => (
          <div key={d.getDay()} style={{ textAlign: 'center', padding: '5px 2px', fontSize: '10.5px', fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)' }}>
            {d.toLocaleDateString(undefined, { weekday: 'short' })}
          </div>
        ))}
        {weeks.flatMap((week, wIdx) => week.map((d, dIdx) => {
          const key = dateKey(d)
          const dayPosts = postsByDay.get(key) ?? []
          const inMonth = d.getMonth() === monthStart.getMonth()
          return (
            <button key={key} type="button" onClick={() => { setAnchor(d); setViewMode('day') }}
              style={{
                textAlign: 'left', minHeight: '76px', padding: '4px', border: 'none', cursor: 'pointer', font: 'inherit',
                borderTop: wIdx === 0 ? 'none' : '1px solid var(--border-light)', borderLeft: dIdx === 0 ? 'none' : '1px solid var(--border-light)',
                background: key === todayKey ? 'var(--teal-light)' : 'transparent', opacity: inMonth ? 1 : 0.4,
                display: 'flex', flexDirection: 'column', gap: '3px',
              }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: key === todayKey ? 'var(--teal)' : 'var(--ink2)' }}>{d.getDate()}</span>
              {dayPosts.slice(0, MAX_CHIPS_PER_CELL).map(p => <Chip key={p.id} post={p} height={CHIP_HEIGHT} />)}
              {dayPosts.length > MAX_CHIPS_PER_CELL && (
                <span style={{ fontSize: '9px', color: 'var(--ink4)', fontWeight: 700 }}>+{dayPosts.length - MAX_CHIPS_PER_CELL} more</span>
              )}
            </button>
          )
        }))}
      </div>
    </div>
  )
}

function CalendarHeader({ loading, count, rangeLabel, viewMode, setViewMode, shift, goToday }: {
  loading: boolean; count: number; rangeLabel: string; viewMode: ViewMode
  setViewMode: (m: ViewMode) => void; shift: (dir: 1 | -1) => void; goToday: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)' }}>
        {loading
          ? 'Checking what else is scheduled on these channels…'
          : count === 0
            ? 'Nothing else scheduled on these channels right now'
            : `Already scheduled on these channels (${count})`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
          {(['day', 'week', 'month'] as ViewMode[]).map(m => (
            <button key={m} type="button" onClick={() => setViewMode(m)}
              style={{
                padding: '4px 9px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 700, textTransform: 'capitalize',
                background: viewMode === m ? 'var(--teal-mid)' : 'var(--surface)', color: viewMode === m ? 'white' : 'var(--ink2)',
              }}>
              {m}
            </button>
          ))}
        </div>
        <button onClick={() => shift(-1)}
          style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer', fontSize: '13px' }}>‹</button>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', minWidth: '150px', textAlign: 'center' }}>{rangeLabel}</span>
        <button onClick={() => shift(1)}
          style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer', fontSize: '13px' }}>›</button>
        <button onClick={goToday}
          style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700 }}>Today</button>
      </div>
    </div>
  )
}
