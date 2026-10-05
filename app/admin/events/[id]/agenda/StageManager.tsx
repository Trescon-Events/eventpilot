'use client'
import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'
import type { Track, Room } from './agenda-utils'

/* Collapsible "Stages & rooms" editor: rename / reorder / delete stages, give a
   stage rooms (a stage with rooms is drawn as one timeline column per room),
   and — optionally — name the KonfHub track a stage publishes to. */

export type StageActions = {
  renameStage: (id: string, name: string) => void
  shiftStage: (id: string, dir: -1 | 1) => void
  deleteStage: (t: Track) => void
  setKonfhubTitle: (id: string, title: string) => void
  addRoom: (trackId: string, name: string) => void
  renameRoom: (id: string, name: string) => void
  deleteRoom: (r: Room) => void
}

const small: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--ink3)', padding: '2px 5px' }

export default function StageManager({ tracks, rooms, sessionCount, actions }: { tracks: Track[]; rooms: Room[]; sessionCount: (trackId: string) => number; actions: StageActions }) {
  const [open, setOpen] = useState(false)
  const [newRoom, setNewRoom] = useState<Record<string, string>>({})
  const [edit, setEdit] = useState<{ kind: 'stage' | 'room'; id: string; value: string } | null>(null)

  function commitEdit() {
    if (!edit) return
    const v = edit.value.trim()
    if (v) (edit.kind === 'stage' ? actions.renameStage : actions.renameRoom)(edit.id, v)
    setEdit(null)
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Stages &amp; rooms · {tracks.length} stage{tracks.length === 1 ? '' : 's'}, {rooms.length} room{rooms.length === 1 ? '' : 's'}</span>
        <span style={{ color: 'var(--ink3)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 14px 14px', display: 'grid', gap: '12px' }}>
          {tracks.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No stages yet — use “＋ Stage” above.</div>}
          {tracks.map((t, i) => {
            const myRooms = rooms.filter(r => r.track_id === t.id).sort((a, b) => a.order_index - b.order_index)
            const n = sessionCount(t.id)
            return (
              <div key={t.id} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '10px 12px', display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {edit?.kind === 'stage' && edit.id === t.id ? (
                    <Input autoFocus value={edit.value} onChange={e => setEdit({ ...edit, value: e.target.value })} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEdit(null) }} style={{ width: '200px' }} />
                  ) : <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{t.name}</strong>}
                  <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>{n} session{n === 1 ? '' : 's'}</span>
                  <span style={{ flex: 1 }} />
                  <button style={{ ...small, opacity: i === 0 ? 0.3 : 1 }} disabled={i === 0} onClick={() => actions.shiftStage(t.id, -1)} title="Move left">‹</button>
                  <button style={{ ...small, opacity: i === tracks.length - 1 ? 0.3 : 1 }} disabled={i === tracks.length - 1} onClick={() => actions.shiftStage(t.id, 1)} title="Move right">›</button>
                  <button style={small} onClick={() => setEdit({ kind: 'stage', id: t.id, value: t.name })}>Rename</button>
                  <button style={{ ...small, color: 'var(--red)' }} onClick={() => actions.deleteStage(t)}>Delete</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)' }}>Rooms</span>
                  {myRooms.map(r => (
                    <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', border: '1px solid var(--border)', borderRadius: '999px', padding: '2px 4px 2px 10px', fontSize: '12.5px', color: 'var(--ink2)' }}>
                      {edit?.kind === 'room' && edit.id === r.id ? (
                        <input autoFocus value={edit.value} onChange={e => setEdit({ ...edit, value: e.target.value })} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEdit(null) }} style={{ width: '120px', fontSize: '12.5px', background: 'transparent', border: 'none', color: 'var(--ink)', outline: 'none' }} />
                      ) : <span onDoubleClick={() => setEdit({ kind: 'room', id: r.id, value: r.name })} title="Double-click to rename">{r.name}</span>}
                      <button style={{ ...small, color: 'var(--red)' }} onClick={() => actions.deleteRoom(r)} aria-label={`Delete ${r.name}`}>×</button>
                    </span>
                  ))}
                  <span style={{ display: 'inline-flex', gap: '4px' }}>
                    <input value={newRoom[t.id] ?? ''} onChange={e => setNewRoom(p => ({ ...p, [t.id]: e.target.value }))} placeholder="＋ room name"
                      onKeyDown={e => { if (e.key === 'Enter' && (newRoom[t.id] ?? '').trim()) { actions.addRoom(t.id, newRoom[t.id].trim()); setNewRoom(p => ({ ...p, [t.id]: '' })) } }}
                      style={{ width: '130px', fontSize: '12.5px', padding: '3px 8px', border: '1px dashed var(--border)', borderRadius: '999px', background: 'transparent', color: 'var(--ink)' }} />
                    {(newRoom[t.id] ?? '').trim() && <Button variant="ghost" onClick={() => { actions.addRoom(t.id, newRoom[t.id].trim()); setNewRoom(p => ({ ...p, [t.id]: '' })) }}>Add</Button>}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>KonfHub track title</span>
                  <input defaultValue={t.konfhub_track_title ?? ''} placeholder="Optional — the track this stage publishes to on KonfHub"
                    onBlur={e => { if ((e.target.value.trim() || '') !== (t.konfhub_track_title ?? '')) actions.setKonfhubTitle(t.id, e.target.value) }}
                    style={{ flex: 1, fontSize: '12.5px', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--ink)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
