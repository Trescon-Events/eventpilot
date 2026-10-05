'use client'
import { useMemo, useState } from 'react'
import { Button, Input, Select, Textarea, Badge, SearchableSelect } from '@/app/components/ui'
import { colourToCss } from '@/app/lib/agenda/colours'
import { type Session, type Track, type Room, type Role, type Speaker, SESSION_TYPES, CONTENT_TYPES, SWATCHES, sessionColour, localParts, minutesToHHMM, hhmmToMinutes } from './agenda-utils'

/* Right-hand editor for one session. Edits are held in a local draft and saved
   with one button (session fields, then the speaker list) — predictable, and a
   KonfHub-linked session is pushed once per save, not per keystroke. Times are
   entered as date + time in the EVENT's timezone. */

export type SpeakerRow = { speaker_id: string; role_tag_id: string }
export type PanelSave = {
  fields: { title: string; description: string | null; session_type: string; content_type: string | null; track_id: string | null; room_id: string | null; location: string | null; capacity: number | null; colour: string | null; status: 'draft' | 'published' }
  date: string | null; startMin: number | null; endMin: number | null
  speakers: SpeakerRow[] | null // null = unchanged
}

const label: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }

export default function SessionPanel({ session, tracks, rooms, roles, allSpeakers, initialSpeakers, tz, saving, clashNotes, onSave, onDelete, onClose }: {
  session: Session
  tracks: Track[]
  rooms: Room[]
  roles: Role[]
  allSpeakers: Speaker[]
  initialSpeakers: SpeakerRow[]
  tz: string | null
  saving: boolean
  clashNotes: string[]
  onSave: (v: PanelSave) => void
  onDelete: () => void
  onClose: () => void
}) {
  const start = localParts(session.start_timestamp, tz ?? 'UTC'); const end = localParts(session.end_timestamp, tz ?? 'UTC')
  const [title, setTitle] = useState(session.title)
  const [description, setDescription] = useState(session.description ?? '')
  const [sessionType, setSessionType] = useState(session.session_type)
  const [contentType, setContentType] = useState(session.content_type ?? '')
  const [trackId, setTrackId] = useState(session.track_id ?? '')
  const [roomId, setRoomId] = useState(session.room_id ?? '')
  const [location, setLocation] = useState(session.location ?? '')
  const [capacity, setCapacity] = useState(session.capacity != null ? String(session.capacity) : '')
  const [colour, setColour] = useState(session.colour ?? '')
  const [status, setStatus] = useState(session.status)
  const [date, setDate] = useState(start?.date ?? '')
  const [startT, setStartT] = useState(start ? minutesToHHMM(start.minutes) : '')
  const [endT, setEndT] = useState(end ? minutesToHHMM(end.minutes) : '')
  const [speakers, setSpeakers] = useState<SpeakerRow[]>(initialSpeakers)
  const [speakersTouched, setSpeakersTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The page re-keys this component on the session's id/updated_at/times, so a fresh draft is built whenever it changes.

  const timeError = useMemo(() => {
    if (!date && !startT && !endT) return null
    if (!date || !startT || !endT) return 'Set the date, start and end — or clear all three.'
    return hhmmToMinutes(endT) <= hhmmToMinutes(startT) ? 'End must be after start.' : null
  }, [date, startT, endT])
  const needsTz = !tz && !!date
  const stageRooms = useMemo(() => rooms.filter(r => r.track_id === trackId).sort((a, b) => a.order_index - b.order_index), [rooms, trackId])
  const leaderRole = roles.find(r => /roundtable\s*leader/i.test(r.label))

  const speakerOptions = allSpeakers.map(s => ({ id: s.id, label: s.public_name || s.name, sublabel: s.company ?? undefined }))
  const nameOf = (id: string) => { const s = allSpeakers.find(x => x.id === id); return s ? (s.public_name || s.name) : 'Unknown speaker' }

  function submit() {
    if (!title.trim() || timeError) return
    onSave({
      fields: { title: title.trim(), description: description.trim() || null, session_type: sessionType, content_type: contentType.trim() || null, track_id: trackId || null, room_id: roomId || null, location: location.trim() || null, capacity: capacity.trim() === '' ? null : Math.max(0, Number(capacity) || 0), colour: colour || null, status },
      date: date || null, startMin: date && startT ? hhmmToMinutes(startT) : null, endMin: date && endT ? hhmmToMinutes(endT) : null,
      speakers: speakersTouched ? speakers : null,
    })
  }

  return (
    <aside style={{ width: '380px', flexShrink: 0, border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 150px)', position: 'sticky', top: '12px' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: sessionColour({ colour: colour || null, session_type: sessionType, content_type: contentType || null }) }} />
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Edit session</span>
          {session.konfhub_session_id && <Badge color="grey">⇄ KonfHub</Badge>}
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'grid', gap: '14px' }}>
        {clashNotes.length > 0 && (
          <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: '12px', lineHeight: 1.5 }}>
            {clashNotes.map((n, i) => <div key={i}>⚠ {n}</div>)}
          </div>
        )}
        <div><label style={label}>Title</label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title" /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div><label style={label}>Type</label>
            <Select value={sessionType} onChange={e => setSessionType(e.target.value)}>
              {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select></div>
          <div><label style={label}>Format</label>
            <Input list="agenda-content-types" value={contentType} onChange={e => setContentType(e.target.value)} placeholder="Keynote, Panel…" />
            <datalist id="agenda-content-types">{CONTENT_TYPES.map(c => <option key={c} value={c} />)}</datalist></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: stageRooms.length ? '1fr 1fr' : '1fr', gap: '10px' }}>
          <div><label style={label}>Stage</label>
            <Select value={trackId} onChange={e => { setTrackId(e.target.value); setRoomId('') }}>
              <option value="">— Unassigned —</option>
              {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select></div>
          {stageRooms.length > 0 && (
            <div><label style={label}>Room</label>
              <Select value={roomId} onChange={e => setRoomId(e.target.value)}>
                <option value="">— No room —</option>
                {stageRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select></div>
          )}
        </div>

        <div>
          <label style={label}>When {tz ? <span style={{ fontWeight: 500, color: 'var(--ink4)' }}>({tz})</span> : null}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '8px' }}>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <Input type="time" step={900} value={startT} onChange={e => setStartT(e.target.value)} />
            <Input type="time" step={900} value={endT} onChange={e => setEndT(e.target.value)} />
          </div>
          {timeError && <div style={{ fontSize: '11.5px', color: 'var(--red)', marginTop: '4px' }}>{timeError}</div>}
          {needsTz && <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '4px' }}>Set the event timezone on Event Details first.</div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '10px' }}>
          <div><label style={label}>Location / room note</label><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Optional" /></div>
          <div><label style={label}>Capacity</label><Input type="number" min={0} value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="—" /></div>
        </div>

        <div><label style={label}>Colour</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setColour('')} title="Automatic" style={{ height: 22, padding: '0 8px', borderRadius: '999px', border: colour === '' ? '2px solid var(--ink)' : '1px solid var(--border)', background: 'var(--card)', fontSize: '11px', color: 'var(--ink3)', cursor: 'pointer' }}>Auto</button>
            {SWATCHES.map(c => <button key={c} onClick={() => setColour(c)} aria-label={c} style={{ width: 22, height: 22, borderRadius: '50%', background: colourToCss(c), border: colour === c ? '2px solid var(--ink)' : '2px solid transparent', outline: '1px solid var(--border)', cursor: 'pointer' }} />)}
          </div></div>

        <div><label style={label}>Description</label><Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Shown on the public agenda" /></div>

        <div>
          <label style={label}>Speakers</label>
          <div style={{ display: 'grid', gap: '8px' }}>
            {speakers.map((r, i) => (
              <div key={`${r.speaker_id}-${r.role_tag_id}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 24px', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(r.speaker_id)}</span>
                <Select value={r.role_tag_id} onChange={e => { setSpeakers(prev => prev.map((x, j) => j === i ? { ...x, role_tag_id: e.target.value } : x)); setSpeakersTouched(true) }}>
                  <option value="">Main role</option>
                  {roles.map(ro => <option key={ro.tag_id} value={ro.tag_id}>{ro.label}</option>)}
                </Select>
                <button onClick={() => { setSpeakers(prev => prev.filter((_, j) => j !== i)); setSpeakersTouched(true) }} aria-label="Remove speaker" style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '16px', cursor: 'pointer' }}>×</button>
              </div>
            ))}
            <SearchableSelect options={speakerOptions} value="" onChange={v => { if (v) { setSpeakers(prev => [...prev, { speaker_id: v, role_tag_id: sessionType === 'roundtable' && leaderRole ? leaderRole.tag_id : '' }]); setSpeakersTouched(true) } }} placeholder="＋ Add a speaker…" />
          </div>
          {roles.length === 0 && <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '6px' }}>Roles (Moderator, Chair…) come from the Integrations page.</div>}
          {sessionType === 'roundtable' && (() => {
            const leaders = leaderRole ? speakers.filter(r => r.role_tag_id === leaderRole.tag_id).length : 0
            const msg = !leaderRole ? 'Add a “Roundtable Leader” role on the Integrations page, then pick it here.' : leaders === 0 ? 'A roundtable needs one speaker with the Roundtable Leader role.' : leaders > 1 ? 'A roundtable shows one leader — more than one is assigned.' : null
            return msg ? <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '6px' }}>⚠ {msg}</div> : null
          })()}
        </div>

        <div><label style={label}>Visibility</label>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            {(['draft', 'published'] as const).map(v => (
              <button key={v} onClick={() => setStatus(v)} style={{ padding: '6px 14px', fontSize: '12.5px', fontWeight: 700, border: 'none', cursor: 'pointer', background: status === v ? (v === 'published' ? 'var(--teal)' : 'var(--ink3)') : 'var(--card)', color: status === v ? 'var(--surface)' : 'var(--ink3)' }}>{v === 'draft' ? 'Draft' : 'Published'}</button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '4px' }}>Only published sessions appear on the public agenda.</div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>Delete</button>
        ) : (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Delete?</span>
            <Button variant="red" onClick={onDelete} disabled={saving}>Yes</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
          </div>
        )}
        <Button variant="teal" onClick={submit} disabled={saving || !title.trim() || !!timeError || needsTz}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </aside>
  )
}
