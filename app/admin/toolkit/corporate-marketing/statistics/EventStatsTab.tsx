'use client'

/*
  Event Statistics tab — per-event-edition stats. Reads from the real
  events table (do NOT duplicate). User picks an event; all stats scoped
  to event.id show + can be edited.

  Suggested stat names per Thulasi CMOS 2.1: Edition, Venue, City,
  Country, Event Date, Attendance, Sponsors, Leads, Countries, Revenue,
  ROI, Media Reach. Marketing can also add custom stats.
*/

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BRAND, INPUT_STYLE, TableHeader, StatRow, useMe, useStatCrud } from './_shared'
import StatisticDetailDrawer from './StatisticDetailDrawer'

const SUGGESTED_EVENT_STATS = [
  'Edition', 'Venue', 'City', 'Country', 'Event Date',
  'Attendance', 'Sponsors', 'Leads', 'Countries', 'Revenue', 'ROI', 'Media Reach',
]

type EventRow = {
  id: string
  name: string
  city: string | null
  event_date: string | null
  status: string | null
}

export default function EventStatsTab() {
  const [events, setEvents]           = useState<EventRow[]>([])
  const [activeEventId, setActiveId]  = useState<string>('')
  const [search, setSearch]           = useState('')
  const [showAddStat, setShowAddStat] = useState(false)
  const [newRow, setNewRow] = useState({ name: '', current_value: '', unit: '', description: '' })
  const me = useMe()

  const loadEvents = useCallback(async () => {
    // Read events straight from the shared events table via /api/events
    // (existing route that returns id, name, city, event_date, status).
    // Fallback: query Supabase REST directly via /rest/v1 won't work
    // from the browser without RLS — so we rely on the app's events API.
    const r = await fetch('/api/events?limit=500', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    const rows: EventRow[] = Array.isArray(d?.events) ? d.events : (Array.isArray(d) ? d : [])
    // Sort by event_date desc; nulls last
    rows.sort((a, b) => {
      const A = a.event_date ? new Date(a.event_date).getTime() : -Infinity
      const B = b.event_date ? new Date(b.event_date).getTime() : -Infinity
      return B - A
    })
    setEvents(rows)
    if (!activeEventId && rows.length > 0) setActiveId(rows[0].id)
  }, [activeEventId])
  useEffect(() => { loadEvents() }, [loadEvents])

  const fetchUrl = useMemo(
    () => activeEventId ? `/api/corporate-marketing/statistics?scope=event&scope_ref=${activeEventId}` : '',
    [activeEventId]
  )
  const crud = useStatCrud(fetchUrl || '/api/corporate-marketing/statistics?scope=event&limit=0')
  const [detailId, setDetailId] = useState<string | null>(null)

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return events
    return events.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.city ?? '').toLowerCase().includes(q)
    )
  }, [events, search])

  const activeEvent = events.find(e => e.id === activeEventId)

  async function addStat() {
    if (!activeEventId) { alert('Pick an event first.'); return }
    if (!newRow.name.trim()) { alert('Name is required.'); return }
    const res = await fetch('/api/corporate-marketing/statistics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'event',
        scope_ref_id: activeEventId,
        name: newRow.name.trim(),
        current_value: newRow.current_value,
        unit: newRow.unit || null,
        description: newRow.description || null,
      }),
    })
    if (!res.ok) { alert(`Add failed: ${(await res.json().catch(() => ({}))).error || res.statusText}`); return }
    setNewRow({ name: '', current_value: '', unit: '', description: '' })
    setShowAddStat(false)
    crud.reload()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Event picker */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '14px', padding: '16px 20px',
        display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
          Event
        </span>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search events by name or city…" style={{ ...INPUT_STYLE, width: '240px' }}
        />
        <select
          value={activeEventId} onChange={e => setActiveId(e.target.value)}
          style={{ ...INPUT_STYLE, minWidth: '280px', maxWidth: '480px' }}
        >
          <option value="">— pick an event —</option>
          {filteredEvents.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name}{ev.event_date ? ` · ${new Date(ev.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}{ev.city ? ` · ${ev.city}` : ''}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--ink4)' }}>
          Events come from the Events module — this repository never duplicates event records.
        </div>
      </div>

      {activeEvent && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowAddStat(v => !v)}
              style={{
                background: BRAND, color: 'var(--red-light)', border: 'none',
                padding: '8px 16px', borderRadius: '8px',
                fontSize: '12px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
              }}>
              {showAddStat ? '× Cancel' : '+ Add stat'}
            </button>
            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--ink4)' }}>
              {crud.rows.length} stat{crud.rows.length === 1 ? '' : 's'} for <strong>{activeEvent.name}</strong>
            </div>
          </div>

          {showAddStat && (
            <div style={{
              background: 'var(--card)', border: `1px dashed ${BRAND}`, borderRadius: '12px',
              padding: '14px 16px', display: 'grid', gap: '10px',
              gridTemplateColumns: '1.4fr 1fr 0.7fr 1.5fr auto', alignItems: 'center',
            }}>
              <input placeholder="Name (or pick suggested)" value={newRow.name} onChange={e => setNewRow(n => ({ ...n, name: e.target.value }))} list="suggested-event" style={INPUT_STYLE} />
              <datalist id="suggested-event">
                {SUGGESTED_EVENT_STATS.map(s => <option key={s} value={s} />)}
              </datalist>
              <input placeholder="Value" value={newRow.current_value} onChange={e => setNewRow(n => ({ ...n, current_value: e.target.value }))} style={INPUT_STYLE} />
              <input placeholder="Unit" value={newRow.unit} onChange={e => setNewRow(n => ({ ...n, unit: e.target.value }))} style={INPUT_STYLE} />
              <input placeholder="Description (optional)" value={newRow.description} onChange={e => setNewRow(n => ({ ...n, description: e.target.value }))} style={INPUT_STYLE} />
              <button onClick={addStat} style={{
                background: BRAND, color: 'var(--red-light)', border: 'none',
                padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
              }}>Create draft</button>
            </div>
          )}

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <TableHeader />
            {crud.loading
              ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
              : crud.rows.length === 0
                ? <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>
                    No stats for this event yet. Click <strong>+ Add stat</strong> above.
                  </div>
                : crud.rows.map(r => (
                    <StatRow key={r.id} r={r} me={me}
                      editing={crud.editing} setEditing={crud.setEditing} busy={crud.busy}
                      beginEdit={crud.beginEdit} cancelEdit={crud.cancelEdit} saveEdit={crud.saveEdit}
                      transition={crud.transition} archive={crud.archive}
                      onOpenDetail={setDetailId}
                    />
                  ))}
          </div>
        </>
      )}
      <StatisticDetailDrawer statisticId={detailId} onClose={() => setDetailId(null)} onChanged={crud.reload} />
    </div>
  )
}
