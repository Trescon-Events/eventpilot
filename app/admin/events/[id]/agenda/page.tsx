'use client'
import { useCallback, useEffect, useMemo, useState, use } from 'react'
import Link from 'next/link'
import { Card, Button, Input, Toast } from '@/app/components/ui'
import PageHeader from '@/app/components/PageHeader'
import { timezoneOffsetLabel } from '@/app/lib/events/timezones'
import TimelineGrid, { type Column, type Commit } from './TimelineGrid'
import SessionPanel, { type PanelSave, type SpeakerRow } from './SessionPanel'
import StageManager from './StageManager'
import PushDialog, { type PushReport } from './PushDialog'
import { type Track, type Room, type Session, type SpeakerLink, type Speaker, type Role, placeSessions, stageClashes, speakerClashes, wallClock, wallClockToIso, fmtDay } from './agenda-utils'

/* Agenda Builder — EventPilot owns the agenda (2026-10-05 redesign). A day
   timeline: one column per stage, drag to move / resize, double-click an empty
   slot to add, click a session to edit it in the side panel. Times are entered
   and shown in the event's timezone (events.timezone) and stored in UTC.
   KonfHub is an optional adapter: sessions linked to a KonfHub session forward
   their edits live (see app/lib/agenda/access.ts), everything else is local. */

const DEFAULT_LEN = 45

export default function AgendaBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [loading, setLoading] = useState(true)
  const [tz, setTz] = useState<string | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [links, setLinks] = useState<SpeakerLink[]>([])
  const [allSpeakers, setAllSpeakers] = useState<Speaker[]>([])
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const [extraDays, setExtraDays] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [stageName, setStageName] = useState('')
  const [addingStage, setAddingStage] = useState(false)
  const [newDay, setNewDay] = useState('')
  const [pushReport, setPushReport] = useState<PushReport | null>(null)
  const [pushing, setPushing] = useState(false)

  const say = (text: string, type: 'success' | 'error' = 'success') => setToast({ text, type })

  const load = useCallback(async () => {
    const [agendaRes, speakersRes] = await Promise.all([
      fetch(`/api/events/agenda-v2?event_id=${eventId}`),
      fetch(`/api/events/speakers?event_id=${eventId}&active=false`),
    ])
    const a = await agendaRes.json().catch(() => ({}))
    const sp = await speakersRes.json().catch(() => [])
    if (!agendaRes.ok) { say(a.error ?? 'Could not load the agenda.', 'error'); setLoading(false); return }
    setTz(a.timezone ?? null)
    setRoles(a.roles ?? [])
    setTracks(a.tracks ?? [])
    setRooms(a.rooms ?? [])
    setSessions(a.sessions ?? [])
    setLinks(a.session_speakers ?? [])
    setAllSpeakers(Array.isArray(sp) ? sp : [])
    setLoading(false)
  }, [eventId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const zone = tz ?? 'UTC'
  const placed = useMemo(() => placeSessions(sessions, zone), [sessions, zone])
  const stageClashIds = useMemo(() => stageClashes(placed), [placed])
  const spClash = useMemo(() => speakerClashes(placed, links), [placed, links])
  const days = useMemo(() => [...new Set([...placed.map(p => p.date), ...extraDays])].sort(), [placed, extraDays])
  const day = activeDay && days.includes(activeDay) ? activeDay : days[0] ?? null
  const sortedTracks = useMemo(() => [...tracks].sort((a, b) => a.order_index - b.order_index), [tracks])
  const dayPlaced = useMemo(() => placed.filter(p => p.date === day), [placed, day])
  const unscheduled = useMemo(() => sessions.filter(s => !s.start_timestamp || !s.end_timestamp), [sessions])
  const draftCount = sessions.filter(s => s.status === 'draft').length

  // A stage with rooms becomes one column per room (+ a "No room" column only while some session of that stage has none).
  const columns: Column[] = useMemo(() => {
    const cols: Column[] = []
    for (const t of sortedTracks) {
      const rs = rooms.filter(r => r.track_id === t.id).sort((x, y) => x.order_index - y.order_index)
      if (rs.length === 0) { cols.push({ key: t.id, id: t.id, name: t.name }); continue }
      for (const r of rs) cols.push({ key: `${t.id}:${r.id}`, id: t.id, roomId: r.id, name: r.name, sub: t.name })
      if (dayPlaced.some(p => p.s.track_id === t.id && !p.s.room_id)) cols.push({ key: `${t.id}:none`, id: t.id, roomId: null, name: 'No room', sub: t.name })
    }
    if (dayPlaced.some(p => !p.s.track_id) || cols.length === 0) cols.push({ key: 'none', id: null, name: 'Unassigned' })
    return cols
  }, [sortedTracks, rooms, dayPlaced])

  const [rangeStart, rangeEnd] = useMemo(() => {
    let lo = 8 * 60, hi = 19 * 60
    for (const p of dayPlaced) { lo = Math.min(lo, Math.floor((p.start - 60) / 60) * 60); hi = Math.max(hi, Math.ceil((p.end + 60) / 60) * 60) }
    return [Math.max(lo, 0), Math.min(hi, 24 * 60)]
  }, [dayPlaced])

  const speakerNames = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const l of [...links].sort((a, b) => a.order_index - b.order_index)) {
      if (!l.event_speakers) continue
      const n = l.event_speakers.public_name || l.event_speakers.name
      const arr = m.get(l.session_id) ?? []; if (!arr.includes(n)) arr.push(n); m.set(l.session_id, arr)
    }
    return m
  }, [links])

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const selectedSpeakers: SpeakerRow[] = useMemo(
    () => links.filter(l => l.session_id === selectedId && l.event_speakers).sort((a, b) => a.order_index - b.order_index).map(l => ({ speaker_id: l.event_speakers!.id, role_tag_id: l.role_tag_id })),
    [links, selectedId],
  )
  const clashNotes = useMemo(() => {
    if (!selected) return []
    const out: string[] = []
    if (stageClashIds.has(selected.id)) out.push('Overlaps another session on the same stage.')
    const sc = spClash.get(selected.id); if (sc?.length) out.push(`Speaker double-booked: ${[...new Set(sc)].join(', ')}.`)
    return out
  }, [selected, stageClashIds, spClash])

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const data = await res.json().catch(() => ({}))
    return { res, data }
  }

  async function createStage() {
    const name = stageName.trim(); if (!name) return
    const { res, data } = await call('/api/events/agenda-v2/tracks', 'POST', { event_id: eventId, name, order_index: tracks.length })
    if (!res.ok) { say(data.error ?? 'Could not add the stage.', 'error'); return }
    setStageName(''); setAddingStage(false); await load()
  }
  const stageActions = {
    renameStage: async (id: string, name: string) => { const { res, data } = await call('/api/events/agenda-v2/tracks', 'PATCH', { id, event_id: eventId, name }); if (!res.ok) say(data.error ?? 'Could not rename.', 'error'); await load() },
    shiftStage: async (id: string, dir: -1 | 1) => {
      const i = sortedTracks.findIndex(t => t.id === id), j = i + dir
      if (j < 0 || j >= sortedTracks.length) return
      await Promise.all([
        call('/api/events/agenda-v2/tracks', 'PATCH', { id: sortedTracks[i].id, event_id: eventId, order_index: j }),
        call('/api/events/agenda-v2/tracks', 'PATCH', { id: sortedTracks[j].id, event_id: eventId, order_index: i }),
      ])
      await load()
    },
    deleteStage: async (t: Track) => {
      const n = sessions.filter(s => s.track_id === t.id).length
      if (!window.confirm(n ? `Delete the stage “${t.name}”? Its ${n} session${n === 1 ? '' : 's'} will stay, unassigned.` : `Delete the stage “${t.name}”?`)) return
      const { res, data } = await call(`/api/events/agenda-v2/tracks?id=${t.id}&event_id=${eventId}`, 'DELETE')
      if (!res.ok) say(data.error ?? 'Could not delete the stage.', 'error')
      await load()
    },
    setKonfhubTitle: async (id: string, title: string) => { const { res, data } = await call('/api/events/agenda-v2/tracks', 'PATCH', { id, event_id: eventId, konfhub_track_title: title }); if (!res.ok) say(data.error ?? 'Could not save.', 'error'); else say('Saved.'); await load() },
    addRoom: async (trackId: string, name: string) => { const { res, data } = await call('/api/events/agenda-v2/rooms', 'POST', { event_id: eventId, track_id: trackId, name, order_index: rooms.filter(r => r.track_id === trackId).length }); if (!res.ok) say(data.error ?? 'Could not add the room.', 'error'); await load() },
    renameRoom: async (id: string, name: string) => { const { res, data } = await call('/api/events/agenda-v2/rooms', 'PATCH', { id, event_id: eventId, name }); if (!res.ok) say(data.error ?? 'Could not rename the room.', 'error'); await load() },
    deleteRoom: async (r: Room) => {
      const n = sessions.filter(s => s.room_id === r.id).length
      if (!window.confirm(n ? `Delete the room “${r.name}”? Its ${n} session${n === 1 ? '' : 's'} will stay on the stage, without a room.` : `Delete the room “${r.name}”?`)) return
      const { res, data } = await call(`/api/events/agenda-v2/rooms?id=${r.id}&event_id=${eventId}`, 'DELETE')
      if (!res.ok) say(data.error ?? 'Could not delete the room.', 'error')
      await load()
    },
  }

  function addDay(date: string) {
    if (!date) return
    setExtraDays(prev => (prev.includes(date) ? prev : [...prev, date])); setActiveDay(date); setNewDay('')
  }

  async function createSession(trackId: string | null, roomId: string | null | undefined, startMin: number | null) {
    if (!tz && startMin !== null) { say('Set the event timezone on Event Details first.', 'error'); return }
    const timed = startMin !== null && day
    const { res, data } = await call('/api/events/agenda-v2/sessions', 'POST', {
      event_id: eventId, track_id: trackId, ...(roomId ? { room_id: roomId } : {}), title: 'New session', order_index: sessions.length,
      ...(timed ? { start_timestamp: wallClock(day!, startMin!), end_timestamp: wallClock(day!, Math.min(startMin! + DEFAULT_LEN, 24 * 60 - 1)) } : {}),
    })
    if (!res.ok) { say(data.error ?? 'Could not add the session.', 'error'); return }
    await load(); setSelectedId(data.id)
  }

  // Drag / resize finished: optimistic local update, then one request.
  async function commit(c: Commit) {
    if (!day) return
    const startIso = wallClockToIso(day, c.start, zone), endIso = wallClockToIso(day, c.end, zone)
    if (!startIso || !endIso) return
    const before = sessions
    setSessions(prev => prev.map(s => s.id === c.id ? { ...s, track_id: c.track_id, room_id: c.room_id !== undefined ? c.room_id : null, start_timestamp: startIso, end_timestamp: endIso } : s))
    const { res, data } = await call('/api/events/agenda-v2/sessions/move', 'PATCH', { event_id: eventId, moves: [{ id: c.id, track_id: c.track_id, ...(c.room_id !== undefined ? { room_id: c.room_id } : {}), start_timestamp: wallClock(day, c.start), end_timestamp: wallClock(day, c.end) }] })
    if (!res.ok) { setSessions(before); say(data.error ?? 'Could not move the session.', 'error'); return }
    if (data.konfhub_push_errors?.length) say(`Moved — KonfHub update failed: ${data.konfhub_push_errors[0].error}`, 'error')
  }

  async function saveSession(v: PanelSave) {
    if (!selected) return
    setSaving(true)
    const body: Record<string, unknown> = { id: selected.id, event_id: eventId, ...v.fields }
    if (v.date && v.startMin !== null && v.endMin !== null) { body.start_timestamp = wallClock(v.date, v.startMin); body.end_timestamp = wallClock(v.date, v.endMin) }
    else { body.start_timestamp = null; body.end_timestamp = null }
    const { res, data } = await call('/api/events/agenda-v2/sessions', 'PATCH', body)
    if (!res.ok && res.status !== 207) { setSaving(false); say(data.error ?? 'Could not save.', 'error'); return }
    let pushError: string | null = data.konfhub_push_error ?? null
    if (v.speakers) {
      const sp = await call('/api/events/agenda-v2/sessions/speakers', 'PATCH', { session_id: selected.id, event_id: eventId, speakers: v.speakers })
      if (!sp.res.ok && sp.res.status !== 207) { setSaving(false); say(sp.data.error ?? 'Saved the session, but not the speakers.', 'error'); await load(); return }
      pushError = pushError ?? sp.data.konfhub_push_error ?? null
      if (sp.data.konfhub_skipped?.length) say(`Saved. Not sent to KonfHub yet (no listing pushed): ${sp.data.konfhub_skipped.map((x: { name: string }) => x.name).join(', ')}`, 'error')
    }
    setSaving(false)
    if (pushError) say(`Saved here — KonfHub update failed: ${pushError}`, 'error'); else say('Saved.')
    await load()
  }

  async function deleteSession() {
    if (!selected) return
    setSaving(true)
    const { res, data } = await call(`/api/events/agenda-v2/sessions?id=${selected.id}&event_id=${eventId}`, 'DELETE')
    setSaving(false)
    if (!res.ok) { say(data.error ?? 'Could not delete.', 'error'); return }
    setSelectedId(null); say('Session deleted.'); await load()
  }

  // Preview first (dry run), write only when confirmed.
  async function previewPush() {
    setPushing(true)
    const { res, data } = await call('/api/events/agenda-v2/konfhub-push', 'POST', { event_id: eventId, dry_run: true })
    setPushing(false)
    if (!res.ok) { say(data.error ?? 'Could not prepare the push.', 'error'); return }
    setPushReport(data)
  }
  async function confirmPush() {
    setPushing(true)
    const { res, data } = await call('/api/events/agenda-v2/konfhub-push', 'POST', { event_id: eventId })
    setPushing(false)
    if (!res.ok) { say(data.error ?? 'The push failed.', 'error'); return }
    setPushReport(data); await load()
  }

  async function publishDrafts() {
    const ids = sessions.filter(s => s.status === 'draft').map(s => s.id); if (!ids.length) return
    if (!window.confirm(`Publish ${ids.length} draft session${ids.length === 1 ? '' : 's'}? They'll appear on the public agenda.`)) return
    const { res, data } = await call('/api/events/agenda-v2/sessions/publish', 'POST', { event_id: eventId, ids, published: true })
    if (!res.ok) { say(data.error ?? 'Could not publish.', 'error'); return }
    say(`Published ${ids.length}.`); await load()
  }

  if (loading) return <div style={{ padding: '40px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div>
      <PageHeader
        eyebrow="Agenda Builder"
        title="Agenda"
        description={tz ? <>Times shown in <strong>{tz}</strong> ({timezoneOffsetLabel(tz)}). Drag to move, drag an edge to resize, double-click an empty slot to add a session.</> : undefined}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href={`/admin/events/${eventId}/integrations#agenda-structure`}><Button variant="ghost">KonfHub setup</Button></Link>
            <Button variant="ghost" onClick={previewPush} disabled={pushing}>{pushing && !pushReport ? 'Checking…' : 'Push to KonfHub'}</Button>
            <Button variant="ghost" onClick={() => createSession(null, undefined, null)}>＋ Session</Button>
            {draftCount > 0 && <Button variant="teal" onClick={publishDrafts}>Publish {draftCount} draft{draftCount === 1 ? '' : 's'}</Button>}
          </div>
        }
      />
      {pushReport && <PushDialog report={pushReport} busy={pushing} onConfirm={confirmPush} onClose={() => setPushReport(null)} />}
      <Toast message={toast?.text ?? null} type={toast?.type} onClose={() => setToast(null)} />

      <div style={{ padding: '20px 24px', display: 'grid', gap: '14px' }}>
        {!tz && (
          <Card padded color="amber">
            <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>
              <strong>Set the event timezone first.</strong> Session times are entered and shown in it. <Link href={`/admin/events/${eventId}/details`} style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Open Event Details →</Link>
            </div>
          </Card>
        )}

        {/* day tabs + add day */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {days.map(d => (
            <button key={d} onClick={() => setActiveDay(d)} style={{ padding: '7px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', border: d === day ? '1.5px solid var(--teal-mid)' : '1px solid var(--border)', background: d === day ? 'var(--teal-light)' : 'var(--card)', color: d === day ? 'var(--teal-mid)' : 'var(--ink3)' }}>
              {fmtDay(d)} <span style={{ opacity: 0.6, fontWeight: 600 }}>· {placed.filter(p => p.date === d).length}</span>
            </button>
          ))}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Input type="date" value={newDay} onChange={e => setNewDay(e.target.value)} style={{ width: '150px' }} />
            <Button variant="ghost" onClick={() => addDay(newDay)} disabled={!newDay}>＋ Add day</Button>
          </div>
          <div style={{ flex: 1 }} />
          {addingStage ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              <Input autoFocus value={stageName} onChange={e => setStageName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createStage(); if (e.key === 'Escape') setAddingStage(false) }} placeholder="Stage name" style={{ width: '170px' }} />
              <Button variant="teal" onClick={createStage} disabled={!stageName.trim()}>Add</Button>
              <Button variant="ghost" onClick={() => setAddingStage(false)}>Cancel</Button>
            </div>
          ) : <Button variant="ghost" onClick={() => setAddingStage(true)}>＋ Stage</Button>}
        </div>

        {unscheduled.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Unscheduled</span>
            {unscheduled.map(s => (
              <button key={s.id} onClick={() => setSelectedId(s.id)} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', border: selectedId === s.id ? '1.5px solid var(--teal-mid)' : '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink2)' }}>{s.title}</button>
            ))}
            <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>Pick one and give it a date and time.</span>
          </div>
        )}

        <StageManager tracks={sortedTracks} rooms={rooms} sessionCount={id => sessions.filter(s => s.track_id === id).length} actions={stageActions} />

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!day ? (
              <Card padded>
                <div style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                  No scheduled sessions yet. Add a day above (for example the first day of the event), then double-click a slot to create a session.
                </div>
              </Card>
            ) : (
              <TimelineGrid
                columns={columns} placed={dayPlaced} rangeStart={rangeStart} rangeEnd={rangeEnd}
                selectedId={selectedId} stageClashIds={stageClashIds} speakerClash={spClash} speakerNames={speakerNames} canEdit
                onSelect={setSelectedId} onCommit={commit} onCreate={createSession}
              />
            )}
            {day && <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--ink4)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <span>Dashed = draft</span><span style={{ color: 'var(--red)' }}>Red edge ⚠ = overlaps on the same stage</span><span style={{ color: 'var(--amber)' }}>⚠ = speaker double-booked</span><span>⇄ = linked to KonfHub</span>
            </div>}
          </div>

          {selected && (
            <SessionPanel
              key={`${selected.id}|${selected.updated_at}|${selected.start_timestamp}|${selected.end_timestamp}`}
              session={selected} tracks={sortedTracks} rooms={rooms} roles={roles} allSpeakers={allSpeakers} initialSpeakers={selectedSpeakers}
              tz={tz} saving={saving} clashNotes={clashNotes}
              onSave={saveSession} onDelete={deleteSession} onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
