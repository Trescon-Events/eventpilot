'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useNavData } from '@/app/lib/nav/NavDataContext'

/* "My Events" (2026-10-01) — every event the signed-in person has access to, nothing else. The
   sidebar's My Events link used to open the AI-learning dashboard (which needs a staff id in the URL
   and asked a producer for their work email instead). This page needs no id: it reads the session and
   the same RBAC-driven list the sidebar already loads (/api/events/access/my-events), so it works for
   every staff member — admins see all events, everyone else sees exactly the events they were given
   access to, whether or not they sit on that event's roster. */

type Umbrella = { id: string; name: string; status: string; event_date: string | null; client_name: string | null; href: string }

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null

export default function MyEventsPage() {
  const { session, eventsData } = useNavData()
  const [umbrellas, setUmbrellas] = useState<Umbrella[]>([])
  const [query, setQuery] = useState('')

  // Umbrellas (e.g. Dubai Future Finance Week) aren't events, so my-events doesn't list them; the
  // events API does, using the person's staff id. Best-effort — the event list never waits on it.
  useEffect(() => {
    if (!session?.sid) return
    fetch(`/api/events?staff_id=${encodeURIComponent(session.sid)}`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: Array<Umbrella & { kind?: string }>) => setUmbrellas(Array.isArray(list) ? list.filter(e => e.kind === 'umbrella') : []))
      .catch(() => setUmbrellas([]))
  }, [session?.sid])

  // Earliest event date first (the next event to happen leads); events without a date go last.
  const byDate = <T extends { event_date: string | null; name: string }>(a: T, b: T) => {
    if (a.event_date && b.event_date) return a.event_date.localeCompare(b.event_date) || a.name.localeCompare(b.name)
    if (a.event_date) return -1
    if (b.event_date) return 1
    return a.name.localeCompare(b.name)
  }
  const q = query.trim().toLowerCase()
  const matches = (name: string, extra: (string | null)[]) => !q || [name, ...extra].some(v => v?.toLowerCase().includes(q))
  const allEvents = [...(eventsData?.events ?? [])].sort(byDate)
  const allUmbrellas = [...umbrellas].sort(byDate)
  const events = allEvents.filter(e => matches(e.name, [e.city, e.status]))
  const shownUmbrellas = allUmbrellas.filter(u => matches(u.name, [u.client_name, u.status]))
  // One list, umbrellas and events together, earliest date first.
  const rows = [
    ...shownUmbrellas.map(u => ({ kind: 'umbrella' as const, u, event_date: u.event_date, name: u.name })),
    ...events.map(ev => ({ kind: 'event' as const, ev, event_date: ev.event_date, name: ev.name })),
  ].sort(byDate)

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' } as const
  const openBtn = { padding: '8px 16px', borderRadius: '16px', border: '1px solid var(--teal-border)', background: 'var(--teal)', color: 'var(--card)', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none' } as const
  const pill = (active: boolean) => ({ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: active ? 'var(--teal-light)' : 'var(--surface2)', color: active ? 'var(--teal)' : 'var(--ink2)' }) as const

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>My Events</h1>
      <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '22px' }}>The events you have access to.</div>

      {allEvents.length + allUmbrellas.length > 0 && (
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events by name, city or status…" autoFocus
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: '16px', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
        />
      )}

      {eventsData === null ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
      ) : allEvents.length === 0 && allUmbrellas.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink2)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px' }}>
          No events assigned to you yet. If you think this is wrong, check with your manager or admin.
        </div>
      ) : events.length === 0 && shownUmbrellas.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink2)', padding: '8px 4px' }}>No events match &ldquo;{query}&rdquo;.</div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {rows.map(r => r.kind === 'umbrella' ? (
            <div key={r.u.id} style={card}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{r.u.name}</span>
                  <span style={pill(true)}>Umbrella</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{[r.u.client_name, fmtDate(r.u.event_date)].filter(Boolean).join(' · ')}</div>
              </div>
              <Link href={r.u.href} style={openBtn}>Open Workspace →</Link>
            </div>
          ) : (
            <div key={r.ev.id} style={card}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{r.ev.name}</span>
                  <span style={pill(r.ev.status === 'active')}>{r.ev.status}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  {r.ev.city && <span>{r.ev.city}</span>}
                  {fmtDate(r.ev.event_date) && <span>{fmtDate(r.ev.event_date)}</span>}
                </div>
              </div>
              <Link href={`/admin/events/${r.ev.id}`} style={openBtn}>Open Workspace →</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
