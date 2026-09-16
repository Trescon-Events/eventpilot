'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { Card, Button, Input, Textarea, Select, Badge, SearchableSelect } from '@/app/components/ui'
import type { BadgeColor } from '@/app/components/ui'

/* Agenda Builder (2026-09-15) — replaces the old free-text event_agenda
   tab (app/admin/events/[id]/website/page.tsx, contentTab==='agenda') for
   any event using the new event_agenda_tracks/sessions tables. The old tab
   and its API route are left completely untouched — event_agenda is still
   read by the public site renderers for any event using EventPilot's own
   Website Builder, so removing it would be a real regression, not a
   cleanup. This is purely additive.

   Branches on event_websites.agenda_source:
   - 'konfhub_authoritative' (DFFW-family today): no "+ Add Stage" at all —
     structure can only come from fetching KonfHub (Integrations page).
     Editing a session's content here still works, and pushes back to
     KonfHub live via the confirmed session PUT for anything with a
     konfhub_session_id.
   - 'eventpilot_native' (everything else): normal local "+ Add Stage" /
     "+ Add Session" — no KonfHub involved, nothing to push. */

type Track = { id: string; name: string; order_index: number }
type Session = {
  id: string
  track_id: string | null
  title: string
  description: string | null
  session_type: string
  content_type: string | null
  start_timestamp: string | null
  end_timestamp: string | null
  location: string | null
  colour: string | null
  order_index: number
  konfhub_session_id: string | null
}
type SpeakerLink = { session_id: string; order_index: number; event_speakers: { id: string; name: string; company: string | null } }
type Speaker = { id: string; name: string; company: string | null }

const CONTENT_TYPE_BADGE: Record<string, BadgeColor> = {
  Keynote: 'teal',
  'Panel Discussion': 'amber',
  'Fireside Chat': 'purple',
}

function fmtTime(ts: string | null) {
  if (!ts) return '—'
  const d = new Date(ts)
  return isNaN(d.getTime()) ? ts : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AgendaBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [loading, setLoading] = useState(true)
  const [agendaSource, setAgendaSource] = useState<'konfhub_authoritative' | 'eventpilot_native'>('eventpilot_native')
  const [tracks, setTracks] = useState<Track[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [speakerLinks, setSpeakerLinks] = useState<SpeakerLink[]>([])
  const [allSpeakers, setAllSpeakers] = useState<Speaker[]>([])
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [newStageOpen, setNewStageOpen] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Session>>({})

  async function load() {
    setLoading(true)
    const [agendaRes, speakersRes] = await Promise.all([
      fetch(`/api/events/agenda-v2?event_id=${eventId}`),
      fetch(`/api/events/speakers?event_id=${eventId}&active=false`),
    ])
    const agendaData = await agendaRes.json().catch(() => ({}))
    const speakersData = await speakersRes.json().catch(() => [])
    setAgendaSource(agendaData.agenda_source ?? 'eventpilot_native')
    setTracks(agendaData.tracks ?? [])
    setSessions(agendaData.sessions ?? [])
    setSpeakerLinks(agendaData.session_speakers ?? [])
    setAllSpeakers(Array.isArray(speakersData) ? speakersData : [])
    setActiveTrackId(prev => prev ?? (agendaData.tracks?.[0]?.id ?? null))
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  function showMsg(text: string) { setMsg(text); setTimeout(() => setMsg(null), 4000) }

  async function createStage() {
    if (!newStageName.trim()) return
    const res = await fetch('/api/events/agenda-v2/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, name: newStageName.trim(), order_index: tracks.length }),
    })
    const data = await res.json()
    if (!res.ok) { showMsg(data.error ?? 'Failed to create stage.'); return }
    setNewStageOpen(false)
    setNewStageName('')
    await load()
    setActiveTrackId(data.id)
  }

  function startEdit(s: Session) {
    setEditingSessionId(s.id)
    setEditDraft({ ...s })
  }

  async function saveSession() {
    if (!editingSessionId) return
    const res = await fetch('/api/events/agenda-v2/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingSessionId, event_id: eventId, ...editDraft }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { showMsg(data.error ?? 'Failed to save.'); return }
    if (data.konfhub_push_error) showMsg(`Saved locally — KonfHub push failed: ${data.konfhub_push_error}`)
    else showMsg('Saved.')
    setEditingSessionId(null)
    load()
  }

  async function addSession() {
    if (!activeTrackId) return
    const res = await fetch('/api/events/agenda-v2/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, track_id: activeTrackId, title: 'New session', order_index: sessionsForTrack.length }),
    })
    const data = await res.json()
    if (!res.ok) { showMsg(data.error ?? 'Failed to add session.'); return }
    await load()
    startEdit(data)
  }

  async function saveSpeakers(sessionId: string, speakerIds: string[]) {
    const res = await fetch('/api/events/agenda-v2/sessions/speakers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, event_id: eventId, speaker_ids: speakerIds }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { showMsg(data.error ?? 'Failed to save speakers.'); return }
    if (data.konfhub_push_error) showMsg(`Saved locally — KonfHub push failed: ${data.konfhub_push_error}`)
    load()
  }

  if (loading) return <div style={{ padding: '40px', color: 'var(--ink3)' }}>Loading…</div>

  const sessionsForTrack = sessions.filter(s => s.track_id === activeTrackId).sort((a, b) => a.order_index - b.order_index)

  return (
    <div style={{ padding: '24px', maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)' }}>Agenda</h1>
        <Badge color={agendaSource === 'konfhub_authoritative' ? 'grey' : 'teal'}>
          {agendaSource === 'konfhub_authoritative' ? 'Structure from KonfHub' : 'EventPilot native'}
        </Badge>
      </div>

      {msg && <div style={{ fontSize: '13px', color: 'var(--teal)' }}>{msg}</div>}

      {agendaSource === 'konfhub_authoritative' ? (
        <Card padded>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>
              🔒 Stages can&apos;t be created here — this event&apos;s structure is authoritative on KonfHub.
            </span>
            <Link href={`/admin/events/${eventId}/integrations#agenda-structure`}>
              <Button variant="ghost">Fetch from KonfHub</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card padded>
          {!newStageOpen ? (
            <Button variant="ghost" onClick={() => setNewStageOpen(true)}>+ Add Stage</Button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Input value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="e.g. Main Stage" style={{ flex: '1 1 220px' }} />
              <Button onClick={createStage}>Create</Button>
              <Button variant="ghost" onClick={() => { setNewStageOpen(false); setNewStageName('') }}>Cancel</Button>
            </div>
          )}
        </Card>
      )}

      {tracks.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No stages yet.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
            {tracks.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTrackId(t.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '9px 12px', fontSize: '13px', fontWeight: 600,
                  color: activeTrackId === t.id ? 'var(--ink)' : 'var(--ink4)',
                  borderBottom: activeTrackId === t.id ? '2px solid var(--teal)' : '2px solid transparent',
                }}
              >
                {t.name} <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--ink4)' }}>{sessions.filter(s => s.track_id === t.id).length}</span>
              </button>
            ))}
          </div>

          <Card padded>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sessionsForTrack.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No sessions in this stage yet.</div>}
              {sessionsForTrack.map(s => (
                <div key={s.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--ink4)', flex: '0 0 100px' }}>
                      {fmtTime(s.start_timestamp)}–{fmtTime(s.end_timestamp)}
                    </span>
                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--ink)' }}>{s.title}</span>
                    {s.content_type && <Badge color={CONTENT_TYPE_BADGE[s.content_type] ?? 'grey'}>{s.content_type}</Badge>}
                    <SpeakerChips
                      links={speakerLinks.filter(l => l.session_id === s.id)}
                      allSpeakers={allSpeakers}
                      onChange={ids => saveSpeakers(s.id, ids)}
                    />
                    <Button variant="ghost" onClick={() => startEdit(s)}>Edit</Button>
                  </div>

                  {editingSessionId === s.id && (
                    <div style={{ display: 'grid', gap: '10px', padding: '14px', background: 'var(--surface)', borderRadius: '8px', marginTop: '8px' }}>
                      <Input value={editDraft.title ?? ''} onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))} placeholder="Session title" />
                      <Textarea value={editDraft.description ?? ''} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} placeholder="Description" rows={2} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <Input type="datetime-local" value={toLocalInput(editDraft.start_timestamp)} onChange={e => setEditDraft(d => ({ ...d, start_timestamp: e.target.value }))} />
                        <Input type="datetime-local" value={toLocalInput(editDraft.end_timestamp)} onChange={e => setEditDraft(d => ({ ...d, end_timestamp: e.target.value }))} />
                      </div>
                      <Select value={editDraft.session_type ?? 'speaker_session'} onChange={e => setEditDraft(d => ({ ...d, session_type: e.target.value }))}>
                        <option value="speaker_session">Speaker session</option>
                        <option value="lunch_break">Lunch break</option>
                        <option value="refreshment_break">Refreshment break</option>
                        <option value="custom_session">Custom session</option>
                      </Select>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button onClick={saveSession}>Save Changes</Button>
                        <Button variant="ghost" onClick={() => setEditingSessionId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <Button variant="ghost" onClick={addSession}>+ Add Session</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function toLocalInput(ts: string | null | undefined) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function SpeakerChips({ links, allSpeakers, onChange }: {
  links: SpeakerLink[]
  allSpeakers: Speaker[]
  onChange: (speakerIds: string[]) => void
}) {
  const selectedIds = links.map(l => l.event_speakers.id)
  const options = allSpeakers.filter(sp => !selectedIds.includes(sp.id)).map(sp => ({ id: sp.id, label: sp.name, sublabel: sp.company ?? undefined }))

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', flex: '0 0 220px' }}>
      {links.map(l => (
        <span key={l.event_speakers.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface)', borderRadius: '99px', padding: '2px 8px 2px 10px', fontSize: '12px', color: 'var(--ink)' }}>
          {l.event_speakers.name}
          <button
            onClick={() => onChange(selectedIds.filter(id => id !== l.event_speakers.id))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', fontSize: '13px', padding: 0 }}
          >
            ×
          </button>
        </span>
      ))}
      <div style={{ width: '140px' }}>
        <SearchableSelect
          options={options}
          value=""
          onChange={id => { if (id) onChange([...selectedIds, id]) }}
          placeholder="+ speaker"
          compact
        />
      </div>
    </div>
  )
}
