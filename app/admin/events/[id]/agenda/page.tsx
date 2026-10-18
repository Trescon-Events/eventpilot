'use client'
import { useCallback, useEffect, useMemo, useState, use } from 'react'
import Link from 'next/link'
import { Card, Button, Input, Select, Toast, Badge } from '@/app/components/ui'
import PageHeader from '@/app/components/PageHeader'
import { timezoneOffsetLabel } from '@/app/lib/events/timezones'
import SessionPanel, { type PanelSave, type SpeakerRow, type KhLabels } from './SessionPanel'
import StageManager from './StageManager'
import PushDialog, { type PushReport } from './PushDialog'
import { type Track, type Room, type Session, type SpeakerLink, type Speaker, type Role, placeSessions, stageClashes, speakerClashes, wallClock, fmtDay, fmtRange, sessionColour } from './agenda-utils'

/* Agenda Builder — EventPilot owns the agenda. 2026-10-18 redesign: pick a Day and a Stage from the two dropdowns, sessions are listed as rows, and
   clicking a row opens the full session details in a large popup. Days come from KonfHub's event dates when linked (so a day with no sessions yet
   still shows). Times are entered
   and shown in the event's timezone (events.timezone) and stored in UTC.
   KonfHub is an optional adapter: sessions linked to a KonfHub session forward
   their edits live (see app/lib/agenda/access.ts), everything else is local. */

const DEFAULT_LEN = 45
const pickLabel: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }

export default function AgendaBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [loading, setLoading] = useState(true)
  const [tz, setTz] = useState<string | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [khLabels, setKhLabels] = useState<KhLabels | null>(null)
  const [khDays, setKhDays] = useState<string[] | null>(null)
  const [themes, setThemes] = useState<string[]>([])
  const [formats, setFormats] = useState<string[]>([])
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [sync, setSync] = useState<Record<string, { state: 'ok' | 'pending' | 'konfhub_changed' | 'error' | 'new' | 'draft'; reason?: string }> | null>(null)
  const [syncing, setSyncing] = useState(false)
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

  // Sync status per session = a dry-run push (read-only): in sync, waiting to be pushed, changed in KonfHub since the last sync, or failing.
  const refreshSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/events/agenda-v2/konfhub-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, dry_run: true }) })
      const j = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(j?.items)) { setSync(null); return }
      const m: Record<string, { state: 'ok' | 'pending' | 'konfhub_changed' | 'error' | 'new' | 'draft'; reason?: string }> = {}
      for (const i of j.items as { session_id: string; action: string; reason?: string }[]) {
        m[i.session_id] = i.action === 'unchanged' ? { state: 'ok' } : i.action === 'updated' ? { state: 'pending' } : i.action === 'created' ? { state: 'new' }
          : i.action === 'skipped' ? { state: /Draft/.test(i.reason ?? '') ? 'draft' : 'error', reason: i.reason } : { state: /Changed in KonfHub/.test(i.reason ?? '') ? 'konfhub_changed' : 'error', reason: i.reason }
      }
      setSync(m)
    } catch { setSync(null) } finally { setSyncing(false) }
  }, [eventId])

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
    setKhDays(Array.isArray(a.konfhub_days) ? a.konfhub_days : null)
    setThemes(a.themes ?? [])
    setFormats(a.formats ?? [])
    setLinks(a.session_speakers ?? [])
    setAllSpeakers(Array.isArray(sp) ? sp : [])
    setLoading(false)
    void refreshSync()
  }, [eventId, refreshSync])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch(`/api/events/konfhub/agenda-mapping?event_id=${eventId}&labels=1`).then(r => r.ok ? r.json() : null).then(j => setKhLabels(j)).catch(() => {}) }, [eventId])

  const zone = tz ?? 'UTC'
  const placed = useMemo(() => placeSessions(sessions, zone), [sessions, zone])
  const stageClashIds = useMemo(() => stageClashes(placed), [placed])
  const spClash = useMemo(() => speakerClashes(placed, links), [placed, links])
  // KonfHub-linked events: every day KonfHub lists (with or without sessions), plus any session day outside that range (flagged). Otherwise: session days + manually added days.
  const sessionDays = useMemo(() => [...new Set(placed.map(p => p.date))], [placed])
  const days = useMemo(() => [...new Set([...(khDays ?? []), ...sessionDays, ...(khDays ? [] : extraDays)])].sort(), [khDays, sessionDays, extraDays])
  const day = activeDay && (days.includes(activeDay) || activeDay === 'unscheduled') ? activeDay : days[0] ?? null
  const sortedTracks = useMemo(() => [...tracks].sort((a, b) => a.order_index - b.order_index), [tracks])
  const dayRows = useMemo(() => {
    const list = day === 'unscheduled' ? sessions.filter(x => !x.start_timestamp || !x.end_timestamp).map(x => ({ s: x, start: 0, end: 0 })) : placed.filter(p => p.date === day).map(p => ({ s: p.s, start: p.start, end: p.end }))
    return list.filter(r => stageFilter === 'all' ? true : stageFilter === 'none' ? !r.s.track_id : r.s.track_id === stageFilter).sort((x, y) => x.start - y.start || x.s.order_index - y.s.order_index)
  }, [placed, sessions, day, stageFilter])
  const unscheduled = useMemo(() => sessions.filter(s => !s.start_timestamp || !s.end_timestamp), [sessions])
  const draftCount = sessions.filter(s => s.status === 'draft').length

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
    const timed = startMin !== null && day && day !== 'unscheduled'
    const { res, data } = await call('/api/events/agenda-v2/sessions', 'POST', {
      event_id: eventId, track_id: trackId, ...(roomId ? { room_id: roomId } : {}), title: 'New session', order_index: sessions.length,
      ...(timed ? { start_timestamp: wallClock(day!, startMin!), end_timestamp: wallClock(day!, Math.min(startMin! + DEFAULT_LEN, 24 * 60 - 1)) } : {}),
    })
    if (!res.ok) { say(data.error ?? 'Could not add the session.', 'error'); return }
    await load(); setSelectedId(data.id)
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
    const { res, data } = await call(`/api/events/agenda-v2/sessions?id=${selected.id}&event_id=${eventId}${selected.konfhub_session_id ? '&confirm_konfhub=1' : ''}`, 'DELETE')
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
  async function confirmPush(force = false) {
    setPushing(true)
    const { res, data } = await call('/api/events/agenda-v2/konfhub-push', 'POST', { event_id: eventId, ...(force ? { force: true } : {}) })
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
        description={tz ? <>Times shown in <strong>{tz}</strong> ({timezoneOffsetLabel(tz)}). Pick a day and a stage, then click a session to edit it.</> : undefined}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href={`/admin/events/${eventId}/integrations#agenda-structure`}><Button variant="ghost">KonfHub setup</Button></Link>
            <Button variant="ghost" onClick={previewPush} disabled={pushing}>{pushing && !pushReport ? 'Checking…' : 'Push to KonfHub'}</Button>
            <Button variant="ghost" onClick={() => createSession(stageFilter !== 'all' && stageFilter !== 'none' ? stageFilter : null, undefined, day && day !== 'unscheduled' ? Math.min(Math.max(9 * 60, ...dayRows.map(r => r.end)), 23 * 60) : null)}>＋ Session</Button>
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

        {/* Day and Stage pickers: always clear which day and stage the rows below belong to */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={pickLabel}>Day{khDays && <span style={{ fontWeight: 500, marginLeft: '6px' }}>from KonfHub</span>}</div>
            <Select value={day ?? ''} onChange={e => setActiveDay(e.target.value)} style={{ minWidth: '230px' }}>
              {days.length === 0 && <option value="">No days yet</option>}
              {days.map(d => <option key={d} value={d}>{fmtDay(d)} · {placed.filter(p => p.date === d).length} session{placed.filter(p => p.date === d).length === 1 ? '' : 's'}{khDays && !khDays.includes(d) ? ' (not a KonfHub day)' : ''}</option>)}
              {unscheduled.length > 0 && <option value="unscheduled">No date yet · {unscheduled.length}</option>}
            </Select>
          </div>
          <div>
            <div style={pickLabel}>Stage{khLabels && <span style={{ fontWeight: 500, marginLeft: '6px' }}>KonfHub: {khLabels.stage_mode === 'tag' ? `${khLabels.stage ?? 'Stage'} (tag)` : 'Track'}</span>}</div>
            <Select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ minWidth: '230px' }}>
              <option value="all">All stages</option>
              {sortedTracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              {sessions.some(x => !x.track_id) && <option value="none">No stage</option>}
            </Select>
          </div>
          {!khDays && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Input type="date" value={newDay} onChange={e => setNewDay(e.target.value)} style={{ width: '150px' }} />
              <Button variant="ghost" onClick={() => addDay(newDay)} disabled={!newDay}>＋ Add day</Button>
            </div>
          )}
          <div style={{ flex: 1 }} />
          {addingStage ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              <Input autoFocus value={stageName} onChange={e => setStageName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createStage(); if (e.key === 'Escape') setAddingStage(false) }} placeholder="Stage name" style={{ width: '170px' }} />
              <Button variant="teal" onClick={createStage} disabled={!stageName.trim()}>Add</Button>
              <Button variant="ghost" onClick={() => setAddingStage(false)}>Cancel</Button>
            </div>
          ) : khLabels?.stage_mode === 'tag' ? null : <Button variant="ghost" onClick={() => setAddingStage(true)}>＋ Stage</Button>}
        </div>

        <StageManager tracks={sortedTracks} rooms={rooms} sessionCount={id => sessions.filter(s => s.track_id === id).length} actions={stageActions} tagLock={khLabels?.stage_mode === 'tag' ? `Stage names are tags of the “${khLabels.stage ?? 'Stage'}” filter in KonfHub, and the live website filters on them. Renaming or deleting a stage here would break that link, so it is locked. Change the tag in KonfHub, then re-run Agenda mapping.` : null} />

        <Card padded={false}>
          {!day ? (
            <div style={{ padding: '20px', fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.6 }}>No days yet. Set the dates on KonfHub, or add a day above.</div>
          ) : dayRows.length === 0 ? (
            <div style={{ padding: '20px', fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.6 }}>No sessions on {day === 'unscheduled' ? 'this list' : fmtDay(day)}{stageFilter !== 'all' ? ' for this stage' : ''} yet. Use “＋ Session” to add one.</div>
          ) : dayRows.map(({ s: x, start, end }) => {
            const stage = tracks.find(t => t.id === x.track_id)?.name
            const names = speakerNames.get(x.id) ?? []
            const clash = stageClashIds.has(x.id) || (spClash.get(x.id)?.length ?? 0) > 0
            return (
              <button key={x.id} onClick={() => setSelectedId(x.id)} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: '14px', alignItems: 'center', width: '100%', textAlign: 'left', padding: '12px 18px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', color: 'inherit' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink2)' }}>{day === 'unscheduled' ? 'No time' : fmtRange(start, end)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, flexShrink: 0, background: sessionColour(x) }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[stage ?? 'No stage', x.content_type, x.theme].filter(Boolean).join(' · ')}{names.length ? ` · ${names.join(', ')}` : ' · no speakers'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {clash && <Badge color="amber">⚠ clash</Badge>}
                  {x.status === 'draft' && <Badge color="grey">Draft</Badge>}
                  {x.status !== 'draft' && (() => {
                    const st = sync?.[x.id]
                    if (!x.konfhub_session_id && !st) return <Badge color="grey">Not on KonfHub</Badge>
                    if (!st) return <Badge color="grey">{syncing ? 'Checking…' : '⇄ KonfHub'}</Badge>
                    if (st.state === 'ok') return <Badge color="teal">✓ In sync</Badge>
                    if (st.state === 'pending') return <span title="EventPilot has changes KonfHub does not have yet. Use Push to KonfHub."><Badge color="amber">● Not pushed yet</Badge></span>
                    if (st.state === 'konfhub_changed') return <span title={st.reason}><Badge color="amber">⚠ Changed in KonfHub</Badge></span>
                    if (st.state === 'new') return <Badge color="grey">Not on KonfHub</Badge>
                    return <span title={st.reason}><Badge color="red">⚠ Not synced</Badge></span>
                  })()}
                </div>
              </button>
            )
          })}
        </Card>
      </div>

      {selected && (
        <SessionPanel
          khLabels={khLabels} days={days} themes={themes} formats={formats}
          key={`${selected.id}|${selected.updated_at}|${selected.start_timestamp}|${selected.end_timestamp}`}
          session={selected} tracks={sortedTracks} rooms={rooms} roles={roles} allSpeakers={allSpeakers} initialSpeakers={selectedSpeakers}
          tz={tz} saving={saving} clashNotes={clashNotes}
          onSave={saveSession} onDelete={deleteSession} onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
