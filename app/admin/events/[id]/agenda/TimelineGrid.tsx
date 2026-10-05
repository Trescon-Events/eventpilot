'use client'
import { useEffect, useRef, useState } from 'react'
import { type Placed, SNAP_MIN, MIN_DURATION, sessionColour, snap, minutesToHHMM, fmtRange } from './agenda-utils'

/* The agenda timeline: one column per stage, time down the side. Cards move by
   dragging the body (across stages and times), resize from the top/bottom
   edge, snap to 15 minutes. A plain click selects; double-clicking an empty
   slot creates a draft session there. Nothing here talks to the server — it
   reports finished gestures through onCommit / onCreate / onSelect. */

// A column is a stage, or one room of a stage (roomId set; null = the stage's sessions that have no room yet).
export type Column = { key: string; id: string | null; roomId?: string | null; name: string; sub?: string }
export type Commit = { id: string; track_id: string | null; room_id?: string | null; start: number; end: number }

const PX_PER_MIN = 1.5
const HEADER_H = 44
const GUTTER = 56

type Drag = { id: string; mode: 'move' | 'top' | 'bottom'; startMin: number; endMin: number; col: number; originX: number; originY: number; origStart: number; origEnd: number; origCol: number; moved: boolean }

export default function TimelineGrid({ columns, placed, rangeStart, rangeEnd, selectedId, stageClashIds, speakerClash, speakerNames, canEdit, onSelect, onCommit, onCreate, headerExtra }: {
  columns: Column[]
  placed: Placed[]
  rangeStart: number
  rangeEnd: number
  selectedId: string | null
  stageClashIds: Set<string>
  speakerClash: Map<string, string[]>
  speakerNames: Map<string, string[]>
  canEdit: boolean
  onSelect: (id: string) => void
  onCommit: (c: Commit) => void
  onCreate: (trackId: string | null, roomId: string | null | undefined, startMin: number) => void
  headerExtra?: (col: Column, index: number) => React.ReactNode
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const totalMin = rangeEnd - rangeStart
  const height = totalMin * PX_PER_MIN
  const hours: number[] = []
  for (let m = Math.ceil(rangeStart / 60) * 60; m <= rangeEnd; m += 60) hours.push(m)

  function colFromX(clientX: number, fallback: number) {
    for (let i = 0; i < colRefs.current.length; i++) {
      const r = colRefs.current[i]?.getBoundingClientRect()
      if (r && clientX >= r.left && clientX < r.right) return i
    }
    return fallback
  }

  // The drag is tracked with window-level listeners (not pointer capture): a
  // card moving to another stage re-mounts under a different parent, which
  // would drop capture mid-gesture.
  const dragRef = useRef<Drag | null>(null)
  const latest = useRef({ columns, rangeStart, rangeEnd, onSelect, onCommit })
  useEffect(() => { latest.current = { columns, rangeStart, rangeEnd, onSelect, onCommit } })
  const setDragBoth = (d: Drag | null) => { dragRef.current = d; setDrag(d) }

  useEffect(() => {
    if (!drag) return
    function onMove(e: PointerEvent) {
      const d = dragRef.current; if (!d) return
      const { rangeStart: rs, rangeEnd: re } = latest.current
      const dMin = snap((e.clientY - d.originY) / PX_PER_MIN)
      const moved = d.moved || Math.abs(e.clientY - d.originY) > 4 || Math.abs(e.clientX - d.originX) > 4
      let { startMin, endMin, col } = d
      if (d.mode === 'move') {
        const dur = d.origEnd - d.origStart
        startMin = Math.min(Math.max(d.origStart + dMin, rs), re - dur)
        endMin = startMin + dur
        col = colFromX(e.clientX, d.col)
      } else if (d.mode === 'bottom') {
        endMin = Math.min(Math.max(d.origEnd + dMin, d.origStart + MIN_DURATION), re)
      } else {
        startMin = Math.max(Math.min(d.origStart + dMin, d.origEnd - MIN_DURATION), rs)
      }
      setDragBoth({ ...d, startMin, endMin, col, moved })
    }
    function onUp() {
      const d = dragRef.current; if (!d) return
      setDragBoth(null)
      const { columns: cols, onSelect: sel, onCommit: commit } = latest.current
      if (!d.moved) { sel(d.id); return }
      if (d.startMin === d.origStart && d.endMin === d.origEnd && d.col === d.origCol) return
      commit({ id: d.id, track_id: cols[d.col]?.id ?? null, room_id: cols[d.col]?.roomId, start: d.startMin, end: d.endMin })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag])

  function begin(e: React.PointerEvent, p: Placed, mode: Drag['mode'], colIdx: number) {
    if (e.button !== 0) return
    e.stopPropagation()
    if (!canEdit) { onSelect(p.s.id); return }
    setDragBoth({ id: p.s.id, mode, startMin: p.start, endMin: p.end, col: colIdx, originX: e.clientX, originY: e.clientY, origStart: p.start, origEnd: p.end, origCol: colIdx, moved: false })
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${GUTTER}px repeat(${columns.length}, minmax(190px, 1fr))`, minWidth: GUTTER + columns.length * 190 }}>
        {/* header row */}
        <div style={{ height: HEADER_H, borderBottom: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 3 }} />
        {columns.map((c, i) => (
          <div key={c.key} style={{ height: HEADER_H, borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', padding: '0 10px' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
              {c.sub && <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{c.sub}</span>}
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{c.name}</span>
            </span>
            {headerExtra?.(c, i)}
          </div>
        ))}

        {/* time gutter */}
        <div style={{ position: 'relative', height, background: 'var(--card)' }}>
          <div style={{ position: 'sticky', left: 0, height, background: 'var(--card)', zIndex: 2 }}>
            {hours.map(m => (
              <div key={m} style={{ position: 'absolute', top: (m - rangeStart) * PX_PER_MIN - 7, right: 8, fontSize: '11px', fontWeight: 700, color: 'var(--ink4)' }}>{minutesToHHMM(m)}</div>
            ))}
          </div>
        </div>

        {/* stage columns */}
        {columns.map((c, ci) => {
          const colSessions = placed.filter(p => (c.id === null ? !p.s.track_id : p.s.track_id === c.id) && (c.roomId === undefined || (p.s.room_id ?? null) === c.roomId) && !(drag?.moved && drag.id === p.s.id))
          const dragged = drag ? placed.find(p => p.s.id === drag.id) : null
          return (
            <div key={c.key} ref={el => { colRefs.current[ci] = el }}
              onDoubleClick={e => {
                if (!canEdit) return
                const rect = e.currentTarget.getBoundingClientRect()
                onCreate(c.id, c.roomId, Math.min(Math.max(snap(rangeStart + (e.clientY - rect.top) / PX_PER_MIN - SNAP_MIN / 2), rangeStart), rangeEnd - 30))
              }}
              style={{ position: 'relative', height, borderLeft: '1px solid var(--border-light)', cursor: canEdit ? 'cell' : 'default',
                backgroundImage: `repeating-linear-gradient(to bottom, var(--border-light) 0, var(--border-light) 1px, transparent 1px, transparent ${60 * PX_PER_MIN}px)` }}>
              {/* half-hour guide */}
              {hours.map(m => <div key={m} style={{ position: 'absolute', left: 0, right: 0, top: (m - rangeStart + 30) * PX_PER_MIN, borderTop: '1px dashed var(--border-light)', opacity: 0.6, pointerEvents: 'none' }} />)}
              {colSessions.map(p => <Card key={p.s.id} p={p} start={p.start} end={p.end} selected={selectedId === p.s.id} clash={stageClashIds.has(p.s.id)} speakerClash={speakerClash.get(p.s.id)} speakers={speakerNames.get(p.s.id)} rangeStart={rangeStart} canEdit={canEdit} onBegin={(e, mode) => begin(e, p, mode, ci)} />)}
              {drag?.moved && drag.col === ci && dragged && (
                <Card p={dragged} start={drag.startMin} end={drag.endMin} selected clash={false} speakerClash={undefined} speakers={speakerNames.get(dragged.s.id)} rangeStart={rangeStart} canEdit ghost
                  onBegin={() => {}} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ p, start, end, selected, clash, speakerClash, speakers, rangeStart, canEdit, ghost, onBegin }: {
  p: Placed; start: number; end: number; selected: boolean; clash: boolean; speakerClash: string[] | undefined; speakers: string[] | undefined
  rangeStart: number; canEdit: boolean; ghost?: boolean
  onBegin: (e: React.PointerEvent, mode: Drag['mode']) => void
}) {
  const colour = sessionColour(p.s)
  const h = (end - start) * PX_PER_MIN
  const compact = h < 54
  const draft = p.s.status === 'draft'
  const handle: React.CSSProperties = { position: 'absolute', left: 0, right: 0, height: 8, cursor: canEdit ? 'ns-resize' : 'default', zIndex: 2 }
  return (
    <div
      onPointerDown={e => onBegin(e, 'move')}
      style={{
        position: 'absolute', left: 4, right: 4, top: (start - rangeStart) * PX_PER_MIN, height: Math.max(h - 2, 16), boxSizing: 'border-box',
        borderRadius: '8px', padding: compact ? '3px 8px' : '6px 9px', overflow: 'hidden', touchAction: 'none', userSelect: 'none',
        cursor: canEdit ? (ghost ? 'grabbing' : 'grab') : 'pointer',
        background: `color-mix(in srgb, ${colour} ${draft ? 9 : 16}%, var(--card))`,
        border: `1px ${draft ? 'dashed' : 'solid'} ${clash ? 'var(--red)' : selected ? colour : `color-mix(in srgb, ${colour} 45%, transparent)`}`,
        borderLeft: `4px solid ${colour}`,
        boxShadow: ghost ? 'var(--shadow-md)' : selected ? `0 0 0 2px color-mix(in srgb, ${colour} 35%, transparent)` : 'none',
        opacity: ghost ? 0.95 : 1, zIndex: ghost ? 5 : selected ? 4 : 1,
      }}>
      {canEdit && <div style={{ ...handle, top: 0 }} onPointerDown={e => onBegin(e, 'top')} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ink3)' }}>
        <span>{fmtRange(start, end)}</span>
        {draft && <span style={{ textTransform: 'uppercase', letterSpacing: '0.4px', fontSize: '9.5px' }}>Draft</span>}
        {p.s.konfhub_session_id && <span title="Linked to KonfHub" style={{ fontSize: '9.5px', opacity: 0.8 }}>⇄ KonfHub</span>}
        {(clash || speakerClash?.length) && <span title={clash ? 'Overlaps another session on this stage' : `Speaker double-booked: ${[...new Set(speakerClash)].join(', ')}`} style={{ color: clash ? 'var(--red)' : 'var(--amber)' }}>⚠</span>}
      </div>
      <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.25, marginTop: compact ? 0 : 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: 'vertical' }}>{p.s.title}</div>
      {!compact && speakers && speakers.length > 0 && (
        <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{speakers.join(' · ')}</div>
      )}
      {canEdit && <div style={{ ...handle, bottom: 0 }} onPointerDown={e => onBegin(e, 'bottom')} />}
    </div>
  )
}
