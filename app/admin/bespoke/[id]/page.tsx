'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */
type DelegateStats = { total: number; registered: number; attended: number }

type BespokeProject = {
  id: string; title: string; client_company: string; format: string
  event_date: string | null; event_time: string | null; phase: string
  city: string | null; venue: string | null
  target_delegate_count: number; contract_value: number
  brief_status: string; brief_data: Record<string, unknown> | null
  client_contact_name: string | null; client_contact_email: string | null; client_contact_phone: string | null
  commercial_lead: { id: string; name: string } | null
  marketing_lead: { id: string; name: string } | null
  delegate_lead: { id: string; name: string } | null
  operations_lead: { id: string; name: string } | null
  design_lead: { id: string; name: string } | null
  delegate_stats: DelegateStats
  created_at: string; updated_at: string
}

type BespokeTask = {
  id: string; title: string; description: string | null; phase: number
  week_number: number | null; assigned_to: string | null; assigned_role: string
  due_date: string | null; status: string; sort_order: number
  assigned_staff: { id: string; name: string } | null
}

type BespokeDelegate = {
  id: string; name: string; company: string | null; title: string | null
  industry: string | null; email: string | null; phone: string | null
  linkedin_url: string | null; source: string; priority: string
  stage: string; notes: string | null; last_contact_date: string | null
  created_at: string
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */
const PHASES = [
  { key: 'initiation', label: 'Initiation', num: 1 },
  { key: 'campaign', label: 'Campaign', num: 2 },
  { key: 'live', label: 'Live', num: 3 },
  { key: 'closure', label: 'Closure', num: 4 },
]

const PHASE_NUM_MAP: Record<string, number> = { initiation: 1, campaign: 2, live: 3, closure: 4, completed: 4 }

const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  commercial: { bg: '#FFF8E1', fg: '#B45309' },
  marketing: { bg: '#E3F2FD', fg: '#1565C0' },
  delegate: { bg: '#E8F5E9', fg: '#2E7D32' },
  operations: { bg: '#F3E5F5', fg: '#7B1FA2' },
  design: { bg: '#FCE4EC', fg: '#C62828' },
  production: { bg: '#ECEFF1', fg: '#546E7A' },
}

const STATUS_CYCLE: Record<string, string> = { pending: 'in_progress', in_progress: 'done', done: 'pending' }
const STATUS_LABELS: Record<string, string> = { pending: 'Pending', in_progress: 'In Progress', done: 'Done' }
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#F0F4F8', fg: '#5B7080' },
  in_progress: { bg: '#E0F2F1', fg: '#00695C' },
  done: { bg: '#E8F5E9', fg: '#2E7D32' },
}

const DELEGATE_STAGES = ['sourced', 'contacted', 'interested', 'registered', 'confirmed', 'attended']
const STAGE_LABELS: Record<string, string> = {
  sourced: 'Sourced', contacted: 'Contacted', interested: 'Interested',
  registered: 'Registered', confirmed: 'Confirmed', attended: 'Attended',
}
const STAGE_COLORS: Record<string, string> = {
  sourced: '#5B7080', contacted: '#1565C0', interested: '#B45309',
  registered: '#00695C', confirmed: '#2E7D32', attended: '#166534',
}

const SOURCE_LABELS: Record<string, string> = {
  client_wishlist: 'Client Wishlist', internal_db: 'Internal DB', linkedin: 'LinkedIn',
  referral: 'Referral', marketing: 'Marketing', other: 'Other',
}

const FORMAT_COLORS: Record<string, { bg: string; fg: string }> = {
  physical: { bg: '#E8F5E9', fg: '#2E7D32' },
  virtual: { bg: '#E3F2FD', fg: '#1565C0' },
  hybrid: { bg: '#F3E5F5', fg: '#7B1FA2' },
}

const TABS = ['Overview', 'Brief', 'Tasks', 'Pipeline', 'Assets'] as const
type TabKey = typeof TABS[number]

/* ═══════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */
function daysLeft(eventDate: string | null): number | null {
  if (!eventDate) return null
  return Math.ceil((new Date(eventDate).getTime() - Date.now()) / 86400000)
}

function fmtDate(d: string | null): string {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'done') return false
  return new Date(dueDate) < new Date(new Date().toISOString().split('T')[0])
}

/* ═══════════════════════════════════════════════════════════════════
   SVG ICONS
   ═══════════════════════════════════════════════════════════════════ */
function BackArrow() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CheckIcon({ checked }: { checked: boolean }) {
  if (!checked) return (
    <svg width="18" height="18" fill="none" stroke="#B8CDD8" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </svg>
  )
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#00695C" />
      <path d="M7 12.5l3 3 7-7" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PROGRESS BAR COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
function ProgressBar({ value, max, height = 8, color }: { value: number; max: number; height?: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ height, background: '#E8EEF4', borderRadius: height / 2, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color || (pct >= 80 ? '#2E7D32' : pct >= 50 ? '#00695C' : '#B45309'), borderRadius: height / 2, transition: 'width 0.4s ease' }} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function BespokeWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<BespokeProject | null>(null)
  const [tasks, setTasks] = useState<BespokeTask[]>([])
  const [delegates, setDelegates] = useState<BespokeDelegate[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('Overview')
  const [briefData, setBriefData] = useState<Record<string, unknown>>({})
  const [briefSaving, setBriefSaving] = useState(false)
  const [addTaskPhase, setAddTaskPhase] = useState<number | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [taskError, setTaskError] = useState<string | null>(null)
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null)
  const [briefSaveState, setBriefSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [showAddDelegate, setShowAddDelegate] = useState(false)
  const [newDelegate, setNewDelegate] = useState({ name: '', company: '', title: '', email: '', source: 'client_wishlist', notes: '' })

  /* ── Fetch project data ───────────────────────────────────────── */
  const loadProject = useCallback(() => {
    fetch('/api/bespoke')
      .then(r => r.json())
      .then(all => {
        if (Array.isArray(all)) {
          const p = all.find((x: BespokeProject) => x.id === id)
          if (p) {
            setProject(p)
            if (p.brief_data) setBriefData(p.brief_data)
          }
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  const loadTasks = useCallback(() => {
    return fetch(`/api/bespoke/tasks?project_id=${id}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTasks(d) })
      .catch(() => {})
  }, [id])

  const loadDelegates = useCallback(() => {
    fetch(`/api/bespoke/delegates?project_id=${id}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setDelegates(d) })
      .catch(() => {})
  }, [id])

  useEffect(() => { loadProject(); loadTasks(); loadDelegates() }, [loadProject, loadTasks, loadDelegates])

  /* ── Task status toggle ───────────────────────────────────────── */
  const toggleTaskStatus = async (task: BespokeTask) => {
    const newStatus = STATUS_CYCLE[task.status] || 'pending'
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
    await fetch('/api/bespoke/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    })
  }

  /* ── Add custom task ──────────────────────────────────────────── */
  const addTask = async (phase: number) => {
    if (!newTaskTitle.trim()) return
    setTaskError(null)
    const res = await fetch('/api/bespoke/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, title: newTaskTitle.trim(), phase }),
    })
    if (res.ok) {
      const created = await res.json().catch(() => null)
      setNewTaskTitle('')
      setAddTaskPhase(null)
      await loadTasks()
      // Brief highlight so the user sees exactly which row was added — the
      // list can be long enough that the new task lands off-screen otherwise.
      if (created?.id) {
        setFlashTaskId(created.id)
        setTimeout(() => setFlashTaskId(null), 1600)
      }
    } else {
      const err = await res.json().catch(() => ({}))
      setTaskError(err?.error || 'Failed to add task. Try again or refresh the page.')
    }
  }

  /* ── Update delegate stage ────────────────────────────────────── */
  const updateDelegateStage = async (delegateId: string, stage: string) => {
    setDelegates(prev => prev.map(d => d.id === delegateId ? { ...d, stage } : d))
    await fetch('/api/bespoke/delegates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: delegateId, stage }),
    })
  }

  /* ── Add delegate ─────────────────────────────────────────────── */
  const addDelegate = async () => {
    if (!newDelegate.name.trim()) return
    const res = await fetch('/api/bespoke/delegates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: id,
        name: newDelegate.name.trim(),
        company: newDelegate.company.trim() || null,
        title: newDelegate.title.trim() || null,
        email: newDelegate.email.trim() || null,
        source: newDelegate.source,
        notes: newDelegate.notes.trim() || null,
      }),
    })
    if (res.ok) {
      setNewDelegate({ name: '', company: '', title: '', email: '', source: 'client_wishlist', notes: '' })
      setShowAddDelegate(false)
      loadDelegates()
    }
  }

  /* ── Save brief ───────────────────────────────────────────────── */
  const saveBrief = async () => {
    setBriefSaving(true)
    setBriefSaveState('idle')
    try {
      const res = await fetch('/api/bespoke', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, brief_data: briefData, brief_status: 'in_progress' }),
      })
      if (res.ok) {
        setBriefSaveState('saved')
        // Auto-fade the confirmation after ~2.4s so the button stops advertising
        // a stale state.
        setTimeout(() => setBriefSaveState('idle'), 2400)
        loadProject()
      } else {
        setBriefSaveState('error')
      }
    } catch {
      setBriefSaveState('error')
    } finally {
      setBriefSaving(false)
    }
  }

  const startBrief = async () => {
    const initial = {
      event_objectives: { primary_goal: '', success_criteria: '', key_themes: '', desired_outcome: '' },
      icp: { job_titles: '', industries: '', company_size: '', geography: '', exclusions: '' },
      target_accounts: '',
      branding_notes: '',
      logistics_notes: '',
    }
    setBriefData(initial)
    await fetch('/api/bespoke', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, brief_data: initial, brief_status: 'in_progress' }),
    })
    loadProject()
  }

  /* ── Loading state ────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '15px', color: '#5B7080', fontFamily: 'var(--font-manrope)', fontWeight: 600 }}>Loading project...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '17px', color: '#0F1923', fontFamily: 'var(--font-manrope)', fontWeight: 700 }}>Project not found</div>
        <Link href="/admin/bespoke" style={{ fontSize: '14px', fontWeight: 600, color: '#00695C', textDecoration: 'none' }}>Back to Bespoke Tracker</Link>
      </div>
    )
  }

  const days = daysLeft(project.event_date)
  const fmtC = FORMAT_COLORS[project.format] || FORMAT_COLORS.physical
  const currentPhaseNum = PHASE_NUM_MAP[project.phase] || 1

  /* ── Delegate funnel counts ───────────────────────────────────── */
  const funnelCounts: Record<string, number> = {}
  DELEGATE_STAGES.forEach(s => { funnelCounts[s] = delegates.filter(d => d.stage === s).length })

  /* ── Recent task updates (for overview) ───────────────────────── */
  const recentTasks = [...tasks].filter(t => t.status !== 'pending').sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0)).slice(0, 5)

  const INPUT_STYLE: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #B8CDD8',
    fontSize: '14px', fontFamily: 'var(--font-manrope)', color: '#0F1923', background: '#FFFFFF', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope)' }}>
      {/* ═══ Dark Header ════════════════════════════════════════════ */}
      <div style={{ background: '#0F1923', padding: '20px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
          <Link href="/admin/bespoke" style={{ color: '#5B7080', display: 'flex', alignItems: 'center' }}>
            <BackArrow />
          </Link>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#FFFFFF', flex: 1 }}>{project.title}</h1>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', background: fmtC.bg, color: fmtC.fg }}>{project.format}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', paddingLeft: '34px' }}>
          <span style={{ fontSize: '14px', color: '#B8CDD8', fontWeight: 500 }}>{project.client_company}</span>
          <span style={{ fontSize: '13px', color: '#5B7080' }}>{fmtDate(project.event_date)}</span>
          {project.city && <span style={{ fontSize: '13px', color: '#5B7080' }}>{project.city}</span>}
          {days !== null && (
            <span style={{ fontSize: '13px', fontWeight: 700, color: days <= 7 ? '#EF4444' : days <= 14 ? '#F59E0B' : '#C0F43C' }}>
              {days > 0 ? `${days} days left` : days === 0 ? 'Event Day' : `${Math.abs(days)} days ago`}
            </span>
          )}
        </div>
      </div>

      {/* ═══ KPI Strip ══════════════════════════════════════════════ */}
      <div style={{ padding: '20px 32px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {/* Days Left */}
        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px', border: '1px solid #DDE8EE' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#5B7080', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Days Left</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: days !== null && days <= 7 ? '#DC2626' : '#0F1923' }}>{days ?? '--'}</div>
        </div>
        {/* Registrations */}
        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px', border: '1px solid #DDE8EE' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#5B7080', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Registrations</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F1923' }}>
            {project.delegate_stats.registered} <span style={{ fontSize: '16px', fontWeight: 600, color: '#5B7080' }}>/ {project.target_delegate_count}</span>
          </div>
          <ProgressBar value={project.delegate_stats.registered} max={project.target_delegate_count} height={4} />
        </div>
        {/* Contract Value */}
        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px', border: '1px solid #DDE8EE' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#5B7080', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contract Value</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F1923' }}>{fmtCurrency(project.contract_value)}</div>
        </div>
        {/* Phase */}
        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px', border: '1px solid #DDE8EE' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#5B7080', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phase</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#B45309', textTransform: 'capitalize' }}>{project.phase}</div>
        </div>
      </div>

      {/* ═══ Tab Bar ═════════════════════════════════════════════════ */}
      <div style={{ padding: '20px 32px 0', display: 'flex', gap: '4px', borderBottom: '1px solid #DDE8EE' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer',
            fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
            background: tab === t ? '#FFFFFF' : 'transparent',
            color: tab === t ? '#B45309' : '#5B7080',
            borderBottom: tab === t ? '2px solid #B45309' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      {/* ═══ Tab Content ═════════════════════════════════════════════ */}
      <div style={{ padding: '24px 32px 64px' }}>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
        {tab === 'Overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Phase Progress */}
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px', gridColumn: '1 / -1' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Phase Progress</h3>
              <div style={{ display: 'flex', gap: '4px' }}>
                {PHASES.map(p => (
                  <div key={p.key} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: '8px', borderRadius: '4px', marginBottom: '8px',
                      background: p.num <= currentPhaseNum ? '#B45309' : '#E8EEF4',
                      transition: 'background 0.3s',
                    }} />
                    <div style={{ fontSize: '12px', fontWeight: p.num === currentPhaseNum ? 800 : 600, color: p.num === currentPhaseNum ? '#B45309' : '#5B7080' }}>
                      {p.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Leads */}
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Team Leads</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { role: 'Commercial', person: project.commercial_lead },
                  { role: 'Marketing', person: project.marketing_lead },
                  { role: 'Delegate Acq.', person: project.delegate_lead },
                  { role: 'Operations', person: project.operations_lead },
                  { role: 'Design', person: project.design_lead },
                ].map(({ role, person }) => (
                  <div key={role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#5B7080' }}>{role}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: person ? '#0F1923' : '#B8CDD8' }}>{person?.name || 'Unassigned'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Quick Stats</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#5B7080' }}>Total Tasks</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{tasks.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#5B7080' }}>Completed Tasks</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#2E7D32' }}>{tasks.filter(t => t.status === 'done').length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#5B7080' }}>Overdue Tasks</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#DC2626' }}>{tasks.filter(t => isOverdue(t.due_date, t.status)).length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#5B7080' }}>Pipeline Delegates</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{delegates.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#5B7080' }}>Venue</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{project.venue || '--'}</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px', gridColumn: '1 / -1' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Recent Activity</h3>
              {recentTasks.length === 0 ? (
                <div style={{ fontSize: '14px', color: '#5B7080' }}>No task updates yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recentTasks.map(t => {
                    const sc = STATUS_COLORS[t.status] || STATUS_COLORS.pending
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F0F4F8' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: sc.bg, color: sc.fg }}>{STATUS_LABELS[t.status]}</span>
                        <span style={{ fontSize: '14px', color: '#0F1923', flex: 1 }}>{t.title}</span>
                        <span style={{ fontSize: '12px', color: '#5B7080' }}>Phase {t.phase}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BRIEF TAB ────────────────────────────────────────────── */}
        {tab === 'Brief' && (
          <div style={{ maxWidth: '800px' }}>
            {project.brief_status === 'pending' && !briefData.event_objectives ? (
              <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '48px', textAlign: 'center' }}>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F1923', marginBottom: '8px' }}>Client brief not started</div>
                <div style={{ fontSize: '15px', color: '#5B7080', marginBottom: '24px' }}>Start the brief to capture event objectives, ICP, and branding guidelines.</div>
                <button onClick={startBrief} style={{
                  padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#B45309', color: '#FFFFFF',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                }}>Start Client Brief</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Event Objectives */}
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#B45309' }}>Event Objectives</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {['primary_goal', 'success_criteria', 'key_themes', 'desired_outcome'].map(field => (
                      <div key={field}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px', textTransform: 'capitalize' }}>
                          {field.replace(/_/g, ' ')}
                        </label>
                        <textarea style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical' }}
                          value={((briefData.event_objectives as Record<string, string>) || {})[field] || ''}
                          onChange={e => setBriefData(prev => ({
                            ...prev,
                            event_objectives: { ...(prev.event_objectives as Record<string, string> || {}), [field]: e.target.value },
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* ICP */}
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#B45309' }}>Ideal Customer Profile (ICP)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {['job_titles', 'industries', 'company_size', 'geography', 'exclusions'].map(field => (
                      <div key={field} style={field === 'exclusions' ? { gridColumn: '1 / -1' } : {}}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px', textTransform: 'capitalize' }}>
                          {field.replace(/_/g, ' ')}
                        </label>
                        <textarea style={{ ...INPUT_STYLE, minHeight: '50px', resize: 'vertical' }}
                          value={((briefData.icp as Record<string, string>) || {})[field] || ''}
                          onChange={e => setBriefData(prev => ({
                            ...prev,
                            icp: { ...(prev.icp as Record<string, string> || {}), [field]: e.target.value },
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Target Accounts */}
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#B45309' }}>Target Accounts</h3>
                  <textarea style={{ ...INPUT_STYLE, minHeight: '100px', resize: 'vertical' }}
                    placeholder="Paste target accounts here (one per line or CSV format)"
                    value={(briefData.target_accounts as string) || ''}
                    onChange={e => setBriefData(prev => ({ ...prev, target_accounts: e.target.value }))}
                  />
                </div>

                {/* Branding */}
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#B45309' }}>Branding Notes</h3>
                  <textarea style={{ ...INPUT_STYLE, minHeight: '80px', resize: 'vertical' }}
                    placeholder="Client branding guidelines, color schemes, tone of voice..."
                    value={(briefData.branding_notes as string) || ''}
                    onChange={e => setBriefData(prev => ({ ...prev, branding_notes: e.target.value }))}
                  />
                </div>

                {/* Logistics */}
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#B45309' }}>Logistics Notes</h3>
                  <textarea style={{ ...INPUT_STYLE, minHeight: '80px', resize: 'vertical' }}
                    placeholder="Venue requirements, catering, AV needs, transport..."
                    value={(briefData.logistics_notes as string) || ''}
                    onChange={e => setBriefData(prev => ({ ...prev, logistics_notes: e.target.value }))}
                  />
                </div>

                {/* Save */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button onClick={saveBrief} disabled={briefSaving} style={{
                    padding: '10px 28px', borderRadius: '8px', border: 'none', background: briefSaving ? '#B8CDD8' : '#B45309',
                    color: '#FFFFFF', fontSize: '14px', fontWeight: 700, cursor: briefSaving ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-manrope)',
                  }}>
                    {briefSaving ? 'Saving...' : 'Save Brief'}
                  </button>
                  {briefSaveState === 'saved' && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 12px', borderRadius: '999px',
                      background: '#DCFCE7', color: '#166534',
                      fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
                    }}>
                      ✓ Saved
                    </span>
                  )}
                  {briefSaveState === 'error' && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 12px', borderRadius: '999px',
                      background: '#FEE2E2', color: '#991B1B',
                      fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
                    }}>
                      Couldn&rsquo;t save. Please retry.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TASKS TAB ────────────────────────────────────────────── */}
        {tab === 'Tasks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {[1, 2, 3, 4].map(phase => {
              const phaseTasks = tasks.filter(t => t.phase === phase)
              const doneCount = phaseTasks.filter(t => t.status === 'done').length
              return (
                <div key={phase} style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', overflow: 'hidden' }}>
                  {/* Phase header */}
                  <div style={{ padding: '16px 20px', background: '#F8FAFC', borderBottom: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923' }}>Phase {phase}: {PHASES[phase - 1]?.label}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#5B7080', background: '#E8EEF4', padding: '2px 8px', borderRadius: '10px' }}>
                        {doneCount}/{phaseTasks.length}
                      </span>
                    </div>
                    <button onClick={() => { setAddTaskPhase(addTaskPhase === phase ? null : phase); setNewTaskTitle('') }} style={{
                      display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '6px',
                      border: '1px solid #B8CDD8', background: '#FFFFFF', fontSize: '12px', fontWeight: 700,
                      color: '#5B7080', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                    }}>
                      <PlusIcon /> Add Task
                    </button>
                  </div>

                  {/* Tasks list */}
                  <div>
                    {phaseTasks.map(t => {
                      const rc = ROLE_COLORS[t.assigned_role] || ROLE_COLORS.commercial
                      const overdue = isOverdue(t.due_date, t.status)
                      return (
                        <div key={t.id} style={{
                          display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px',
                          borderBottom: '1px solid #F0F4F8',
                          background: flashTaskId === t.id ? '#FEF3C7' : (overdue ? '#FEF2F2' : 'transparent'),
                          transition: 'background 0.4s ease',
                        }}>
                          {/* Checkbox */}
                          <button onClick={() => toggleTaskStatus(t)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                            <CheckIcon checked={t.status === 'done'} />
                          </button>
                          {/* Title */}
                          <span style={{
                            flex: 1, fontSize: '14px', color: t.status === 'done' ? '#5B7080' : '#0F1923',
                            textDecoration: t.status === 'done' ? 'line-through' : 'none', fontWeight: 500,
                          }}>{t.title}</span>
                          {/* Role badge */}
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: rc.bg, color: rc.fg, textTransform: 'capitalize' }}>
                            {t.assigned_role}
                          </span>
                          {/* Due date */}
                          {t.due_date && (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: overdue ? '#DC2626' : '#5B7080', whiteSpace: 'nowrap' }}>
                              {fmtDate(t.due_date)}
                            </span>
                          )}
                          {/* Status toggle */}
                          <button onClick={() => toggleTaskStatus(t)} style={{
                            padding: '3px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
                            background: (STATUS_COLORS[t.status] || STATUS_COLORS.pending).bg,
                            color: (STATUS_COLORS[t.status] || STATUS_COLORS.pending).fg,
                          }}>
                            {STATUS_LABELS[t.status] || t.status}
                          </button>
                        </div>
                      )
                    })}
                    {phaseTasks.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: '#B8CDD8' }}>No tasks in this phase</div>
                    )}
                  </div>

                  {/* Add task inline form */}
                  {addTaskPhase === phase && (
                    <div style={{ padding: '12px 20px', borderTop: '1px solid #DDE8EE', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input style={{ ...INPUT_STYLE, flex: 1 }} placeholder="New task title..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addTask(phase) }} autoFocus />
                        <button onClick={() => addTask(phase)} style={{
                          padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#B45309', color: '#FFFFFF',
                          fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-manrope)', whiteSpace: 'nowrap',
                        }}>Add</button>
                        <button onClick={() => { setAddTaskPhase(null); setTaskError(null) }} style={{
                          padding: '8px 12px', borderRadius: '8px', border: '1px solid #B8CDD8', background: '#FFFFFF',
                          fontSize: '13px', fontWeight: 600, color: '#5B7080', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                        }}>Cancel</button>
                      </div>
                      {taskError && (
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626', padding: '4px 2px' }}>
                          {taskError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── PIPELINE TAB ─────────────────────────────────────────── */}
        {tab === 'Pipeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Progress bar */}
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>Registration Progress</span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#B45309' }}>
                  {project.delegate_stats.registered} / {project.target_delegate_count}
                </span>
              </div>
              <ProgressBar value={project.delegate_stats.registered} max={project.target_delegate_count} height={10} color="#B45309" />
            </div>

            {/* Funnel */}
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Pipeline Funnel</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                {DELEGATE_STAGES.map(stage => {
                  const count = funnelCounts[stage] || 0
                  const maxCount = Math.max(...Object.values(funnelCounts), 1)
                  const barH = Math.max((count / maxCount) * 120, 4)
                  return (
                    <div key={stage} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F1923', marginBottom: '6px' }}>{count}</div>
                      <div style={{
                        height: `${barH}px`, background: STAGE_COLORS[stage] || '#5B7080', borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease', margin: '0 auto', width: '80%',
                      }} />
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', marginTop: '8px' }}>{STAGE_LABELS[stage]}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add Delegate button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddDelegate(!showAddDelegate)} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '8px',
                border: 'none', background: '#B45309', color: '#FFFFFF', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--font-manrope)',
              }}>
                <PlusIcon /> Add Delegate
              </button>
            </div>

            {/* Add Delegate inline form */}
            {showAddDelegate && (
              <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '2px solid #B45309', padding: '20px 24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#B45309' }}>New Delegate</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px' }}>Name *</label>
                    <input style={INPUT_STYLE} value={newDelegate.name} onChange={e => setNewDelegate(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px' }}>Company</label>
                    <input style={INPUT_STYLE} value={newDelegate.company} onChange={e => setNewDelegate(p => ({ ...p, company: e.target.value }))} placeholder="Company" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px' }}>Title</label>
                    <input style={INPUT_STYLE} value={newDelegate.title} onChange={e => setNewDelegate(p => ({ ...p, title: e.target.value }))} placeholder="Job title" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px' }}>Email</label>
                    <input style={INPUT_STYLE} type="email" value={newDelegate.email} onChange={e => setNewDelegate(p => ({ ...p, email: e.target.value }))} placeholder="email@company.com" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px' }}>Source</label>
                    <select style={INPUT_STYLE} value={newDelegate.source} onChange={e => setNewDelegate(p => ({ ...p, source: e.target.value }))}>
                      <option value="client_wishlist">Client Wishlist</option>
                      <option value="internal_db">Internal DB</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="referral">Referral</option>
                      <option value="marketing">Marketing</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px' }}>Notes</label>
                    <input style={INPUT_STYLE} value={newDelegate.notes} onChange={e => setNewDelegate(p => ({ ...p, notes: e.target.value }))} placeholder="Any notes..." />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button onClick={addDelegate} style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#B45309', color: '#FFFFFF',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                  }}>Add Delegate</button>
                  <button onClick={() => setShowAddDelegate(false)} style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #B8CDD8', background: '#FFFFFF',
                    fontSize: '13px', fontWeight: 600, color: '#5B7080', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                  }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Delegate Table */}
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', overflow: 'hidden' }}>
              {delegates.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', fontSize: '15px', color: '#5B7080' }}>
                  No delegates in pipeline yet. Add your first delegate above.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-manrope)' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE' }}>Name</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE' }}>Company</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE' }}>Title</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE' }}>Stage</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE' }}>Source</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE' }}>Last Contact</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delegates.map(d => (
                      <tr key={d.id} style={{ borderBottom: '1px solid #F0F4F8' }}>
                        <td style={{ padding: '10px 14px', fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{d.name}</td>
                        <td style={{ padding: '10px 14px', fontSize: '14px', color: '#2D3E50' }}>{d.company || '--'}</td>
                        <td style={{ padding: '10px 14px', fontSize: '13px', color: '#5B7080' }}>{d.title || '--'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <select
                            value={d.stage}
                            onChange={e => updateDelegateStage(d.id, e.target.value)}
                            style={{
                              padding: '4px 8px', borderRadius: '6px', border: '1px solid #DDE8EE', fontSize: '12px',
                              fontWeight: 700, fontFamily: 'var(--font-manrope)', cursor: 'pointer',
                              color: STAGE_COLORS[d.stage] || '#5B7080', background: '#FFFFFF',
                            }}
                          >
                            {DELEGATE_STAGES.map(s => (
                              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#F0F4F8', color: '#5B7080' }}>
                            {SOURCE_LABELS[d.source] || d.source}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#5B7080' }}>{fmtDate(d.last_contact_date)}</td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#5B7080', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.notes || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── ASSETS TAB (Placeholder) ─────────────────────────────── */}
        {tab === 'Assets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Quick Links</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Link href="/admin/sites" style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px',
                  border: '1px solid #DDE8EE', textDecoration: 'none', color: '#0F1923', transition: 'border-color 0.2s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#B45309')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#DDE8EE')}
                >
                  <svg width="18" height="18" fill="none" stroke="#B45309" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>Landing Page</div>
                    <div style={{ fontSize: '12px', color: '#5B7080' }}>Open Website Builder to create event landing page</div>
                  </div>
                </Link>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px',
                  border: '1px solid #DDE8EE', color: '#0F1923',
                }}>
                  <svg width="18" height="18" fill="none" stroke="#B45309" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>Content Campaign</div>
                    <div style={{ fontSize: '12px', color: '#5B7080' }}>Open Content Engine for social and email campaigns</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #B8CDD8', padding: '32px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#5B7080', marginBottom: '4px' }}>Coming soon</div>
              <div style={{ fontSize: '14px', color: '#B8CDD8' }}>Asset management -- file uploads, creative assets, and deliverables tracking.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
