'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { ImportDelegatesModal } from './ImportDelegatesModal'
import { DelegateKanban } from './DelegateKanban'
import { computeBespokePhase, BESPOKE_PHASE_FALLBACK } from '@/app/lib/bespoke-phase'

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */
type DelegateStats = { total: number; registered: number; attended: number }

type Speaker  = { name: string; title: string; company: string; bio: string; headshot_url?: string }
type AgendaItem = { time: string; title: string; description: string }
type RegQuestion = { question: string; options: string[] }

type BespokeProject = {
  id: string; title: string; client_company: string; format: string
  event_date: string | null; event_time: string | null; phase: string
  city: string | null; venue: string | null
  webinar_platform: string | null; webinar_link: string | null
  contract_signed_date: string | null
  target_delegate_count: number; contract_value: number
  brief_status: string; brief_data: Record<string, unknown> | null
  client_contact_name: string | null; client_contact_email: string | null; client_contact_phone: string | null
  commercial_lead: { id: string; name: string } | null
  marketing_lead: { id: string; name: string } | null
  delegate_lead: { id: string; name: string } | null
  operations_lead: { id: string; name: string } | null
  design_lead: { id: string; name: string } | null
  commercial_lead_manual: string | null
  marketing_lead_manual: string | null
  delegate_lead_manual: string | null
  operations_lead_manual: string | null
  delegate_stats: DelegateStats
  created_at: string; updated_at: string
  // ── PRD #4 brief columns ─────────────────────────────────
  primary_goal:            string | null
  success_criteria:        string | null
  key_themes:              string | null
  desired_outcome:         string | null
  icp_job_titles:          string[] | null
  icp_industries:          string[] | null
  icp_geographies:         string[] | null
  target_accounts_list:    string | null
  client_approver_name:    string | null
  client_approver_email:   string | null
  speakers:                Speaker[] | null
  agenda:                  AgendaItem[] | null
  registration_questions:  RegQuestion[] | null
  brief_file_url:          string | null
  brief_is_locked:         boolean
  client_assets_url:       string | null
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
  commercial: { bg: 'var(--amber-light)', fg: 'var(--amber)' },
  marketing: { bg: 'var(--info-light)', fg: 'var(--info)' },
  delegate: { bg: 'var(--success-light)', fg: 'var(--success)' },
  operations: { bg: 'var(--purple-light)', fg: 'var(--purple)' },
  design: { bg: 'var(--red-light)', fg: 'var(--red)' },
  production: { bg: 'rgba(255,255,255,0.06)', fg: 'var(--ink3)' },
}

const STATUS_CYCLE: Record<string, string> = { pending: 'in_progress', in_progress: 'done', done: 'pending' }
const STATUS_LABELS: Record<string, string> = { pending: 'Pending', in_progress: 'In Progress', done: 'Done' }
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: 'var(--surface)', fg: 'var(--ink3)' },
  in_progress: { bg: 'var(--teal-light)', fg: 'var(--teal)' },
  done: { bg: 'var(--success-light)', fg: 'var(--success)' },
}

const DELEGATE_STAGES = ['sourced', 'contacted', 'interested', 'registered', 'confirmed', 'attended']
const STAGE_LABELS: Record<string, string> = {
  sourced: 'Sourced', contacted: 'Contacted', interested: 'Interested',
  registered: 'Registered', confirmed: 'Confirmed', attended: 'Attended',
}
const STAGE_COLORS: Record<string, string> = {
  sourced: 'var(--ink3)', contacted: 'var(--info)', interested: 'var(--amber)',
  registered: 'var(--teal)', confirmed: 'var(--success)', attended: 'var(--success)',
}

const SOURCE_LABELS: Record<string, string> = {
  client_wishlist: 'Client Wishlist', internal_db: 'Internal DB', linkedin: 'LinkedIn',
  referral: 'Referral', marketing: 'Marketing', other: 'Other',
}

const FORMAT_COLORS: Record<string, { bg: string; fg: string }> = {
  physical: { bg: 'var(--success-light)', fg: 'var(--success)' },
  virtual: { bg: 'var(--info-light)', fg: 'var(--info)' },
  hybrid: { bg: 'var(--purple-light)', fg: 'var(--purple)' },
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

function leadLabel(fkObj: { id: string; name: string } | null | undefined, manual: string | null | undefined): string {
  if (fkObj?.name) return fkObj.name
  if (manual?.trim()) return manual.trim() + ' (external)'
  return 'Unassigned'
}

function computePhase(project: BespokeProject): { activePhase: 1|2|3|4; label: string; dayOf: number; totalRunway: number; daysRemaining: number } | null {
  if (!project.event_date || !project.contract_signed_date) return null
  const start = new Date(project.contract_signed_date)
  const end = new Date(project.event_date)
  const today = new Date(new Date().toISOString().split('T')[0])
  const totalRunway = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
  const dayOf = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / 86400000))
  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000))
  if (today > end) return { activePhase: 4, label: 'Closure', dayOf, totalRunway, daysRemaining: 0 }
  const frac = dayOf / totalRunway
  if (frac < 0.15) return { activePhase: 1, label: 'Initiation', dayOf, totalRunway, daysRemaining }
  if (frac < 0.83) return { activePhase: 2, label: 'Campaign', dayOf, totalRunway, daysRemaining }
  return { activePhase: 3, label: 'Live', dayOf, totalRunway, daysRemaining }
}

/* ═══════════════════════════════════════════════════════════════════
   SVG ICONS
   ═══════════════════════════════════════════════════════════════════ */
function PlusIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CheckIcon({ checked }: { checked: boolean }) {
  if (!checked) return (
    <svg width="18" height="18" fill="none" stroke="var(--ink4)" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </svg>
  )
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="var(--teal)" />
      <path d="M7 12.5l3 3 7-7" stroke="var(--teal-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PROGRESS BAR COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
function ProgressBar({ value, max, height = 8, color }: { value: number; max: number; height?: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ height, background: 'var(--surface)', borderRadius: height / 2, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color || (pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--teal)' : '#F5B94D'), borderRadius: height / 2, transition: 'width 0.4s ease' }} />
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
  const [recalcState, setRecalcState] = useState<'idle' | 'pending' | 'done'>('idle')
  const [showAddDelegate, setShowAddDelegate] = useState(false)
  const [newDelegate, setNewDelegate] = useState({ name: '', company: '', title: '', email: '', source: 'client_wishlist', notes: '' })
  // Pipeline view toggle + import modal state — Nic PRD 16 Jul 2026
  const [pipelineView, setPipelineView] = useState<'table' | 'kanban'>('table')
  const [showImportModal, setShowImportModal] = useState(false)

  /* ── PRD #4 Brief state ─────────────────────────────────────────
     Every new brief field is held locally so users can edit freely,
     then flushed via saveBrief() as a single PATCH. Textarea-backed
     string[] columns (ICP job titles/industries/geographies) are
     serialized as newline-separated strings while editing and split
     back to arrays on save. */
  const [briefFields, setBriefFields] = useState({
    primary_goal:           '',
    success_criteria:       '',
    key_themes:             '',
    desired_outcome:        '',
    icp_job_titles:         '',
    icp_industries:         '',
    icp_geographies:        '',
    target_accounts_list:   '',
    client_approver_name:   '',
    client_approver_email:  '',
    client_assets_url:      '',
  })
  const [speakers,      setSpeakers]      = useState<Speaker[]>([])
  const [agenda,        setAgenda]        = useState<AgendaItem[]>([])
  const [regQuestions,  setRegQuestions]  = useState<RegQuestion[]>([])

  const [briefUploading,   setBriefUploading]   = useState(false)
  const [briefParsing,     setBriefParsing]     = useState(false)
  const [briefUploadError, setBriefUploadError] = useState<string | null>(null)
  const [briefDragOver,    setBriefDragOver]    = useState(false)

  const [lockError,   setLockError]   = useState<string[] | null>(null)   // hard errors (missing required)
  const [lockWarning, setLockWarning] = useState<string[] | null>(null)   // soft warnings (allow "Lock Anyway")
  const [lockSuccess, setLockSuccess] = useState(false)
  const [lockBusy,    setLockBusy]    = useState(false)

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

            // Hydrate the new PRD #4 flat brief fields from the DB row.
            // Fall back to the legacy brief_data.event_objectives shape so
            // migrated-in-flight rows still display their old values.
            const legacyObjectives = (p.brief_data?.event_objectives ?? {}) as Record<string, string>
            setBriefFields({
              primary_goal:          p.primary_goal          ?? legacyObjectives.primary_goal      ?? '',
              success_criteria:      p.success_criteria      ?? legacyObjectives.success_criteria  ?? '',
              key_themes:            p.key_themes            ?? legacyObjectives.key_themes        ?? '',
              desired_outcome:       p.desired_outcome       ?? legacyObjectives.desired_outcome   ?? '',
              icp_job_titles:        (p.icp_job_titles  ?? []).join('\n'),
              icp_industries:        (p.icp_industries  ?? []).join('\n'),
              icp_geographies:       (p.icp_geographies ?? []).join('\n'),
              target_accounts_list:  p.target_accounts_list  ?? '',
              client_approver_name:  p.client_approver_name  ?? '',
              client_approver_email: p.client_approver_email ?? '',
              client_assets_url:     p.client_assets_url     ?? '',
            })
            setSpeakers(Array.isArray(p.speakers) ? p.speakers : [])
            setAgenda(Array.isArray(p.agenda) ? p.agenda : [])
            setRegQuestions(Array.isArray(p.registration_questions) ? p.registration_questions : [])
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

  /* ── Recalculate task deadlines ────────────────────────────────
     Forces the PATCH /api/bespoke handler's server-side recompute
     branch to re-run by re-sending the current schedule fields.
     Reloads tasks on success and briefly flashes a "Updated" chip. */
  const recalcDeadlines = async () => {
    if (!project) return
    setRecalcState('pending')
    try {
      const res = await fetch('/api/bespoke', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          contract_signed_date: project.contract_signed_date,
          event_date: project.event_date,
          format: project.format,
        }),
      })
      if (res.ok) {
        await loadTasks()
        setRecalcState('done')
        setTimeout(() => setRecalcState('idle'), 2000)
      } else {
        setRecalcState('idle')
      }
    } catch {
      setRecalcState('idle')
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

  /* ── Serialize newline-separated textarea → clean string[] ──────
     Trim entries, drop blanks, so "  Foo \n\n Bar  " → ["Foo","Bar"]. */
  const linesToArray = (v: string): string[] =>
    v.split('\n').map(s => s.trim()).filter(Boolean)

  /* ── Save brief (draft — does not lock) ─────────────────────────
     Writes every new PRD #4 top-level column plus the two brief_data
     JSONB values we still keep (logistics_notes / branding_notes) so
     nothing the user typed is lost across saves. */
  const saveBrief = async () => {
    setBriefSaving(true)
    setBriefSaveState('idle')
    try {
      const payload = {
        id,
        brief_status:          'in_progress',
        primary_goal:          briefFields.primary_goal.trim()          || null,
        success_criteria:      briefFields.success_criteria.trim()      || null,
        key_themes:            briefFields.key_themes.trim()            || null,
        desired_outcome:       briefFields.desired_outcome.trim()       || null,
        icp_job_titles:        linesToArray(briefFields.icp_job_titles),
        icp_industries:        linesToArray(briefFields.icp_industries),
        icp_geographies:       linesToArray(briefFields.icp_geographies),
        target_accounts_list:  briefFields.target_accounts_list.trim()  || null,
        client_approver_name:  briefFields.client_approver_name.trim()  || null,
        client_approver_email: briefFields.client_approver_email.trim() || null,
        client_assets_url:     briefFields.client_assets_url.trim()     || null,
        speakers,
        agenda,
        registration_questions: regQuestions,
        // Preserve legacy JSONB fields still used by the logistics/branding notes.
        brief_data: briefData,
      }
      const res = await fetch('/api/bespoke', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setBriefSaveState('saved')
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

  /* ── Upload + auto-parse a brief file ──────────────────────────
     Two-step: (1) POST FormData to /api/bespoke/brief-upload which
     stores the file and updates brief_file_url on the project; then
     (2) POST JSON to /api/bespoke/parse-brief with the returned
     storage_path so Gemini can extract structured fields. We only
     backfill blank fields — anything the user has already typed
     stays untouched. */
  const handleBriefUpload = async (file: File) => {
    setBriefUploadError(null)
    setBriefUploading(true)
    try {
      const fd = new FormData()
      fd.append('project_id', id)
      fd.append('file', file)
      const upRes = await fetch('/api/bespoke/brief-upload', { method: 'POST', body: fd })
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}))
        setBriefUploadError(err?.error || 'Upload failed. Please retry.')
        return
      }
      const { storage_path } = await upRes.json()
      setBriefUploading(false)
      setBriefParsing(true)

      const parseRes = await fetch('/api/bespoke/parse-brief', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ project_id: id, storage_path }),
      })
      if (!parseRes.ok) {
        const err = await parseRes.json().catch(() => ({}))
        setBriefUploadError(err?.error || 'Parsing failed. File uploaded but fields not populated.')
        loadProject() // still refresh so the brief_file_url shows
        return
      }
      const parsed = await parseRes.json() as {
        primary_goal:            string | null
        success_criteria:        string | null
        key_themes:              string | null
        desired_outcome:         string | null
        icp_job_titles:          string[]
        icp_industries:          string[]
        icp_geographies:         string[]
        target_accounts_list:    string | null
        client_approver_name:    string | null
        client_approver_email:   string | null
        speakers:                Speaker[]
        agenda:                  AgendaItem[]
        registration_questions:  RegQuestion[]
      }

      // Merge without overwriting anything the user already typed.
      setBriefFields(prev => ({
        primary_goal:          prev.primary_goal.trim()          || parsed.primary_goal          || '',
        success_criteria:      prev.success_criteria.trim()      || parsed.success_criteria      || '',
        key_themes:            prev.key_themes.trim()            || parsed.key_themes            || '',
        desired_outcome:       prev.desired_outcome.trim()       || parsed.desired_outcome       || '',
        icp_job_titles:        prev.icp_job_titles.trim()        || parsed.icp_job_titles.join('\n'),
        icp_industries:        prev.icp_industries.trim()        || parsed.icp_industries.join('\n'),
        icp_geographies:       prev.icp_geographies.trim()       || parsed.icp_geographies.join('\n'),
        target_accounts_list:  prev.target_accounts_list.trim()  || parsed.target_accounts_list  || '',
        client_approver_name:  prev.client_approver_name.trim()  || parsed.client_approver_name  || '',
        client_approver_email: prev.client_approver_email.trim() || parsed.client_approver_email || '',
        client_assets_url:     prev.client_assets_url,
      }))
      setSpeakers(prev     => prev.length ? prev : parsed.speakers)
      setAgenda(prev       => prev.length ? prev : parsed.agenda)
      setRegQuestions(prev => prev.length ? prev : parsed.registration_questions)

      loadProject()
    } catch (e) {
      setBriefUploadError(e instanceof Error ? e.message : 'Unexpected error uploading brief')
    } finally {
      setBriefUploading(false)
      setBriefParsing(false)
    }
  }

  /* ── Verify + lock brief ────────────────────────────────────────
     Hard-fails on missing required fields (primary_goal, client
     approver name, at least one ICP entry). Soft-warns on optional
     gaps (speakers/agenda/target accounts) and lets the user "Lock
     Anyway". A clean pass locks immediately. */
  const verifyAndLockBrief = async () => {
    setLockError(null)
    setLockWarning(null)

    const missing: string[] = []
    if (!briefFields.primary_goal.trim())           missing.push('Primary Goal')
    if (!briefFields.client_approver_name.trim())   missing.push('Client Approver Name')
    const hasAnyIcp = [briefFields.icp_job_titles, briefFields.icp_industries, briefFields.icp_geographies]
      .some(v => linesToArray(v).length > 0)
    if (!hasAnyIcp) missing.push('ICP (at least one of Job Titles, Industries, or Geographies)')

    if (missing.length) {
      setLockError(missing)
      return
    }

    const warnings: string[] = []
    if (speakers.length === 0)                     warnings.push('No speakers listed')
    if (!briefFields.target_accounts_list.trim())  warnings.push('No target accounts listed')
    if (agenda.length === 0)                       warnings.push('No agenda items')

    if (warnings.length) {
      setLockWarning(warnings)
      return
    }

    await lockBrief()
  }

  const lockBrief = async () => {
    setLockBusy(true)
    setLockError(null)
    setLockWarning(null)
    try {
      // First save any pending edits so the locked state matches what the user sees.
      await saveBrief()
      const res = await fetch('/api/bespoke', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, brief_is_locked: true }),
      })
      if (res.ok) {
        setLockSuccess(true)
        setTimeout(() => setLockSuccess(false), 3000)
        loadProject()
      } else {
        setLockError(['Could not lock brief. Please retry.'])
      }
    } finally {
      setLockBusy(false)
    }
  }

  const unlockBrief = async () => {
    setLockBusy(true)
    try {
      const res = await fetch('/api/bespoke', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, brief_is_locked: false }),
      })
      if (res.ok) loadProject()
    } finally {
      setLockBusy(false)
    }
  }

  /* ── Loading state ────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '15px', color: 'var(--ink3)', fontFamily: 'var(--font-manrope)', fontWeight: 600 }}>Loading project...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '17px', color: 'var(--ink)', fontFamily: 'var(--font-manrope)', fontWeight: 700 }}>Project not found</div>
        <Link href="/admin/bespoke" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>Back to Bespoke Tracker</Link>
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
    width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--ink4)',
    fontSize: '14px', fontFamily: 'var(--font-manrope)', color: 'var(--ink)', background: 'var(--card)', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope)' }}>
      <PageHeader
        title={project.title}
        description={
          <>
            {project.client_company} · {fmtDate(project.event_date)}{project.city ? ` · ${project.city}` : ''}
            {days !== null && (
              <> · <span style={{ fontWeight: 700, color: days <= 7 ? 'var(--red)' : days <= 14 ? '#F5B94D' : 'inherit' }}>
                {days > 0 ? `${days} days left` : days === 0 ? 'Event Day' : `${Math.abs(days)} days ago`}
              </span></>
            )}
          </>
        }
        actions={
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', background: fmtC.bg, color: fmtC.fg }}>{project.format}</span>
        }
      />

      {/* ═══ KPI Strip ══════════════════════════════════════════════ */}
      <div style={{ padding: '20px 32px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {/* Days Left */}
        <div style={{ background: 'var(--card)', borderRadius: '10px', padding: '16px 20px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Days Left</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: days !== null && days <= 7 ? 'var(--red)' : 'var(--ink)' }}>{days ?? '--'}</div>
        </div>
        {/* Registrations */}
        <div style={{ background: 'var(--card)', borderRadius: '10px', padding: '16px 20px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Registrations</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)' }}>
            {project.delegate_stats.registered} <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink3)' }}>/ {project.target_delegate_count}</span>
          </div>
          <ProgressBar value={project.delegate_stats.registered} max={project.target_delegate_count} height={4} />
        </div>
        {/* Contract Value */}
        <div style={{ background: 'var(--card)', borderRadius: '10px', padding: '16px 20px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contract Value</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)' }}>{fmtCurrency(project.contract_value)}</div>
        </div>
        {/* Phase — computed dynamically from contract_signed_date + event_date,
             falls back to Kickoff & Alignment when dates missing. Colored badge
             per active phase. Fix for build_request 16d1f7c4. */}
        {(() => {
          const p = computeBespokePhase(project.contract_signed_date, project.event_date) ?? BESPOKE_PHASE_FALLBACK
          return (
            <div style={{ background: 'var(--card)', borderRadius: '10px', padding: '16px 20px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phase</div>
              <div style={{ display: 'inline-block', fontSize: '15px', fontWeight: 800, color: p.color, background: p.bgColor, padding: '4px 10px', borderRadius: '6px', marginTop: '2px' }}>
                {p.label}
              </div>
            </div>
          )
        })()}
      </div>

      {/* ═══ Tab Bar ═════════════════════════════════════════════════ */}
      <div style={{ padding: '20px 32px 0', display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer',
            fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
            background: tab === t ? 'var(--card)' : 'transparent',
            color: tab === t ? '#F5B94D' : 'var(--ink3)',
            borderBottom: tab === t ? '2px solid #F5B94D' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      {/* ═══ Tab Content ═════════════════════════════════════════════ */}
      <div style={{ padding: '24px 32px 64px' }}>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
        {tab === 'Overview' && (() => {
          const phaseInfo = computePhase(project)
          const suggestedTasks = phaseInfo
            ? [...tasks]
                .filter(t => t.phase === phaseInfo.activePhase && t.status !== 'done')
                .sort((a, b) => {
                  if (!a.due_date && !b.due_date) return 0
                  if (!a.due_date) return 1
                  if (!b.due_date) return -1
                  return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
                })
                .slice(0, 5)
            : []

          return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Phase Progress */}
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px', gridColumn: '1 / -1' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Phase Progress</h3>
              <div style={{ display: 'flex', gap: '4px' }}>
                {PHASES.map(p => {
                  const isActive = phaseInfo ? p.num === phaseInfo.activePhase : false
                  return (
                    <div key={p.key} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{
                        height: '8px', borderRadius: '4px', marginBottom: '8px',
                        background: isActive ? '#F5B94D' : 'var(--surface)',
                        transition: 'background 0.3s',
                      }} />
                      <div style={{
                        fontSize: '12px',
                        fontWeight: isActive ? 800 : 600,
                        color: isActive ? '#F5B94D' : 'var(--ink3)',
                        padding: isActive ? '2px 8px' : '2px 0',
                        borderRadius: '6px',
                        background: isActive ? 'var(--amber-light)' : 'transparent',
                        display: 'inline-block',
                      }}>
                        {p.label}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--ink3)', fontWeight: 600 }}>
                {phaseInfo
                  ? `Day ${phaseInfo.dayOf} of ${phaseInfo.totalRunway} — ${phaseInfo.daysRemaining} days remaining`
                  : 'Set contract signed + event dates to enable phase timeline'}
              </div>
            </div>

            {/* Team Leads */}
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Team Leads</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { role: 'Commercial',    label: leadLabel(project.commercial_lead, project.commercial_lead_manual) },
                  { role: 'Marketing',     label: leadLabel(project.marketing_lead,  project.marketing_lead_manual) },
                  { role: 'Delegate Acq.', label: leadLabel(project.delegate_lead,   project.delegate_lead_manual) },
                  { role: 'Operations',    label: leadLabel(project.operations_lead, project.operations_lead_manual) },
                  { role: 'Design',        label: leadLabel(project.design_lead,     null) },
                ].map(({ role, label }) => (
                  <div key={role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink3)' }}>{role}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: label === 'Unassigned' ? 'var(--ink4)' : 'var(--ink)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Quick Stats</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Client</span>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: project.client_company ? 700 : 500,
                    color: project.client_company ? 'var(--ink)' : 'var(--ink4)',
                  }}>{project.client_company || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Total Tasks</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{tasks.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Completed Tasks</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success)' }}>{tasks.filter(t => t.status === 'done').length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Overdue Tasks</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--red)' }}>{tasks.filter(t => isOverdue(t.due_date, t.status)).length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Pipeline Delegates</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{delegates.length}</span>
                </div>

                {/* Venue row — format-conditional */}
                {project.format === 'virtual' ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Venue</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Webinar</div>
                      {project.webinar_platform && (
                        <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{project.webinar_platform}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Venue</span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: (project.venue || project.city) ? 'var(--ink)' : 'var(--ink4)',
                    }}>
                      {`${project.venue ?? 'TBD'}, ${project.city ?? '—'}`}
                    </span>
                  </div>
                )}

                {/* Registration Target */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Registration Target</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                      {project.delegate_stats.registered} / {project.target_delegate_count}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '50%' }}>
                      <ProgressBar value={project.delegate_stats.registered} max={project.target_delegate_count} height={6} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px', gridColumn: '1 / -1' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Recent Activity</h3>
              {recentTasks.length === 0 ? (
                <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>No task updates yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recentTasks.map(t => {
                    const sc = STATUS_COLORS[t.status] || STATUS_COLORS.pending
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--surface)' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: sc.bg, color: sc.fg }}>{STATUS_LABELS[t.status]}</span>
                        <span style={{ fontSize: '14px', color: 'var(--ink)', flex: 1 }}>{t.title}</span>
                        <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Phase {t.phase}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Suggested Tasks */}
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px', gridColumn: '1 / -1' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Suggested Tasks</h3>
              {!phaseInfo ? (
                <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>Set project timeline to see suggested tasks.</div>
              ) : suggestedTasks.length === 0 ? (
                <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>All tasks in the active phase are complete.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {suggestedTasks.map(t => {
                    const roleColor = ROLE_COLORS[t.assigned_role] || ROLE_COLORS.commercial
                    const overdue = isOverdue(t.due_date, t.status)
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--surface)' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{t.title}</span>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                          background: roleColor.bg, color: roleColor.fg, textTransform: 'capitalize',
                        }}>{t.assigned_role}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: overdue ? 'var(--red)' : 'var(--ink3)', minWidth: '90px', textAlign: 'right' }}>
                          {fmtDate(t.due_date)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          )
        })()}

        {/* ── BRIEF TAB (PRD #4 rewrite) ────────────────────────────
             Sections top-to-bottom:
               1. Orange "Briefing Incomplete" banner (hidden when locked)
               2. Drag-and-drop uploader → auto-parse via Gemini
               3. Event Objectives (top-level columns, not brief_data)
               4. ICP (three string[] columns)
               5. Target Accounts
               6. Client Approver
               7. Logistics & Brand Notes
               8. Speakers (editable list)
               9. Agenda (editable list)
              10. Registration Questions (editable list)
              Bottom row: Save Brief · Verify and Lock / Unlock */}
        {tab === 'Brief' && (
          <div style={{ maxWidth: '800px' }}>
            {/* Briefing incomplete banner — only when not yet locked */}
            {!project.brief_is_locked && (
              <div style={{
                background: 'var(--orange-light)', borderLeft: '4px solid var(--orange)', color: 'var(--orange)',
                padding: '16px', borderRadius: '8px', marginBottom: '20px',
                fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-manrope)',
                lineHeight: 1.5,
              }}>
                <strong style={{ fontWeight: 800 }}>⚠️ Briefing Incomplete:</strong>{' '}
                The event brief forms the basis of all campaign tasks. Please complete the Brief tab
                details or upload a brief document as soon as possible.
              </div>
            )}

            {lockSuccess && (
              <div style={{
                background: 'var(--success-light)', borderLeft: '4px solid var(--success)', color: 'var(--success)',
                padding: '14px 16px', borderRadius: '8px', marginBottom: '20px',
                fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
              }}>
                ✓ Brief locked. Downstream tasks unlocked.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* ── Drag-and-drop uploader ─────────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Upload Brief Document</h3>
                <div
                  onDragOver={e => { e.preventDefault(); setBriefDragOver(true) }}
                  onDragLeave={() => setBriefDragOver(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setBriefDragOver(false)
                    const f = e.dataTransfer.files?.[0]
                    if (f) handleBriefUpload(f)
                  }}
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type   = 'file'
                    input.accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    input.onchange = () => {
                      const f = input.files?.[0]
                      if (f) handleBriefUpload(f)
                    }
                    input.click()
                  }}
                  style={{
                    border: `2px dashed ${briefDragOver ? '#F5B94D' : 'var(--ink4)'}`,
                    background: briefDragOver ? 'var(--orange-light)' : 'var(--border-light)',
                    borderRadius: '10px', padding: '32px', textAlign: 'center',
                    cursor: briefUploading || briefParsing ? 'wait' : 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  {briefUploading ? (
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#F5B94D' }}>Uploading…</div>
                  ) : briefParsing ? (
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#F5B94D' }}>Parsing… extracting fields from your brief</div>
                  ) : (
                    <>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
                        Drop a PDF or DOCX brief here, or click to browse
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>
                        We&rsquo;ll auto-fill the fields below with what we can extract. Max 20 MB.
                      </div>
                      {project.brief_file_url && (
                        <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '8px', fontWeight: 600 }}>
                          Current brief: {project.brief_file_url.split('/').pop()}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {briefUploadError && (
                  <div style={{
                    marginTop: '10px', padding: '8px 12px', borderRadius: '8px',
                    background: 'var(--red-light)', color: 'var(--red)', fontSize: '13px', fontWeight: 600,
                  }}>
                    {briefUploadError}
                  </div>
                )}
              </div>

              {/* ── Event Objectives ─────────────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Event Objectives</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {([
                    ['primary_goal',     'Primary Goal *'],
                    ['success_criteria', 'Success Criteria'],
                    ['key_themes',       'Key Themes'],
                    ['desired_outcome',  'Desired Outcome'],
                  ] as const).map(([field, label]) => (
                    <div key={field}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>{label}</label>
                      <textarea
                        style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical' }}
                        value={briefFields[field]}
                        onChange={e => setBriefFields(prev => ({ ...prev, [field]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── ICP ──────────────────────────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Ideal Customer Profile (ICP)</h3>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>
                  One entry per line. At least one section is required to lock the brief.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  {([
                    ['icp_job_titles',  'Job Titles',  'Head of Marketing\nCFO\n…'],
                    ['icp_industries',  'Industries',  'Fintech\nHealthcare\n…'],
                    ['icp_geographies', 'Geographies', 'UAE\nSaudi Arabia\n…'],
                  ] as const).map(([field, label, placeholder]) => (
                    <div key={field}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>{label}</label>
                      <textarea
                        style={{ ...INPUT_STYLE, minHeight: '110px', resize: 'vertical' }}
                        placeholder={placeholder}
                        value={briefFields[field]}
                        onChange={e => setBriefFields(prev => ({ ...prev, [field]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Target Accounts ──────────────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Target Accounts</h3>
                <textarea
                  style={{ ...INPUT_STYLE, minHeight: '100px', resize: 'vertical' }}
                  placeholder="Paste target accounts here — one per line or CSV."
                  value={briefFields.target_accounts_list}
                  onChange={e => setBriefFields(prev => ({ ...prev, target_accounts_list: e.target.value }))}
                />
              </div>

              {/* ── Client Approver ──────────────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Client Approver</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Name *</label>
                    <input
                      style={INPUT_STYLE}
                      placeholder="Approver full name"
                      value={briefFields.client_approver_name}
                      onChange={e => setBriefFields(prev => ({ ...prev, client_approver_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Email</label>
                    <input
                      type="email"
                      style={INPUT_STYLE}
                      placeholder="approver@client.com"
                      value={briefFields.client_approver_email}
                      onChange={e => setBriefFields(prev => ({ ...prev, client_approver_email: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* ── Logistics & Brand Notes ──────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Logistics &amp; Brand Notes</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>
                      Client Brand Assets Folder Link (URL)
                    </label>
                    <input
                      style={INPUT_STYLE}
                      placeholder="https://drive.google.com/…"
                      value={briefFields.client_assets_url}
                      onChange={e => setBriefFields(prev => ({ ...prev, client_assets_url: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Logistics Notes</label>
                    <textarea
                      style={{ ...INPUT_STYLE, minHeight: '80px', resize: 'vertical' }}
                      placeholder={project.format === 'virtual'
                        ? 'Virtual setup: links, dry-runs, recording options…'
                        : 'Venue requirements, catering, AV needs, transport…'}
                      value={(briefData.logistics_notes as string) || ''}
                      onChange={e => setBriefData(prev => ({ ...prev, logistics_notes: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Branding Notes</label>
                    <textarea
                      style={{ ...INPUT_STYLE, minHeight: '80px', resize: 'vertical' }}
                      placeholder="Client branding guidelines, color schemes, tone of voice…"
                      value={(briefData.branding_notes as string) || ''}
                      onChange={e => setBriefData(prev => ({ ...prev, branding_notes: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* ── Speakers ─────────────────────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Speakers</h3>
                  <button onClick={() => setSpeakers(prev => [...prev, { name: '', title: '', company: '', bio: '' }])} style={{
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '6px',
                    border: '1px solid var(--ink4)', background: 'var(--card)', fontSize: '12px', fontWeight: 700,
                    color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                  }}>
                    <PlusIcon /> Add Speaker
                  </button>
                </div>
                {speakers.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '8px 0' }}>No speakers yet. Click &ldquo;Add Speaker&rdquo; to start.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {speakers.map((s, idx) => (
                      <div key={idx} style={{ border: '1px solid var(--surface)', borderRadius: '8px', padding: '12px', background: 'var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                          <button
                            aria-label="Remove speaker"
                            onClick={() => setSpeakers(prev => prev.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--ink3)', lineHeight: 1 }}
                          >×</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <input style={INPUT_STYLE} placeholder="Name" value={s.name}
                            onChange={e => setSpeakers(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                          <input style={INPUT_STYLE} placeholder="Title" value={s.title}
                            onChange={e => setSpeakers(prev => prev.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))} />
                          <input style={INPUT_STYLE} placeholder="Company" value={s.company}
                            onChange={e => setSpeakers(prev => prev.map((x, i) => i === idx ? { ...x, company: e.target.value } : x))} />
                        </div>
                        <textarea
                          style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical' }}
                          placeholder="Bio"
                          value={s.bio}
                          onChange={e => setSpeakers(prev => prev.map((x, i) => i === idx ? { ...x, bio: e.target.value } : x))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Agenda ───────────────────────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Agenda</h3>
                  <button onClick={() => setAgenda(prev => [...prev, { time: '', title: '', description: '' }])} style={{
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '6px',
                    border: '1px solid var(--ink4)', background: 'var(--card)', fontSize: '12px', fontWeight: 700,
                    color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                  }}>
                    <PlusIcon /> Add Agenda Item
                  </button>
                </div>
                {agenda.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '8px 0' }}>No agenda items yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {agenda.map((a, idx) => (
                      <div key={idx} style={{ border: '1px solid var(--surface)', borderRadius: '8px', padding: '12px', background: 'var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
                          <button
                            aria-label="Remove agenda item"
                            onClick={() => setAgenda(prev => prev.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--ink3)', lineHeight: 1 }}
                          >×</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px', marginBottom: '10px' }}>
                          <input style={INPUT_STYLE} placeholder="09:00" value={a.time}
                            onChange={e => setAgenda(prev => prev.map((x, i) => i === idx ? { ...x, time: e.target.value } : x))} />
                          <input style={INPUT_STYLE} placeholder="Session title" value={a.title}
                            onChange={e => setAgenda(prev => prev.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))} />
                        </div>
                        <textarea
                          style={{ ...INPUT_STYLE, minHeight: '50px', resize: 'vertical' }}
                          placeholder="Description"
                          value={a.description}
                          onChange={e => setAgenda(prev => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Registration Questions ───────────────────────── */}
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>Registration Questions</h3>
                  <button onClick={() => setRegQuestions(prev => [...prev, { question: '', options: [] }])} style={{
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '6px',
                    border: '1px solid var(--ink4)', background: 'var(--card)', fontSize: '12px', fontWeight: 700,
                    color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                  }}>
                    <PlusIcon /> Add Question
                  </button>
                </div>
                {regQuestions.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '8px 0' }}>No custom registration questions yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {regQuestions.map((q, idx) => (
                      <div key={idx} style={{ border: '1px solid var(--surface)', borderRadius: '8px', padding: '12px', background: 'var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
                          <button
                            aria-label="Remove question"
                            onClick={() => setRegQuestions(prev => prev.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--ink3)', lineHeight: 1 }}
                          >×</button>
                        </div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Question</label>
                        <input
                          style={{ ...INPUT_STYLE, marginBottom: '8px' }}
                          placeholder="e.g. What is your primary interest?"
                          value={q.question}
                          onChange={e => setRegQuestions(prev => prev.map((x, i) => i === idx ? { ...x, question: e.target.value } : x))}
                        />
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Options (one per line — leave blank for free text)</label>
                        <textarea
                          style={{ ...INPUT_STYLE, minHeight: '50px', resize: 'vertical' }}
                          placeholder={'Option A\nOption B'}
                          value={q.options.join('\n')}
                          onChange={e => setRegQuestions(prev => prev.map((x, i) =>
                            i === idx ? { ...x, options: linesToArray(e.target.value) } : x
                          ))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Lock error / warning banners ─────────────────── */}
              {lockError && (
                <div style={{
                  background: 'var(--red-light)', borderLeft: '4px solid var(--red)', color: 'var(--red)',
                  padding: '14px 16px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-manrope)',
                }}>
                  <div style={{ fontWeight: 800, marginBottom: '4px' }}>Cannot lock — missing required fields:</div>
                  <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                    {lockError.map(m => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              )}
              {lockWarning && (
                <div style={{
                  background: 'var(--orange-light)', borderLeft: '4px solid var(--orange)', color: 'var(--orange)',
                  padding: '14px 16px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-manrope)',
                }}>
                  <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                    Brief is missing some optional details. You can still lock it, but consider adding:
                  </div>
                  <ul style={{ margin: '4px 0 12px 20px', padding: 0 }}>
                    {lockWarning.map(m => <li key={m}>{m}</li>)}
                  </ul>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={lockBrief} disabled={lockBusy} style={{
                      padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--orange)', color: 'var(--orange-light)',
                      fontSize: '13px', fontWeight: 700, cursor: lockBusy ? 'wait' : 'pointer', fontFamily: 'var(--font-manrope)',
                    }}>{lockBusy ? 'Locking…' : 'Lock Anyway'}</button>
                    <button onClick={() => setLockWarning(null)} style={{
                      padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--ink4)', background: 'var(--card)',
                      fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                    }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* ── Action row ───────────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button onClick={saveBrief} disabled={briefSaving} style={{
                  padding: '10px 28px', borderRadius: '8px', border: 'none', background: briefSaving ? 'var(--ink4)' : '#F5B94D',
                  color: briefSaving ? 'var(--surface)' : 'var(--amber-light)', fontSize: '14px', fontWeight: 700, cursor: briefSaving ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-manrope)',
                }}>
                  {briefSaving ? 'Saving…' : 'Save Brief'}
                </button>

                {!project.brief_is_locked && (
                  <button onClick={verifyAndLockBrief} disabled={lockBusy} style={{
                    padding: '10px 28px', borderRadius: '8px', border: '1px solid #F5B94D', background: 'var(--card)',
                    color: '#F5B94D', fontSize: '14px', fontWeight: 700, cursor: lockBusy ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-manrope)',
                  }}>
                    {lockBusy ? 'Working…' : 'Verify and Lock Brief'}
                  </button>
                )}

                {project.brief_is_locked && (
                  <button onClick={unlockBrief} disabled={lockBusy} style={{
                    padding: '10px 28px', borderRadius: '8px', border: '1px solid var(--ink3)', background: 'var(--card)',
                    color: 'var(--ink3)', fontSize: '14px', fontWeight: 700, cursor: lockBusy ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-manrope)',
                  }}>
                    {lockBusy ? 'Working…' : 'Unlock Brief'}
                  </button>
                )}

                {briefSaveState === 'saved' && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '999px',
                    background: 'var(--success-light)', color: 'var(--success)',
                    fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
                  }}>
                    ✓ Saved
                  </span>
                )}
                {briefSaveState === 'error' && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '999px',
                    background: 'var(--red-light)', color: 'var(--red)',
                    fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
                  }}>
                    Couldn&rsquo;t save. Please retry.
                  </span>
                )}

                {project.brief_is_locked && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '999px',
                    background: 'var(--success-light)', color: 'var(--success)',
                    fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
                  }}>
                    🔒 Brief Locked
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TASKS TAB ────────────────────────────────────────────── */}
        {tab === 'Tasks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header row: banner + manual recalc button */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              {!project.brief_is_locked && (
                <div style={{
                  flex: 1, minWidth: '260px',
                  background: 'var(--info-light)', borderLeft: '4px solid var(--info)', color: 'var(--info)',
                  padding: '12px 16px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-manrope)',
                }}>
                  Complete and lock the brief to unlock Phase 2, 3, and 4 tasks.
                </div>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {recalcState === 'done' && (
                  <span style={{
                    fontSize: '12px', fontWeight: 700, color: 'var(--success)',
                    background: 'var(--success-light)', padding: '4px 10px', borderRadius: '10px',
                    fontFamily: 'var(--font-manrope)',
                  }}>
                    ✓ Updated
                  </span>
                )}
                <button
                  onClick={recalcDeadlines}
                  disabled={recalcState === 'pending'}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--ink3)',
                    borderRadius: '6px',
                    cursor: recalcState === 'pending' ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-manrope)',
                  }}>
                  {recalcState === 'pending' ? 'Recalculating…' : 'Recalculate deadlines'}
                </button>
              </div>
            </div>

            {[1, 2, 3, 4].map(phase => {
              const phaseTasks = tasks.filter(t => t.phase === phase)
              const doneCount = phaseTasks.filter(t => t.status === 'done').length
              // Phase 1 is always interactive. 2/3/4 lock until the brief is locked.
              const phaseLocked = !project.brief_is_locked && phase !== 1
              return (
                <div key={phase} style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {/* Phase header */}
                  <div style={{ padding: '16px 20px', background: 'var(--border-light)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>Phase {phase}: {PHASES[phase - 1]?.label}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '10px' }}>
                        {doneCount}/{phaseTasks.length}
                      </span>
                      {phaseLocked && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--orange)', background: 'var(--orange-light)', padding: '2px 8px', borderRadius: '10px' }}>
                          🔒 Locked
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => { setAddTaskPhase(addTaskPhase === phase ? null : phase); setNewTaskTitle('') }}
                      disabled={phaseLocked}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '6px',
                        border: '1px solid var(--ink4)', background: 'var(--card)', fontSize: '12px', fontWeight: 700,
                        color: 'var(--ink3)', cursor: phaseLocked ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-manrope)',
                        opacity: phaseLocked ? 0.5 : 1,
                      }}>
                      <PlusIcon /> Add Task
                    </button>
                  </div>

                  {/* Tasks list */}
                  <div style={{ opacity: phaseLocked ? 0.5 : 1 }}>
                    {phaseTasks.map(t => {
                      const rc = ROLE_COLORS[t.assigned_role] || ROLE_COLORS.commercial
                      const overdue = isOverdue(t.due_date, t.status)
                      return (
                        <div key={t.id} style={{
                          display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px',
                          borderBottom: '1px solid var(--surface)',
                          background: flashTaskId === t.id ? 'var(--amber-light)' : (overdue ? 'var(--red-light)' : 'transparent'),
                          transition: 'background 0.4s ease',
                        }}>
                          {/* Checkbox */}
                          <button
                            onClick={() => toggleTaskStatus(t)}
                            disabled={phaseLocked}
                            style={{ border: 'none', background: 'none', cursor: phaseLocked ? 'not-allowed' : 'pointer', padding: 0, display: 'flex' }}>
                            <CheckIcon checked={t.status === 'done'} />
                          </button>
                          {/* Title */}
                          <span style={{
                            flex: 1, fontSize: '14px', color: t.status === 'done' ? 'var(--ink3)' : 'var(--ink)',
                            textDecoration: t.status === 'done' ? 'line-through' : 'none', fontWeight: 500,
                          }}>{t.title}</span>
                          {/* Assignee name (shown between title and role badge when set) */}
                          {t.assigned_staff?.name && (
                            <span style={{ fontSize: '11px', color: 'var(--ink3)', marginLeft: 'auto', marginRight: '8px' }}>
                              {t.assigned_staff.name}
                            </span>
                          )}
                          {/* Role badge */}
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: rc.bg, color: rc.fg, textTransform: 'capitalize' }}>
                            {t.assigned_role}
                          </span>
                          {/* Due date */}
                          {t.due_date && (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: overdue ? 'var(--red)' : 'var(--ink3)', whiteSpace: 'nowrap' }}>
                              {fmtDate(t.due_date)}
                            </span>
                          )}
                          {/* Status toggle */}
                          <button
                            onClick={() => toggleTaskStatus(t)}
                            disabled={phaseLocked}
                            style={{
                              padding: '3px 10px', borderRadius: '6px', border: 'none', cursor: phaseLocked ? 'not-allowed' : 'pointer',
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
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: 'var(--ink4)' }}>No tasks in this phase</div>
                    )}
                  </div>

                  {/* Add task inline form */}
                  {addTaskPhase === phase && !phaseLocked && (
                    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input style={{ ...INPUT_STYLE, flex: 1 }} placeholder="New task title..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addTask(phase) }} autoFocus />
                        <button onClick={() => addTask(phase)} style={{
                          padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#F5B94D', color: 'var(--amber-light)',
                          fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-manrope)', whiteSpace: 'nowrap',
                        }}>Add</button>
                        <button onClick={() => { setAddTaskPhase(null); setTaskError(null) }} style={{
                          padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--ink4)', background: 'var(--card)',
                          fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                        }}>Cancel</button>
                      </div>
                      {taskError && (
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--red)', padding: '4px 2px' }}>
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
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Registration Progress</span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#F5B94D' }}>
                  {project.delegate_stats.registered} / {project.target_delegate_count}
                </span>
              </div>
              <ProgressBar value={project.delegate_stats.registered} max={project.target_delegate_count} height={10} color="#F5B94D" />
            </div>

            {/* Funnel */}
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Pipeline Funnel</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                {DELEGATE_STAGES.map(stage => {
                  const count = funnelCounts[stage] || 0
                  const maxCount = Math.max(...Object.values(funnelCounts), 1)
                  const barH = Math.max((count / maxCount) * 120, 4)
                  return (
                    <div key={stage} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>{count}</div>
                      <div style={{
                        height: `${barH}px`, background: STAGE_COLORS[stage] || 'var(--ink3)', borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease', margin: '0 auto', width: '80%',
                      }} />
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginTop: '8px' }}>{STAGE_LABELS[stage]}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Toolbar: view toggle (Table | Kanban) + Import + Add Delegate — Nic PRD 16 Jul 2026 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* View toggle */}
              <div style={{
                display: 'inline-flex', border: '1px solid var(--border)', background: 'var(--border-light)',
                borderRadius: '8px', padding: '2px',
              }}>
                {(['table', 'kanban'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setPipelineView(v)}
                    style={{
                      padding: '6px 14px', borderRadius: '6px', border: 'none',
                      background: pipelineView === v ? 'var(--card-hi)' : 'transparent',
                      color: pipelineView === v ? 'var(--ink)' : 'var(--ink3)',
                      fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'var(--font-manrope)',
                      boxShadow: pipelineView === v ? 'var(--shadow-sm)' : 'none',
                      textTransform: 'capitalize',
                    }}
                  >
                    {v === 'kanban' ? 'Kanban Board' : 'Table'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowImportModal(true)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px',
                  border: '1px solid var(--amber-border)', background: 'var(--card)', color: 'var(--amber)', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                }}>
                  Import CSV / XLSX
                </button>
                <button onClick={() => setShowAddDelegate(!showAddDelegate)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '8px',
                  border: 'none', background: '#F5B94D', color: 'var(--amber-light)', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                }}>
                  <PlusIcon /> Add Delegate
                </button>
              </div>
            </div>

            {/* Add Delegate inline form */}
            {showAddDelegate && (
              <div style={{ background: 'var(--card)', borderRadius: '12px', border: '2px solid #F5B94D', padding: '20px 24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#F5B94D' }}>New Delegate</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Name *</label>
                    <input style={INPUT_STYLE} value={newDelegate.name} onChange={e => setNewDelegate(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Company</label>
                    <input style={INPUT_STYLE} value={newDelegate.company} onChange={e => setNewDelegate(p => ({ ...p, company: e.target.value }))} placeholder="Company" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Title</label>
                    <input style={INPUT_STYLE} value={newDelegate.title} onChange={e => setNewDelegate(p => ({ ...p, title: e.target.value }))} placeholder="Job title" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Email</label>
                    <input style={INPUT_STYLE} type="email" value={newDelegate.email} onChange={e => setNewDelegate(p => ({ ...p, email: e.target.value }))} placeholder="email@company.com" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Source</label>
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
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '4px' }}>Notes</label>
                    <input style={INPUT_STYLE} value={newDelegate.notes} onChange={e => setNewDelegate(p => ({ ...p, notes: e.target.value }))} placeholder="Any notes..." />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button onClick={addDelegate} style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#F5B94D', color: 'var(--amber-light)',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                  }}>Add Delegate</button>
                  <button onClick={() => setShowAddDelegate(false)} style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--ink4)', background: 'var(--card)',
                    fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                  }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Delegate Table or Kanban (view toggle above) */}
            {pipelineView === 'kanban' ? (
              delegates.length === 0 ? (
                <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '40px', textAlign: 'center', fontSize: '15px', color: 'var(--ink3)' }}>
                  No delegates in pipeline yet. Add your first delegate or import a spreadsheet above.
                </div>
              ) : (
                <DelegateKanban
                  delegates={delegates}
                  stages={[...DELEGATE_STAGES]}
                  stageLabels={STAGE_LABELS}
                  stageColors={STAGE_COLORS}
                  sourceLabels={SOURCE_LABELS}
                  onStageChange={updateDelegateStage}
                />
              )
            ) : (
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              {delegates.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', fontSize: '15px', color: 'var(--ink3)' }}>
                  No delegates in pipeline yet. Add your first delegate or import a spreadsheet above.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-manrope)' }}>
                  <thead>
                    <tr style={{ background: 'var(--border-light)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Name</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Company</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Title</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Stage</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Source</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Last Contact</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delegates.map(d => (
                      <tr key={d.id} style={{ borderBottom: '1px solid var(--surface)' }}>
                        <td style={{ padding: '10px 14px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{d.name}</td>
                        <td style={{ padding: '10px 14px', fontSize: '14px', color: 'var(--ink2)' }}>{d.company || '--'}</td>
                        <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--ink3)' }}>{d.title || '--'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <select
                            value={d.stage}
                            onChange={e => updateDelegateStage(d.id, e.target.value)}
                            style={{
                              padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px',
                              fontWeight: 700, fontFamily: 'var(--font-manrope)', cursor: 'pointer',
                              color: STAGE_COLORS[d.stage] || 'var(--ink3)', background: 'var(--card)',
                            }}
                          >
                            {DELEGATE_STAGES.map(s => (
                              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'var(--surface)', color: 'var(--ink3)' }}>
                            {SOURCE_LABELS[d.source] || d.source}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink3)' }}>{fmtDate(d.last_contact_date)}</td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink3)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.notes || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )}

            {/* Import modal — mounted here so it's inside the Pipeline tab tree */}
            {showImportModal && (
              <ImportDelegatesModal
                projectId={id}
                onImportComplete={() => { loadDelegates() }}
                onClose={() => setShowImportModal(false)}
              />
            )}
          </div>
        )}

        {/* ── ASSETS TAB (Placeholder) ─────────────────────────────── */}
        {tab === 'Assets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
            <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Quick Links</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Link href="/admin/sites" style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px',
                  border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', transition: 'border-color 0.2s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#F5B94D')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <svg width="18" height="18" fill="none" stroke="#F5B94D" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>Landing Page</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Open Website Builder to create event landing page</div>
                  </div>
                </Link>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px',
                  border: '1px solid var(--border)', color: 'var(--ink)',
                }}>
                  <svg width="18" height="18" fill="none" stroke="#F5B94D" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>Content Campaign</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Open Content Engine for social and email campaigns</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'var(--border-light)', borderRadius: '12px', border: '1px dashed var(--ink4)', padding: '32px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Coming soon</div>
              <div style={{ fontSize: '14px', color: 'var(--ink4)' }}>Asset management -- file uploads, creative assets, and deliverables tracking.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
