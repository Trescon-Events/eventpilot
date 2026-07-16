'use client'

import { useState, useEffect, use, useMemo } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
type Task = {
  id: string
  department: string
  workstream: string | null
  title: string
  status: 'not_started' | 'in_progress' | 'done' | 'overdue'
  priority: 'low' | 'normal' | 'high' | 'critical'
  due_date: string | null
  completed_at: string | null
  depends_on: string | null
  notes: string | null
  sort_order: number
  owner: { id: string; name: string; department: string } | null
}

type Event = {
  id: string; name: string; type: string; status: string
  event_date: string | null; city: string | null; venue: string | null
  client_name: string | null
}

type StaffMember = { id: string; name: string; department: string }

type AIAnalysis = {
  health: 'on_track' | 'at_risk' | 'critical'
  health_summary: string
  top_priorities: { task: string; department: string; reason: string }[]
  risk_flags: { type: string; title: string; department: string; impact: string; action: string }[]
  department_insights: { department: string; status: string; insight: string }[]
  ai_recommendation: string
  stats: { total: number; done: number; inProg: number; overdue: number; blocked: number; critical: number; pct: number }
  generated_at: string
  fallback?: boolean
}

// ── Design ────────────────────────────────────────────────────────────────────
const BG      = '#E8EEF4'
const SURFACE = '#FFFFFF'
const ACCENT  = '#C0F43C'
const DARK    = '#0F1923'
const MUTED   = '#5B7080'
const BORDER  = '#DDE8EE'

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626',
  high:     '#D97706',
  normal:   '#2D3E50',
  low:      '#94A3B8',
}
const PRIORITY_BG: Record<string, string> = {
  critical: 'rgba(220,38,38,0.1)',
  high:     'rgba(217,119,6,0.1)',
  normal:   'rgba(45,62,80,0.06)',
  low:      'rgba(148,163,184,0.1)',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: '#94A3B8',
  in_progress: '#D97706',
  done:        '#16A34A',
  overdue:     '#DC2626',
}
const STATUS_BG: Record<string, string> = {
  not_started: 'rgba(148,163,184,0.1)',
  in_progress: 'rgba(217,119,6,0.1)',
  done:        'rgba(22,163,74,0.1)',
  overdue:     'rgba(220,38,38,0.1)',
}
const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  done:        'Done',
  overdue:     'Overdue',
}

const DEPT_COLORS: Record<string, string> = {
  'Production':        '#6366F1',
  'Marketing':         '#EC4899',
  'Branding':          '#8B5CF6',
  'Sales':             '#0EA5E9',
  'Customer Success':  '#10B981',
  'Operations':        '#F59E0B',
  'Partnerships':      '#14B8A6',
  'Tech/Data':         '#6366F1',
  'Finance':           '#22C55E',
  'Legal':             '#94A3B8',
  'HR':                '#F97316',
  'Program Director':  '#C0F43C',
}

function deptColor(dept: string) { return DEPT_COLORS[dept] ?? '#64748B' }

const ALL_STATUSES = ['not_started', 'in_progress', 'done', 'overdue'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(task: Task) {
  return task.due_date && task.status !== 'done' && task.due_date < new Date().toISOString().slice(0, 10)
}

// ── Components ────────────────────────────────────────────────────────────────
function PriorityBadge({ p }: { p: string }) {
  return (
    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '6px', background: PRIORITY_BG[p], color: PRIORITY_COLOR[p] }}>
      {p}
    </span>
  )
}

function StatusBadge({ s, small }: { s: string; small?: boolean }) {
  return (
    <span style={{ fontSize: small ? '10px' : '11px', fontWeight: 700, padding: small ? '2px 7px' : '3px 9px', borderRadius: '8px', background: STATUS_BG[s] ?? 'rgba(148,163,184,0.1)', color: STATUS_COLOR[s] ?? MUTED, whiteSpace: 'nowrap' }}>
      {STATUS_LABEL[s] ?? s}
    </span>
  )
}

// ── Kanban card ───────────────────────────────────────────────────────────────
function KanbanCard({ task, blocked, onEdit }: { task: Task; blocked: boolean; onEdit: (t: Task) => void }) {
  const overdue = isOverdue(task)
  const col = deptColor(task.department)

  return (
    <div
      onClick={() => onEdit(task)}
      style={{
        background: SURFACE, borderRadius: '12px', padding: '14px',
        border: `1px solid ${blocked ? 'rgba(220,38,38,0.3)' : BORDER}`,
        borderLeft: `3px solid ${col}`,
        cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.1s',
        opacity: blocked ? 0.8 : 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: '8px',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      {/* Blocked banner */}
      {blocked && (
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', borderRadius: '6px', padding: '3px 8px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          🔒 Blocked — waiting on: <em style={{ fontStyle: 'normal', fontWeight: 800 }}>{task.depends_on}</em>
        </div>
      )}

      {/* Title */}
      <div style={{ fontSize: '13px', fontWeight: 700, color: DARK, marginBottom: '8px', lineHeight: 1.3 }}>{task.title}</div>

      {/* Dept + workstream */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: col + '18', color: col }}>
          {task.department}
        </span>
        {task.workstream && (
          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', background: 'rgba(0,0,0,0.05)', color: MUTED }}>
            {task.workstream}
          </span>
        )}
        <PriorityBadge p={task.priority} />
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: MUTED, fontWeight: 600 }}>
          {task.owner?.name ?? 'Unassigned'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {task.due_date && (
            <span style={{ fontSize: '11px', fontWeight: 700, color: overdue ? '#DC2626' : MUTED }}>
              {overdue ? '⚠ ' : ''}{fmtDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Edit task modal ───────────────────────────────────────────────────────────
function EditModal({ task, staff, onClose, onSave, onStatusChange }: {
  task: Task
  staff: StaffMember[]
  onClose: () => void
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>
  onStatusChange: (id: string, status: string) => void
}) {
  const [status,   setStatus]   = useState(task.status)
  const [priority, setPriority] = useState(task.priority)
  const [dueDate,  setDueDate]  = useState(task.due_date ?? '')
  const [ownerId,  setOwnerId]  = useState(task.owner?.id ?? '')
  const [notes,    setNotes]    = useState(task.notes ?? '')
  const [saving,   setSaving]   = useState(false)

  const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: SURFACE, color: DARK, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }

  async function save() {
    setSaving(true)
    await onSave(task.id, { status, priority, due_date: dueDate || null, owner_id: ownerId || null, notes: notes || null })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: SURFACE, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '520px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: deptColor(task.department) + '20', color: deptColor(task.department) }}>{task.department}</span>
              {task.workstream && <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', background: 'rgba(0,0,0,0.06)', color: MUTED }}>{task.workstream}</span>}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, lineHeight: 1.3 }}>{task.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '18px', padding: '2px', flexShrink: 0 }}>✕</button>
        </div>

        {/* Dependency info */}
        {task.depends_on && (
          <div style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px', fontSize: '12px', color: '#D97706' }}>
            Depends on: <strong>{task.depends_on}</strong>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
          {/* Quick status buttons */}
          <div>
            <label style={lbl}>Status</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {ALL_STATUSES.map(s => (
                <button key={s} onClick={() => setStatus(s)} style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                  border: `2px solid ${status === s ? STATUS_COLOR[s] : BORDER}`,
                  background: status === s ? STATUS_BG[s] : SURFACE,
                  color: status === s ? STATUS_COLOR[s] : MUTED,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Task['priority'])} style={inp}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp} />
            </div>
          </div>

          <div>
            <label style={lbl}>Owner</label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)} style={inp}>
              <option value="">Unassigned</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} — {s.department}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add notes…" style={{ ...inp, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: '10px', background: ACCENT, color: DARK, fontSize: '13px', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Panel ──────────────────────────────────────────────────────────────────
function AIPanel({ analysis, onClose }: { analysis: AIAnalysis; onClose: () => void }) {
  const healthColor = { on_track: '#16A34A', at_risk: '#D97706', critical: '#DC2626' }[analysis.health]
  const healthBg    = { on_track: 'rgba(22,163,74,0.08)', at_risk: 'rgba(217,119,6,0.08)', critical: 'rgba(220,38,38,0.08)' }[analysis.health]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '0' }}>
      <div style={{ background: SURFACE, width: '420px', height: '100vh', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 20px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: SURFACE, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED }}>AI Analysis</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '16px' }}>✕</button>
          </div>

          {/* Health indicator */}
          <div style={{ background: healthBg, border: `1px solid ${healthColor}30`, borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: healthColor, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
              {analysis.health.replace('_', ' ')}
            </div>
            <div style={{ fontSize: '13px', color: DARK, fontWeight: 600, lineHeight: 1.4 }}>{analysis.health_summary}</div>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '12px' }}>
            {[
              { label: 'Done', val: `${analysis.stats.pct}%`, color: '#16A34A' },
              { label: 'Blocked', val: analysis.stats.blocked, color: '#DC2626' },
              { label: 'Overdue', val: analysis.stats.overdue, color: '#D97706' },
            ].map(s => (
              <div key={s.label} style={{ background: BG, borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top priorities */}
          {analysis.top_priorities.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>Top Priorities</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analysis.top_priorities.map((p, i) => (
                  <div key={i} style={{ background: BG, borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: ACCENT, flexShrink: 0, marginTop: '1px' }}>{i + 1}</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: DARK, marginBottom: '3px' }}>{p.task}</div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{p.department} · {p.reason}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk flags */}
          {analysis.risk_flags.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>Risk Flags</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analysis.risk_flags.map((r, i) => (
                  <div key={i} style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
                      {r.type.replace('_', ' ')} · {r.department}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: DARK, marginBottom: '4px' }}>{r.title}</div>
                    <div style={{ fontSize: '11px', color: '#DC2626', marginBottom: '6px' }}>Impact: {r.impact}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#D97706' }}>→ {r.action}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Department insights */}
          {analysis.department_insights.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>By Department</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {analysis.department_insights.map((d, i) => {
                  const sc = { on_track: '#16A34A', at_risk: '#D97706', critical: '#DC2626' }[d.status] ?? MUTED
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: BG, borderRadius: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc, flexShrink: 0, marginTop: '4px' }} />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: DARK }}>{d.department}</div>
                        <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{d.insight}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI recommendation */}
          <div style={{ background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#3D6B00', marginBottom: '8px' }}>AI Recommendation</div>
            <div style={{ fontSize: '13px', color: DARK, lineHeight: 1.5 }}>{analysis.ai_recommendation}</div>
          </div>

          <div style={{ fontSize: '11px', color: MUTED, textAlign: 'center' }}>
            Generated {new Date(analysis.generated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            {analysis.fallback && ' (AI unavailable — computed analysis)'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EventPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [event,     setEvent]     = useState<Event | null>(null)
  const [tasks,     setTasks]     = useState<Task[]>([])
  const [staff,     setStaff]     = useState<StaffMember[]>([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState<'kanban' | 'table'>('kanban')

  // Filters
  const [deptFilter,   setDeptFilter]   = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [prioFilter,   setPrioFilter]   = useState('')

  // Modals
  const [editTask,     setEditTask]     = useState<Task | null>(null)
  const [analysis,     setAnalysis]     = useState<AIAnalysis | null>(null)
  const [analyzing,    setAnalyzing]    = useState(false)
  const [seeding,      setSeeding]      = useState(false)
  const [seedMsg,      setSeedMsg]      = useState('')
  const [msg,          setMsg]          = useState('')

  // Load data
  async function loadAll() {
    const [evRes, clRes, stRes] = await Promise.all([
      fetch(`/api/events?id=${eventId}`),
      fetch(`/api/events/checklist?event_id=${eventId}`),
      fetch('/api/staff-list'),
    ])
    const evData = await evRes.json()
    const clData = await clRes.json()
    const stData = await stRes.json()

    setEvent(Array.isArray(evData) ? evData[0] ?? null : evData)
    setTasks(Array.isArray(clData) ? clData : [])
    setStaff(Array.isArray(stData) ? stData : [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [eventId])

  // Compute blocked tasks
  const doneTitles = useMemo(() => new Set(tasks.filter(t => t.status === 'done').map(t => t.title)), [tasks])
  const isBlocked  = (t: Task) => !!(t.depends_on && !doneTitles.has(t.depends_on) && t.status !== 'done')

  // Departments
  const departments = useMemo(() => [...new Set(tasks.map(t => t.department))].sort(), [tasks])

  // Filtered tasks
  const filtered = useMemo(() => tasks.filter(t => {
    if (deptFilter   && t.department !== deptFilter) return false
    if (prioFilter   && t.priority   !== prioFilter) return false
    if (searchFilter) {
      const q = searchFilter.toLowerCase()
      if (!t.title.toLowerCase().includes(q) && !(t.workstream ?? '').toLowerCase().includes(q)) return false
    }
    return true
  }), [tasks, deptFilter, prioFilter, searchFilter])

  // Stats
  const total   = tasks.length
  const done    = tasks.filter(t => t.status === 'done').length
  const blocked = tasks.filter(t => isBlocked(t)).length
  const overdue = tasks.filter(t => isOverdue(t)).length
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0

  // Seed from template
  async function seedFromTemplate() {
    setSeeding(true); setSeedMsg('')
    const res  = await fetch('/api/events/checklist/from-template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, replace: tasks.length > 0 }),
    })
    const data = await res.json()
    if (data.error) {
      setSeedMsg(`Error: ${data.error}`)
    } else {
      setSeedMsg(`✓ ${data.tasks_created} tasks loaded across ${data.departments} departments`)
      loadAll()
    }
    setSeeding(false)
  }

  // AI analysis
  async function runAnalysis() {
    setAnalyzing(true)
    const res  = await fetch('/api/events/checklist/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    })
    const data = await res.json()
    if (!data.error) setAnalysis(data)
    else setMsg(`Analysis failed: ${data.error}`)
    setAnalyzing(false)
  }

  // Save task
  async function saveTask(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/events/checklist?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setEditTask(null)
    loadAll()
  }

  // Quick status change
  async function quickStatus(id: string, status: string) {
    await fetch(`/api/events/checklist?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(status === 'done' ? { completed_at: new Date().toISOString() } : { completed_at: null }) }),
    })
    loadAll()
  }

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, system-ui, sans-serif', background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: DARK, fontSize: '13px' }}>Loading planning board…</div>
    </div>
  )

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, system-ui, sans-serif', background: BG, minHeight: '100vh', color: DARK }}>

      {/* ── Nav ── */}
      <nav style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: '0 32px', height: '60px', display: 'flex', alignItems: 'center', gap: '14px', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href={`/admin/events/${eventId}`} style={{ fontSize: '13px', color: DARK, textDecoration: 'none' }}>{event?.name ?? 'Event'}</Link>
        <span style={{ color: MUTED }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: 800 }}>Planning Board</span>
        <div style={{ flex: 1 }} />

        {msg && <span style={{ fontSize: '12px', color: '#DC2626' }}>{msg}</span>}
        {seedMsg && <span style={{ fontSize: '12px', color: '#16A34A' }}>{seedMsg}</span>}

        {/* View toggle */}
        <div style={{ display: 'flex', gap: '2px', background: BG, borderRadius: '8px', padding: '3px' }}>
          {(['kanban', 'table'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px', borderRadius: '6px', border: 'none',
              background: view === v ? SURFACE : 'transparent',
              color: view === v ? DARK : MUTED, fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
              {v === 'kanban' ? '⬛ Kanban' : '≡ Table'}
            </button>
          ))}
        </div>

        <button onClick={seedFromTemplate} disabled={seeding} style={{
          padding: '8px 16px', borderRadius: '8px',
          background: seeding ? BG : 'rgba(192,244,60,0.15)',
          border: `1px solid ${seeding ? BORDER : 'rgba(192,244,60,0.4)'}`,
          color: seeding ? MUTED : '#3D6B00',
          fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {seeding ? 'Loading…' : tasks.length > 0 ? '↺ Reload Template' : '+ Load from Template'}
        </button>

        <button onClick={runAnalysis} disabled={analyzing || tasks.length === 0} style={{
          padding: '8px 18px', borderRadius: '8px',
          background: analyzing ? BG : DARK, border: 'none',
          color: analyzing ? MUTED : SURFACE,
          fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ fontSize: '14px' }}>⚡</span>
          {analyzing ? 'Analyzing…' : 'AI Analyze'}
        </button>
      </nav>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 32px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00695C', marginBottom: '4px' }}>Event Planning Board</div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: DARK, margin: '0 0 8px', letterSpacing: '-0.5px' }}>{event?.name}</h1>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {event?.city && <span style={{ fontSize: '13px', color: MUTED }}>{event.city}</span>}
            {event?.event_date && <span style={{ fontSize: '13px', color: MUTED }}>{new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
            {event?.client_name && <span style={{ fontSize: '13px', color: MUTED }}>{event.client_name}</span>}
          </div>
        </div>

        {/* ── Progress bar + stats ── */}
        {total > 0 && (
          <div style={{ background: SURFACE, borderRadius: '16px', padding: '20px 24px', marginBottom: '20px', border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '36px', fontWeight: 900, color: DARK, lineHeight: 1 }}>{pct}%</div>
                <div style={{ fontSize: '11px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Complete</div>
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ height: '8px', background: BG, borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? '#16A34A' : pct >= 50 ? '#D97706' : ACCENT, borderRadius: '4px', transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: '11px', color: MUTED, marginTop: '6px' }}>{done} of {total} tasks done</div>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[
                  { label: 'In Progress', val: tasks.filter(t => t.status === 'in_progress').length, color: '#D97706' },
                  { label: 'Blocked',     val: blocked, color: '#DC2626' },
                  { label: 'Overdue',     val: overdue, color: '#DC2626' },
                  { label: 'Critical',    val: tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length, color: '#DC2626' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: s.val > 0 ? s.color : BORDER }}>{s.val}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-department progress */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px' }}>
              {departments.map(dept => {
                const dtasks  = tasks.filter(t => t.department === dept)
                const ddone   = dtasks.filter(t => t.status === 'done').length
                const dpct    = Math.round((ddone / dtasks.length) * 100)
                const col     = deptColor(dept)
                return (
                  <button key={dept} onClick={() => setDeptFilter(deptFilter === dept ? '' : dept)} style={{
                    padding: '8px 10px', borderRadius: '8px', textAlign: 'left',
                    border: `2px solid ${deptFilter === dept ? col : BORDER}`,
                    background: deptFilter === dept ? col + '10' : BG,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: col, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dept}</div>
                    <div style={{ height: '4px', background: BORDER, borderRadius: '2px', overflow: 'hidden', marginBottom: '3px' }}>
                      <div style={{ height: '100%', width: `${dpct}%`, background: col, borderRadius: '2px' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: MUTED, fontWeight: 600 }}>{ddone}/{dtasks.length} done</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {total === 0 && (
          <div style={{ background: SURFACE, borderRadius: '20px', padding: '60px', textAlign: 'center', border: `2px dashed ${BORDER}` }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: DARK, marginBottom: '8px' }}>No tasks yet</div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '24px' }}>Load the master template to get all 61 tasks across 12 departments instantly.</div>
            <button onClick={seedFromTemplate} disabled={seeding} style={{
              padding: '14px 32px', borderRadius: '12px', background: ACCENT,
              border: 'none', color: DARK, fontSize: '14px', fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {seeding ? 'Loading…' : '+ Load from Template (61 tasks)'}
            </button>
          </div>
        )}

        {/* ── Filters ── */}
        {total > 0 && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '260px' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: MUTED, fontSize: '14px', pointerEvents: 'none' }}>⌕</span>
              <input placeholder="Search tasks…" value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
                style={{ padding: '8px 12px 8px 28px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: SURFACE, color: DARK, width: '100%', boxSizing: 'border-box' as const }} />
            </div>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${deptFilter ? '#6366F1' : BORDER}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: SURFACE, color: DARK }}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={prioFilter} onChange={e => setPrioFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${prioFilter ? PRIORITY_COLOR[prioFilter] : BORDER}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: SURFACE, color: DARK }}>
              <option value="">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            {(deptFilter || prioFilter || searchFilter) && (
              <button onClick={() => { setDeptFilter(''); setPrioFilter(''); setSearchFilter('') }}
                style={{ padding: '8px 14px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: SURFACE, fontSize: '12px', color: MUTED, cursor: 'pointer', fontFamily: 'inherit' }}>
                Clear
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', color: MUTED, fontWeight: 600 }}>{filtered.length} tasks</span>
          </div>
        )}

        {/* ── Kanban view ── */}
        {view === 'kanban' && total > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', alignItems: 'start' }}>
            {ALL_STATUSES.map(status => {
              const col      = STATUS_COLOR[status]
              const colTasks = filtered.filter(t => {
                if (status === 'overdue') return isOverdue(t) && t.status !== 'done'
                if (status === 'not_started') return t.status === 'not_started' && !isOverdue(t)
                return t.status === status && !isOverdue(t)
              })
              return (
                <div key={status}>
                  {/* Column header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '0 4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: DARK, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{STATUS_LABEL[status]}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: MUTED, marginLeft: 'auto' }}>{colTasks.length}</span>
                  </div>
                  {/* Cards */}
                  <div>
                    {colTasks.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '12px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px', border: `1px dashed ${BORDER}` }}>
                        No tasks
                      </div>
                    ) : (
                      colTasks.map(t => (
                        <KanbanCard key={t.id} task={t} blocked={isBlocked(t)} onEdit={setEditTask} />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Table view ── */}
        {view === 'table' && total > 0 && (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}`, background: BG }}>
                  {['Department', 'Workstream', 'Task', 'Priority', 'Status', 'Owner', 'Due', 'Depends On', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const blocked = isBlocked(t)
                  const overdue = isOverdue(t)
                  return (
                    <tr key={t.id} style={{
                      borderBottom: i < filtered.length - 1 ? `1px solid ${BORDER}` : 'none',
                      background: blocked ? 'rgba(220,38,38,0.03)' : i % 2 === 0 ? SURFACE : BG,
                    }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: deptColor(t.department) + '18', color: deptColor(t.department), whiteSpace: 'nowrap' }}>
                          {t.department}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: MUTED }}>{t.workstream ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: DARK }}>{t.title}</div>
                        {blocked && <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>🔒 Blocked by: {t.depends_on}</div>}
                      </td>
                      <td style={{ padding: '10px 14px' }}><PriorityBadge p={t.priority} /></td>
                      <td style={{ padding: '10px 14px' }}>
                        <select value={overdue && t.status !== 'done' ? 'overdue' : t.status}
                          onChange={e => quickStatus(t.id, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: '8px', border: `1px solid ${STATUS_COLOR[overdue && t.status !== 'done' ? 'overdue' : t.status]}40`, fontSize: '11px', fontWeight: 700, color: STATUS_COLOR[overdue && t.status !== 'done' ? 'overdue' : t.status], background: STATUS_BG[overdue && t.status !== 'done' ? 'overdue' : t.status], fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                          {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: MUTED }}>{t.owner?.name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: overdue ? '#DC2626' : MUTED, whiteSpace: 'nowrap' }}>
                        {t.due_date ? (overdue ? '⚠ ' : '') + fmtDate(t.due_date) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '11px', color: MUTED, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.depends_on ? <span style={{ color: blocked ? '#DC2626' : MUTED }}>{blocked ? '🔒 ' : '✓ '}{t.depends_on}</span> : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => setEditTask(t)}
                          style={{ padding: '4px 10px', borderRadius: '7px', border: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: 700, color: MUTED, background: SURFACE, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {editTask && (
        <EditModal task={editTask} staff={staff} onClose={() => setEditTask(null)} onSave={saveTask} onStatusChange={quickStatus} />
      )}

      {/* ── AI panel ── */}
      {analysis && <AIPanel analysis={analysis} onClose={() => setAnalysis(null)} />}
    </div>
  )
}
