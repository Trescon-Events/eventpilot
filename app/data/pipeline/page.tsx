'use client'

import { useState, useEffect, useCallback } from 'react'

interface PipelineEntry {
  id:              string
  contact_id:      string
  event_id?:       string | null
  event_name?:     string | null
  stage:           string
  assigned_to?:    string | null
  notes?:          string | null
  next_action_date?: string | null
  updated_at:      string
  sd_contact_records?: {
    property_values: Record<string, string>
    linkedin_url?:   string | null
  } | null
}

const STAGES = [
  { key: 'prospect',  label: 'Prospect',  color: '#9CA3AF', bg: 'rgba(156,163,175,0.08)' },
  { key: 'contacted', label: 'Contacted', color: '#FBBF24', bg: 'rgba(251,191,36,0.08)'  },
  { key: 'interested',label: 'Interested',color: '#60A5FA', bg: 'rgba(96,165,250,0.08)'  },
  { key: 'confirmed', label: 'Confirmed', color: '#34D399', bg: 'rgba(52,211,153,0.08)'  },
  { key: 'declined',  label: 'Declined',  color: '#F87171', bg: 'rgba(248,113,113,0.08)' },
  { key: 'vendor',    label: 'Vendor',    color: '#A78BFA', bg: 'rgba(167,139,250,0.08)' },
]

function contactName(rec?: PipelineEntry['sd_contact_records'] | null): string {
  if (!rec) return 'Unknown'
  const pv = rec.property_values ?? {}
  const f  = pv.firstName ?? pv.first_name ?? ''
  const l  = pv.lastName  ?? pv.last_name  ?? ''
  return [f, l].filter(Boolean).join(' ') || pv.email?.split('@')[0] || 'Unknown'
}

function contactSub(rec?: PipelineEntry['sd_contact_records'] | null): string {
  if (!rec) return ''
  const pv = rec.property_values ?? {}
  const title   = pv.title ?? pv.job_title ?? ''
  const company = pv.company ?? pv.organization ?? ''
  return [title, company].filter(Boolean).join(' · ')
}

export default function PipelinePage() {
  const [entries,  setEntries]  = useState<PipelineEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [moving,   setMoving]   = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const url = eventFilter
      ? `/api/data/pipeline?event_id=${encodeURIComponent(eventFilter)}`
      : '/api/data/pipeline'
    const data = await fetch(url).then(r => r.json()).catch(() => [])
    setEntries(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [eventFilter])

  useEffect(() => { load() }, [load])

  async function moveStage(id: string, stage: string) {
    setMoving(id)
    await fetch('/api/data/pipeline', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, stage }),
    })
    setEntries(prev => prev.map(e => e.id === id ? { ...e, stage } : e))
    setMoving(null)
  }

  // Group entries by stage
  const byStage = Object.fromEntries(STAGES.map(s => [s.key, [] as PipelineEntry[]]))
  for (const e of entries) {
    const stage = e.stage in byStage ? e.stage : 'prospect'
    byStage[stage].push(e)
  }

  function onDragStart(id: string) { setDragging(id) }
  function onDragEnd() { setDragging(null); setDragOver(null) }
  function onDragOver(e: React.DragEvent, stage: string) {
    e.preventDefault()
    setDragOver(stage)
  }
  function onDrop(e: React.DragEvent, stage: string) {
    e.preventDefault()
    if (dragging && dragging !== stage) {
      const entry = entries.find(x => x.id === dragging)
      if (entry && entry.stage !== stage) moveStage(dragging, stage)
    }
    setDragging(null)
    setDragOver(null)
  }

  const totalContacts = entries.length

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Pipeline</span>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>{totalContacts} contacts across {STAGES.length} stages</span>
        <div style={{ flex: 1 }} />
        <input
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          placeholder="Filter by event ID…"
          style={{ padding: '6px 12px', border: '1px solid #DDE8EE', borderRadius: '8px', fontSize: '13px', color: '#0F1923', background: '#F8FAFB', outline: 'none', width: '200px' }}
        />
        <button
          onClick={load}
          style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', fontSize: '13px', color: '#6B7280', cursor: 'pointer', fontWeight: 600 }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '64px', textAlign: 'center', color: '#9CA3AF', fontSize: '15px' }}>Loading pipeline…</div>
      ) : (
        <div style={{ padding: '20px', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, 260px)`, gap: '12px', minWidth: `${STAGES.length * 272}px` }}>
            {STAGES.map(stage => {
              const cards   = byStage[stage.key] ?? []
              const isOver  = dragOver === stage.key
              return (
                <div
                  key={stage.key}
                  onDragOver={e => onDragOver(e, stage.key)}
                  onDrop={e => onDrop(e, stage.key)}
                  style={{
                    background:   isOver ? 'rgba(0,165,163,0.04)' : stage.bg,
                    border:       isOver ? '1.5px dashed #00A5A3' : `1px solid ${stage.color}22`,
                    borderRadius: '14px',
                    minHeight:    '400px',
                    transition:   'border 0.15s, background 0.15s',
                  }}
                >
                  {/* Column header */}
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${stage.color}22`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: stage.color, textTransform: 'uppercase', letterSpacing: '1px' }}>{stage.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700, color: '#9CA3AF' }}>{cards.length}</span>
                  </div>

                  {/* Cards */}
                  <div style={{ padding: '10px 10px' }}>
                    {cards.length === 0 && (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: '#C4CDD6', fontSize: '12px' }}>No contacts</div>
                    )}
                    {cards.map(entry => (
                      <PipelineCard
                        key={entry.id}
                        entry={entry}
                        stages={STAGES}
                        moving={moving === entry.id}
                        onMove={stage => moveStage(entry.id, stage)}
                        onDragStart={() => onDragStart(entry.id)}
                        onDragEnd={onDragEnd}
                        dragging={dragging === entry.id}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function PipelineCard({
  entry, stages, moving, onMove, onDragStart, onDragEnd, dragging,
}: {
  entry:       PipelineEntry
  stages:      typeof STAGES
  moving:      boolean
  onMove:      (stage: string) => void
  onDragStart: () => void
  onDragEnd:   () => void
  dragging:    boolean
}) {
  const [open, setOpen] = useState(false)
  const name = contactName(entry.sd_contact_records)
  const sub  = contactSub(entry.sd_contact_records)
  const pv   = entry.sd_contact_records?.property_values ?? {}

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background:   '#FFFFFF',
        border:       '1px solid #DDE8EE',
        borderRadius: '10px',
        padding:      '12px',
        marginBottom: '8px',
        cursor:       moving ? 'wait' : 'grab',
        opacity:      dragging ? 0.4 : 1,
        transition:   'box-shadow 0.12s, opacity 0.12s',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* Name + event */}
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '2px' }}>{name}</div>
      {sub && <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      {entry.event_name && (
        <div style={{ fontSize: '11px', color: '#00A5A3', marginBottom: '6px' }}>{entry.event_name}</div>
      )}

      {/* Email */}
      {pv.email && (
        <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pv.email}</div>
      )}

      {/* Meta */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {entry.assigned_to && (
          <span style={{ fontSize: '10px', color: '#9CA3AF', background: '#F8FAFB', border: '1px solid #DDE8EE', padding: '1px 6px', borderRadius: '6px' }}>{entry.assigned_to}</span>
        )}
        {entry.next_action_date && (
          <span style={{ fontSize: '10px', color: '#FBBF24' }}>
            {new Date(entry.next_action_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </span>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '2px', display: 'flex', alignItems: 'center' }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
          </svg>
        </button>
      </div>

      {/* Move controls (expand) */}
      {open && !moving && (
        <div style={{ marginTop: '10px', borderTop: '1px solid #DDE8EE', paddingTop: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Move to</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {stages.map(s => (
              <button
                key={s.key}
                onClick={() => { onMove(s.key); setOpen(false) }}
                style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                  background: `${s.color}18`, color: s.color,
                  border: 'none', cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
