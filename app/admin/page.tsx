'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'
import { buildQuestions, ALL_DEPARTMENTS } from '@/app/lib/questions'
import type { Question } from '@/app/lib/questions'

const OFFICES = [
  { id: 'dubai',     label: 'Dubai',     total: 0, color: '#00897B' },
  { id: 'bangalore', label: 'Bangalore', total: 0, color: '#A478FF' },
  { id: 'mangalore', label: 'Mangalore', total: 0, color: '#8B1A1A' },
  { id: 'manipal',   label: 'Manipal',   total: 0, color: '#3730A3' },
]
// TOTAL is no longer hardcoded — derived from actual staff count in DB

const DEPT_ORDER = [
  'Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations',
  'IT', 'HR & Recruitment', 'Content & Design', 'Government Relations',
  'DemandifyMedia', 'Leadership', 'Other',
]

type Member = {
  id: string; name: string; email: string; office_id: string
  department: string | null; role: string | null
  profile_complete: boolean; joined_at: string
}

type TaskProfile = {
  id: string; staff_id: string; task_name: string
  task_description: string | null; tools_used: string[]
  time_taken_today: string | null; ai_time_estimate: string | null
  skill_needed: string | null; ai_readiness: number | null
  frequency: string | null; created_at: string
  ai_proof: string | null
}

type LearningCompletion = { id: string; staff_id: string; course_id: string; test_score: number | null; passed: boolean; attempt_count: number; completed_at: string }
type LearningCourse     = { id: string; title: string; tier_level: string; is_mandatory: boolean; estimated_minutes: number }
type LearningStaff      = { id: string; name: string; department: string | null; office_id: string; role: string | null }
type LearningAttempt    = { id: string; staff_id: string; course_id: string; score: number | null; passed: boolean | null; attempted_at: string }

/* ── QuestionnaireView — read-only preview of the full questionnaire flow ── */
function QuestionnaireView({ qDept, setQDept }: { qDept: string; setQDept: (d: string) => void }) {
  const questions: Question[] = buildQuestions(qDept)

  const typeLabel: Record<string, string> = {
    textarea: 'Open text',
    chips:    'Multi-select',
    scale:    'Scale 1–5',
    select:   'Single choice',
    text:     'Short text',
  }
  const typeBadgeColor: Record<string, string> = {
    textarea: '#00897B',
    chips:    '#C0F43C',
    scale:    '#8B1A1A',
    select:   '#8B1A1A',
    text:     '#00897B',
  }
  const typeBadgeText: Record<string, string> = {
    textarea: 'white',
    chips:    '#0F1923',
    scale:    '#0F1923',
    select:   '#0F1923',
    text:     '#0F1923',
  }

  return (
    <div>
      {/* Dept selector */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px' }}>
        {ALL_DEPARTMENTS.map(d => (
          <button key={d} onClick={() => setQDept(d)}
            style={{ padding: '7px 16px', borderRadius: '16px', border: `1px solid ${qDept === d ? '#00695C' : '#DDE8EE'}`, background: qDept === d ? 'rgba(0,122,110,0.1)' : 'transparent', color: qDept === d ? '#00695C' : '#2D3E50', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {d}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={{ background: 'rgba(0,165,163,0.08)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '4px' }}>Questionnaire Preview</div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{qDept} Department</div>
          <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '2px' }}>{questions.length} questions total · Read-only view</div>
        </div>
        <div style={{ fontSize: '36px', fontWeight: 800, color: '#00897B', lineHeight: 1 }}>{questions.length}</div>
      </div>

      {/* Question cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {questions.map((q, idx) => (
          <div key={q.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
            {/* Step + type row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#5B7080', flexShrink: 0 }}>
                {idx + 1}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: typeBadgeColor[q.type] ?? '#555', color: typeBadgeText[q.type] ?? 'white', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {typeLabel[q.type] ?? q.type}
              </span>
              <span style={{ fontSize: '13px', color: '#5B7080', fontFamily: 'monospace' }}>{q.id}</span>
            </div>

            {/* Question text */}
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', lineHeight: 1.5, marginBottom: q.subtext ? '6px' : '0' }}>
              {q.question}
            </div>
            {q.subtext && (
              <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.5, marginBottom: '0' }}>
                {q.subtext}
              </div>
            )}

            {/* Options display */}
            {q.type === 'chips' && q.options && q.options.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                {q.options.map(opt => (
                  <span key={opt} style={{ padding: '5px 12px', borderRadius: '16px', border: '1px solid #DDE8EE', fontSize: '13px', color: '#5B7080', background: '#FFFFFF' }}>
                    {opt}
                  </span>
                ))}
              </div>
            )}

            {q.type === 'select' && q.options && q.options.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {q.options.map((opt, oi) => (
                  <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1.5px solid #DDE8EE', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: '#5B7080' }}>{opt}</span>
                  </div>
                ))}
              </div>
            )}

            {q.type === 'scale' && q.options && q.options.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {q.options.map((opt, oi) => (
                  <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1.5px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '9px', fontWeight: 800, color: '#5B7080' }}>{oi + 1}</span>
                    </div>
                    <span style={{ fontSize: '13px', color: '#5B7080' }}>{opt}</span>
                  </div>
                ))}
              </div>
            )}

            {q.type === 'textarea' && q.placeholder && (
              <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px dashed #DDE8EE', background: '#FFFFFF' }}>
                <span style={{ fontSize: '13px', color: '#5B7080', fontStyle: 'italic', lineHeight: 1.5 }}>{q.placeholder}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [authed, setAuthed]   = useState(() => typeof window !== 'undefined' && sessionStorage.getItem('tai_admin_authed') === '1')
  const [adminStaffId, setAdminStaffId] = useState(() => typeof window !== 'undefined' ? sessionStorage.getItem('tai_admin_staff_id') ?? '' : '')
  const [code, setCode]       = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [codeError, setCodeError] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks]     = useState<TaskProfile[]>([])
  const [tab, setTab]         = useState<'overview' | 'people' | 'intelligence' | 'action' | 'learning' | 'suggest' | 'events' | 'knowledge' | 'review'>('overview')

  // Staff Management tab state
  const [staffList,       setStaffList]       = useState<{id:string;name:string;email:string;department:string|null;role:string|null;office_id:string|null;job_level:string;manager_id:string|null}[]>([])
  const [staffLoading,    setStaffLoading]    = useState(false)
  const [csvText,         setCsvText]         = useState('')
  const [csvParsed,       setCsvParsed]       = useState<Record<string,string>[]>([])
  const [csvError,        setCsvError]        = useState('')
  const [importResult,    setImportResult]    = useState<{inserted:number;updated:number;errors:string[]} | null>(null)
  const [importing,       setImporting]       = useState(false)
  // AI import flow
  type AIParseResult = {
    column_mapping: { source: string; action: string; target_field: string | null; new_col_name: string | null; new_col_type: string | null; new_col_description: string }[]
    new_columns:    { col_name: string; col_type: string; description: string; sample_values: string[] }[]
    rows:           { name: string; email: string; office_id: string; department: string; role: string; job_level: string; manager_name: string; team: string | null; extra: Record<string, string>; warnings: string[] }[]
    summary:        { total: number; clean: number; warnings: number; new_columns_found: number }
  }
  const [aiParseState,    setAiParseState]    = useState<'idle'|'loading'|'ready'|'error'>('idle')
  const [aiParseResult,   setAiParseResult]   = useState<AIParseResult | null>(null)
  const [approvedNewCols, setApprovedNewCols] = useState<Set<string>>(new Set())
  const [aiCommitState,   setAiCommitState]   = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [aiCommitResult,  setAiCommitResult]  = useState<{inserted:number;updated:number;skipped:number;manager_links_set:number;manager_unresolved:{name:string;manager_name:string}[];errors:string[];new_columns_added:string[];credentials:{name:string;email:string;temp_password:string;access_enabled:boolean;job_level:string}[]} | null>(null)
  const [addForm,         setAddForm]         = useState({ name:'', email:'', department:'', role:'', office_id:'dubai', job_level:'staff', manager_email:'' })
  const [addState,        setAddState]        = useState<'idle'|'saving'|'done'|'error'>('idle')
  const [addError,        setAddError]        = useState('')
  const [staffSearch,     setStaffSearch]     = useState('')
  const [staffMode,       setStaffMode]       = useState<'list'|'import'|'add'>('list')
  const [peopleFilter,    setPeopleFilter]    = useState<'all'|'enabled'|'not-enabled'|'profile-done'|'profile-pending'>('all')
  const [hrmsSyncState,   setHrmsSyncState]   = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [hrmsSyncResult,  setHrmsSyncResult]  = useState<{synced:number;managers_linked:number;message:string}|null>(null)

  async function syncFromHRMS() {
    if (hrmsSyncState === 'loading') return
    setHrmsSyncState('loading')
    setHrmsSyncResult(null)
    try {
      const res  = await fetch('/api/hrms-sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026' }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setHrmsSyncState('error'); return }
      setHrmsSyncResult(data)
      setHrmsSyncState('done')
      fetchStaffList()
    } catch {
      setHrmsSyncState('error')
    }
  }

  async function fetchStaffList() {
    setStaffLoading(true)
    const res  = await fetch('/api/staff-list')
    const data = await res.json()
    setStaffList(Array.isArray(data) ? data : [])
    setStaffLoading(false)
  }

  function parseCSV(raw: string): Record<string, string>[] {
    const lines = raw.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
      return row
    })
  }

  function handleCSVChange(raw: string) {
    setCsvText(raw)
    setCsvError('')
    setImportResult(null)
    if (!raw.trim()) { setCsvParsed([]); return }
    try {
      const rows = parseCSV(raw)
      if (!rows.length) { setCsvError('Could not parse CSV — check formatting.'); return }
      if (!rows[0].email) { setCsvError('CSV must have an "email" column.'); return }
      setCsvParsed(rows)
    } catch { setCsvError('Invalid CSV format.') }
  }

  async function runImport() {
    if (!csvParsed.length) return
    setImporting(true)
    setImportResult(null)
    const res  = await fetch('/api/staff-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: 'taos2026', staff: csvParsed }),
    })
    const data = await res.json()
    setImportResult(data)
    setImporting(false)
    if (data.inserted || data.updated) { fetchStaffList() }
  }

  async function analyseWithAI() {
    if (!csvText.trim()) return
    setAiParseState('loading')
    setAiParseResult(null)
    setAiCommitResult(null)
    setApprovedNewCols(new Set())
    try {
      const res  = await fetch('/api/import/parse', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setAiParseState('error'); return }
      setAiParseResult(data)
      // Auto-approve new columns that seem high-value
      const autoApprove = new Set<string>()
      for (const col of data.new_columns ?? []) autoApprove.add(col.col_name)
      setApprovedNewCols(autoApprove)
      setAiParseState('ready')
    } catch { setAiParseState('error') }
  }

  async function runAICommit() {
    if (!aiParseResult?.rows?.length) return
    setAiCommitState('loading')
    const approved = aiParseResult.new_columns.filter(c => approvedNewCols.has(c.col_name))
    try {
      const res  = await fetch('/api/import/commit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows: aiParseResult.rows, new_columns: approved }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setAiCommitState('error'); return }
      setAiCommitResult(data)
      setAiCommitState('done')
      fetchStaffList()
    } catch { setAiCommitState('error') }
  }

  async function addSingleStaff() {
    if (!addForm.name.trim() || !addForm.email.trim()) { setAddError('Name and email are required.'); return }
    setAddState('saving')
    setAddError('')
    const res  = await fetch('/api/staff-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: 'taos2026', staff: [addForm] }),
    })
    const data = await res.json()
    if (data.error) { setAddError(data.error); setAddState('error'); return }
    setAddState('done')
    setAddForm({ name:'', email:'', department:'', role:'', office_id:'dubai', job_level:'staff', manager_email:'' })
    fetchStaffList()
    setTimeout(() => setAddState('idle'), 2000)
  }
  const [suggestion, setSuggestion]   = useState('')
  const [suggestDept, setSuggestDept] = useState('Events')
  const [suggestTier, setSuggestTier] = useState<'foundation' | 'adoption' | 'advanced'>('foundation')
  const [suggestState, setSuggestState] = useState<'idle' | 'thinking' | 'ready' | 'publishing'>('idle')
  const [generatedCourse, setGeneratedCourse] = useState<Record<string, unknown> | null>(null)
  const [publishMsg, setPublishMsg]   = useState('')
  // Attribution — who suggested this course
  const [creditName, setCreditName]   = useState('')
  const [creditRole, setCreditRole]   = useState('')
  const [creditId,   setCreditId]     = useState('')
  const [learningData, setLearningData] = useState<{ completions: LearningCompletion[]; courses: LearningCourse[]; staff: LearningStaff[]; attempts: LearningAttempt[] } | null>(null)
  const [learningLoading, setLearningLoading] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)
  const [seedLoading, setSeedLoading]   = useState(false)
  const [seedMsg, setSeedMsg]           = useState('')
  const [officeFilter, setOfficeFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [isDemo,  setIsDemo]  = useState(false)
  const [feedbackItems,  setFeedbackItems]  = useState<{id:string;name:string;department:string|null;message:string;created_at:string}[]>([])
  const [feedbackReport, setFeedbackReport] = useState<Record<string,unknown> | null>(null)
  const [reportLoading,  setReportLoading]  = useState(false)
  const [reportError,    setReportError]    = useState('')
  const [showWelcome,    setShowWelcome]    = useState(() => {
    if (typeof window === 'undefined') return false
    if (new URLSearchParams(window.location.search).get('welcome') === '1') return true
    const uid = sessionStorage.getItem('tai_admin_staff_id') ?? 'admin'
    return !localStorage.getItem(`tresci_admin_welcomed_${uid}`)
  })
  const [tourStep,    setTourStep]    = useState<number | null>(null)
  const [tourRect,    setTourRect]    = useState<DOMRect | null>(null)
  const [showRoadmap, setShowRoadmap] = useState(false)
  const [gettingStarted, setGettingStarted] = useState(() => {
    if (typeof window === 'undefined') return { staff: false, brief: false, course: false }
    const stored = localStorage.getItem('tresci_admin_progress')
    return stored ? JSON.parse(stored) : { staff: false, brief: false, course: false }
  })
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [readinessDeptFilter, setReadinessDeptFilter] = useState('all')
  const [deptTierFilter, setDeptTierFilter] = useState('all')
  const [memberSearch, setMemberSearch]     = useState('')
  const [interviewFilter, setInterviewFilter] = useState<'all' | 'done' | 'pending'>('all')

  // Events tab
  type EventRow = {
    id: string; name: string; type: string; status: string
    event_date: string | null; venue: string | null; city: string | null
    client_name: string | null; description: string | null
    event_staff?: { count: number }[] | null
    documents?:   { count: number }[] | null
    event_checklist?: { count: number }[] | null
  }
  const [events,        setEvents]        = useState<EventRow[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventForm,     setEventForm]     = useState({ name: '', type: 'conference', status: 'planning', event_date: '', venue: '', city: '', client_name: '', description: '' })
  const [eventSaving,   setEventSaving]   = useState(false)
  const [eventMsg,      setEventMsg]      = useState('')
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [eventStaff,    setEventStaff]    = useState<{id:string;role:string|null;staff_members:{id:string;name:string;department:string|null}}[]>([])
  const [assignStaffId, setAssignStaffId] = useState('')
  const [assignRole,    setAssignRole]    = useState('')
  const [eventView,       setEventView]       = useState<'upcoming' | 'past'>('upcoming')
  type EventSummary = { confirmed_revenue: number; pending_revenue: number; total_expenses: number; approved_budget: number; currency: string; net_pnl: number; margin_pct: number | null; task_total: number; task_done: number; task_pct: number; has_budget: boolean; has_revenue: boolean; has_expenses: boolean }
  const [eventSummaries,  setEventSummaries]  = useState<Record<string, EventSummary>>({})
  const [summariesLoading,setSummariesLoading]= useState(false)

  // Review Queue tab (super admin only)
  type DraftCourse = { id: string; title: string; subtitle: string; tier_level: string; dept_tags: string[]; is_mandatory: boolean; estimated_minutes: number; overview: string; suggested_by_name: string | null; suggested_by_role: string | null; created_at: string }
  const [draftCourses,    setDraftCourses]    = useState<DraftCourse[]>([])
  const [draftsLoading,   setDraftsLoading]   = useState(false)
  const [reviewMsg,       setReviewMsg]       = useState('')
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null)

  async function fetchDrafts() {
    setDraftsLoading(true)
    const res = await fetch('/api/courses?status=draft')
    if (res.ok) setDraftCourses(await res.json())
    setDraftsLoading(false)
  }

  async function approveCourse(courseId: string) {
    setReviewMsg('')
    const res = await fetch('/api/courses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026', course_id: courseId }),
    })
    if (res.ok) {
      setDraftCourses(prev => prev.filter(c => c.id !== courseId))
      setExpandedDraftId(null)
      setReviewMsg('Course approved and published to the library.')
    } else {
      setReviewMsg('Approval failed. Try again.')
    }
  }

  async function rejectCourse(courseId: string) {
    setReviewMsg('')
    const res = await fetch('/api/courses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026', course_id: courseId }),
    })
    if (res.ok) {
      setDraftCourses(prev => prev.filter(c => c.id !== courseId))
      setExpandedDraftId(null)
      setReviewMsg('Course rejected and removed.')
    } else {
      setReviewMsg('Rejection failed. Try again.')
    }
  }

  // Knowledge / Documents tab
  type DocRow = {
    id: string; title: string; type: string; visibility: string
    word_count: number; event_id: string | null; created_at: string
    events?: { name: string } | null
    layer: string; department: string; min_level: string
    tresci_use: boolean; confidence: number; flagged: boolean; status: string
  }
  const [docs,          setDocs]          = useState<DocRow[]>([])
  const [docsLoading,   setDocsLoading]   = useState(false)
  const [docFile,       setDocFile]       = useState<File | null>(null)
  const [docForm,       setDocForm]       = useState({ title: '', type: 'policy', visibility: 'all', event_id: '' })
  const [docUploading,  setDocUploading]  = useState(false)
  const [docMsg,        setDocMsg]        = useState('')
  const [otherTypeLabel,setOtherTypeLabel]= useState('')
  const [saveAsNewType, setSaveAsNewType] = useState(false)
  const [customDocTypes,setCustomDocTypes]= useState<{ key: string; label: string }[]>([])
  const [docAnalysis,  setDocAnalysis]   = useState<{ layer: string; department: string; min_level: string; tresci_use: boolean; ai_reasoning: string; confidence: number; flagged: boolean } | null>(null)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [showUploadForm,  setShowUploadForm]  = useState(false)
  const [docFilter,       setDocFilter]       = useState<'all'|'knowledge_base'|'general'|'specific'|'flagged'>('all')

  async function fetchEvents() {
    setEventsLoading(true)
    const res  = await fetch('/api/events')
    const data = await res.json()
    setEvents(Array.isArray(data) ? data : [])
    setEventsLoading(false)
  }

  async function fetchEventSummaries() {
    setSummariesLoading(true)
    const res = await fetch('/api/events/batch-summary')
    if (res.ok) setEventSummaries(await res.json())
    setSummariesLoading(false)
  }

  async function fetchEventStaff(eventId: string) {
    const res  = await fetch(`/api/events/staff?event_id=${eventId}`)
    const data = await res.json()
    setEventStaff(Array.isArray(data) ? data : [])
  }

  async function createEvent() {
    if (!eventForm.name.trim()) { setEventMsg('Event name is required.'); return }
    setEventSaving(true); setEventMsg('')
    const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventForm) })
    if (res.ok) { setEventMsg('Event created.'); setEventForm({ name: '', type: 'conference', status: 'planning', event_date: '', venue: '', city: '', client_name: '', description: '' }); fetchEvents() }
    else { setEventMsg('Failed to create event.') }
    setEventSaving(false)
  }

  async function assignStaff() {
    if (!selectedEvent || !assignStaffId) return
    await fetch('/api/events/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: selectedEvent.id, staff_id: assignStaffId, role: assignRole || null }) })
    setAssignStaffId(''); setAssignRole('')
    fetchEventStaff(selectedEvent.id)
  }

  async function removeEventStaff(staffId: string) {
    if (!selectedEvent) return
    await fetch(`/api/events/staff?event_id=${selectedEvent.id}&staff_id=${staffId}`, { method: 'DELETE' })
    fetchEventStaff(selectedEvent.id)
  }

  async function fetchDocs() {
    setDocsLoading(true)
    const res  = await fetch('/api/documents/list?admin=1')
    const data = await res.json()
    setDocs(Array.isArray(data) ? data : [])
    setDocsLoading(false)
  }

  async function fetchCustomDocTypes() {
    const res  = await fetch('/api/document-types')
    const data = await res.json()
    setCustomDocTypes(Array.isArray(data) ? data : [])
  }

  async function uploadDoc() {
    if (!docFile || !docForm.title.trim()) { setDocMsg('File and title are required.'); return }
    if (docForm.type === 'other' && !otherTypeLabel.trim()) { setDocMsg('Please specify what type this document is.'); return }
    setDocUploading(true); setDocMsg('')

    // If type is 'other', use the custom label normalised to snake_case as the stored type key
    const finalType = docForm.type === 'other'
      ? otherTypeLabel.trim().toLowerCase().replace(/\s+/g, '_')
      : docForm.type

    setDocAnalysis(null)
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const form = new FormData()
    form.append('file', docFile)
    form.append('title', docForm.title)
    form.append('type', finalType)
    form.append('visibility', docForm.visibility)
    if (docForm.event_id) form.append('event_id', docForm.event_id)
    if (adminStaffId) form.append('uploaded_by', adminStaffId)
    try {
      const res  = await fetch('/api/documents/upload', { method: 'POST', body: form })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* non-JSON response e.g. 504 timeout */ }
      if (res.ok) {
        setDocMsg(`Done. ${(data.document as Record<string,unknown>)?.word_count?.toLocaleString()} words extracted.${(data.analysis as Record<string,unknown>)?.flagged ? ' Flagged for review — low confidence.' : ''}`)
        setDocAnalysis(data.analysis as never ?? null)
        setDocFile(null)
        setDocForm({ title: '', type: 'policy', visibility: 'all', event_id: '' })
        setOtherTypeLabel('')
        setSaveAsNewType(false)
        fetchDocs()
        if (saveAsNewType) fetchCustomDocTypes()
      } else {
        const msg = (data.error as string) ??
          (res.status === 504 ? 'Tresci took too long to process this document. Try a smaller file or try again in a moment.' :
           res.status === 503 ? 'Tresci is under high load right now. Please wait a moment and try again — your document has not been saved.' :
           'Something went wrong while processing your document. Please try again.')
        setDocMsg(msg)
      }
    } catch {
      setDocMsg('Could not reach the server. Check your connection and try again.')
    }
    setDocUploading(false)
  }

  async function deleteDoc(id: string) {
    await fetch(`/api/documents/list?id=${id}`, { method: 'DELETE' })
    fetchDocs()
  }


  async function seedDemo() {
    setSeedLoading(true); setSeedMsg('')
    const res = await fetch('/api/seed-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026' }) })
    const data = await res.json()
    setSeedMsg(data.message ?? data.error ?? 'Done')
    setSeedLoading(false)
    if (data.success) fetchData()
  }

  async function clearDemo() {
    setSeedLoading(true); setSeedMsg('')
    const res = await fetch('/api/seed-demo', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026' }) })
    const data = await res.json()
    setSeedMsg(data.message ?? data.error ?? 'Cleared')
    setSeedLoading(false)
    if (data.success) fetchData()
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [membersRes, tasksRes, statusRes, feedbackRes] = await Promise.all([
      fetch('/api/staff-list'),
      fetch('/api/task-profiles'),
      fetch('/api/platform-status'),
      fetch('/api/feedback'),
    ])
    if (membersRes.ok) setMembers(await membersRes.json())
    if (tasksRes.ok)   setTasks(await tasksRes.json())
    if (statusRes.ok) {
      const s = await statusRes.json()
      setIsDemo(s.is_demo ?? false)
    }
    if (feedbackRes.ok) setFeedbackItems(await feedbackRes.json())
    setLoading(false)
  }, [])

  async function fetchLearning() {
    if (learningData) return // already loaded
    setLearningLoading(true)
    const res = await fetch('/api/admin-learning')
    if (res.ok) setLearningData(await res.json())
    setLearningLoading(false)
  }


  async function submitSuggestion() {
    if (!suggestion.trim()) return
    setSuggestState('thinking')
    setGeneratedCourse(null)
    setPublishMsg('')
    const res = await fetch('/api/generate-course', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026',
        suggestion: suggestion.trim(),
        department: suggestDept,
        tier_level: suggestTier,
      }),
    })
    const data = await res.json()
    if (res.ok && data.course) {
      setGeneratedCourse(data.course)
      setSuggestState('ready')
    } else {
      setPublishMsg(data.error ?? 'Failed to generate. Try again.')
      setSuggestState('idle')
    }
  }

  async function submitForReview() {
    if (!generatedCourse) return
    setSuggestState('publishing')
    const courseWithCredit = {
      ...generatedCourse,
      ...(creditName ? { suggested_by_name: creditName, suggested_by_role: creditRole || null } : {}),
      ...(creditId   ? { suggested_by_id:   creditId   } : {}),
    }
    const pubRes = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026', course: courseWithCredit }),
    })
    if (pubRes.ok) {
      setPublishMsg(`Course submitted for review. You will be notified on your dashboard once it is approved and live.`)
      setSuggestState('idle')
      setSuggestion('')
      setGeneratedCourse(null)
      setCreditName('')
      setCreditRole('')
      setCreditId('')
    } else {
      const d = await pubRes.json()
      setPublishMsg(d.error ?? 'Submission failed. Try again.')
      setSuggestState('ready')
    }
  }

  const TOUR_STEPS = [
    { id: 'tour-tabs',             title: 'Your main sections',         desc: 'Navigate between Overview, All Staff, Intelligence, Content Studio, Events, Knowledge Base, and more using these tabs.' },
    { id: 'tour-stats',            title: 'Org readiness at a glance',  desc: 'Total staff in the system, how many have completed their profile, and your organisation\'s live TAIRS score — all updating in real time.' },
    { id: 'tour-started',          title: 'Your first 3 actions',       desc: 'Complete these three steps to get Trescademy fully running. Each one unlocks more of the platform for your team.' },
    { id: 'tour-intelligence-tab', title: 'Intelligence tab',           desc: 'AI-generated analysis of your org\'s readiness. Department breakdowns, tier distributions, and what to do about gaps — with no manual input.' },
    { id: 'tour-studio-tab',       title: 'Content Studio',             desc: 'Describe a skill gap, pick a department, and Gemini generates a full course with reading content, tasks, and a quiz. Ready to publish in under a minute.' },
    { id: 'tour-tresci-btn',       title: 'Tresci — your AI assistant', desc: 'Ask Tresci anything: team progress, how to use a feature, what a TAIRS score means, or what to do next. It knows your org data.' },
  ]

  useEffect(() => {
    if (tourStep === null) return
    const step = TOUR_STEPS[tourStep]
    const el = document.getElementById(step.id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const update = () => setTourRect(el.getBoundingClientRect())
    const t = setTimeout(update, 350)
    return () => clearTimeout(t)
  }, [tourStep]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authed) return
    fetch('/api/platform-status').then(r => r.json()).then(d => setIsDemo(d.is_demo ?? false)).catch(() => {})
    fetchData()
    const ch = supabase.channel('admin-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_members' }, fetchData)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_task_profiles' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [authed, fetchData])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    if (!adminEmail.trim() || !code.trim()) {
      setCodeError('Enter your email and password.')
      return
    }
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim(), password: code.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.id) {
        sessionStorage.setItem('tai_admin_authed', '1')
        sessionStorage.setItem('tai_admin_staff_id', data.id)
        localStorage.setItem('tai_staff_id', data.id)
        setAdminStaffId(data.id)
        setAuthed(true)
      } else {
        setCodeError(data.error ?? 'Incorrect email or password.')
      }
    } catch {
      setCodeError('Something went wrong. Try again.')
    }
  }

  /* ── Derived ── */
  const totalJoined      = members.length
  const profilesComplete = members.filter(m => m.profile_complete).length
  const profilePending   = totalJoined - profilesComplete
  const totalTasks       = tasks.length
  const readinessList    = tasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)
  const avgReadiness     = readinessList.length ? (readinessList.reduce((a, b) => a + b, 0) / readinessList.length).toFixed(1) : '—'

  const officeMap: Record<string, { label: string; total: number; color: string; count: number }> = {}
  for (const o of OFFICES) officeMap[o.id] = { ...o, count: 0 }
  for (const m of members) if (officeMap[m.office_id]) officeMap[m.office_id].count++

  const deptMap: Record<string, { joined: number; complete: number }> = {}
  for (const m of members) {
    const d = m.department ?? 'Other'
    if (!deptMap[d]) deptMap[d] = { joined: 0, complete: 0 }
    deptMap[d].joined++
    if (m.profile_complete) deptMap[d].complete++
  }

  const allDepts = [...new Set(members.map(m => m.department ?? 'Other'))].sort()

  const filteredMembers = members.filter(m => {
    if (officeFilter !== 'all' && m.office_id !== officeFilter) return false
    if (deptFilter !== 'all' && (m.department ?? 'Other') !== deptFilter) return false
    if (interviewFilter === 'done'    && !m.profile_complete) return false
    if (interviewFilter === 'pending' &&  m.profile_complete) return false
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase()
      if (!m.name.toLowerCase().includes(q) && !(m.email ?? '').toLowerCase().includes(q) && !(m.department ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const memberIndex = Object.fromEntries(members.map(m => [m.id, m]))

  // Tasks filtered by the readiness/tools dept selector (separate from the tab-level filters)
  const rdFilteredTasks = readinessDeptFilter === 'all'
    ? tasks
    : tasks.filter(t => (memberIndex[t.staff_id]?.department ?? 'Other') === readinessDeptFilter)
  const deptReadinessList = rdFilteredTasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)

  const filteredTasks = tasks.filter(t => {
    const m = memberIndex[t.staff_id]
    return (officeFilter === 'all' || m?.office_id === officeFilter) &&
      (deptFilter === 'all' || (m?.department ?? 'Other') === deptFilter)
  })

  const getOffice = (id: string) => OFFICES.find(o => o.id === id)

  /* ── AI Readiness breakdown (filtered by readinessDeptFilter) ── */
  const readinessDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of deptReadinessList) { if (r >= 1 && r <= 5) readinessDist[r]++ }
  const readinessLabels: Record<number, string> = {
    1: 'Never used AI',
    2: 'Tried it once or twice',
    3: 'Use AI occasionally',
    4: 'Use AI most days',
    5: 'Build AI workflows',
  }
  const readinessColors = ['#FF6B6B', '#8B1A1A', '#8B1A1A', '#00897B', '#3D6B00']

  /* ── Most common tools (filtered by readinessDeptFilter) ── */
  const toolCount: Record<string, number> = {}
  for (const t of rdFilteredTasks) for (const tool of (t.tools_used ?? [])) toolCount[tool] = (toolCount[tool] ?? 0) + 1
  const topTools = Object.entries(toolCount).sort((a, b) => b[1] - a[1]).slice(0, 10)

  /* ═══════════════════════════════════════════════════════════════════
     TAIRS — TAI Organizational AI Readiness Score  (0–100)

     Built for Trescon's specific context: events + media + B2B sales
     company with 4 offices. Scoring reflects realistic AI adoption
     patterns for this industry, not generic tech company benchmarks.

     Three dimensions:
     ① AI Fluency         (0–40 pts) — self-reported readiness 1–5
     ② Digital Maturity   (0–35 pts) — sophistication of tools used
     ③ Engagement Rate    (0–25 pts) — % of joiners who completed interview

     Tier thresholds (calibrated for events/media industry):
       75–100  AI-Forward     (ready to deploy automations now)
       55–74   AI-Ready       (upskill + deploy in parallel)
       35–54   AI-Aware       (foundation building, 90-day plan)
       15–34   AI-Curious     (awareness + pilot campaigns)
       0–14    AI-Unaware     (start from digital literacy)

     Industry context: Typical events company baseline is 25–40.
     Trescon target: all depts to 60+ within 12 months.
  ═══════════════════════════════════════════════════════════════════ */

  // Tool classification for Trescon's tool stack
  const AI_TOOLS    = new Set(['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'GitHub Copilot',
    'Midjourney', 'DALL-E', 'Notion AI', 'Grammarly', 'Jasper', 'Copy.ai'])
  const MODERN_SAAS = new Set(['HubSpot', 'Salesforce', 'Canva', 'Figma', 'Google Analytics',
    'Looker Studio', 'Data Studio', 'Asana', 'Notion', 'Slack', 'LinkedIn',
    'Meta Ads', 'Google Ads', 'LinkedIn Ads', 'Google Ads', 'Hootsuite',
    'Mailchimp', 'CapCut', 'Premiere Pro', 'Adobe Photoshop', 'Adobe Illustrator',
    'Jira', 'GitHub', 'AWS', 'Google Cloud', 'Trello', 'Xero', 'QuickBooks',
    'Terminal/CLI', 'ATS Software'])

  // Department AI impact priority for Trescon (HIGH = where AI helps most)
  const DEPT_IMPACT: Record<string, { priority: string; color: string; why: string }> = {
    'Events':               { priority: 'Critical', color: '#FF6B6B', why: 'Massive manual coordination overhead — vendor, logistics, reporting' },
    'Sales & Sponsorship':  { priority: 'Critical', color: '#FF6B6B', why: 'Prospecting, proposal writing, follow-ups — all AI-automatable' },
    'Finance':              { priority: 'Critical', color: '#FF6B6B', why: 'Reconciliation, reporting, approval chasing — high automation value' },
    'Marketing':            { priority: 'High',     color: '#8B1A1A', why: 'Content creation and campaign analysis — most mature AI tools exist' },
    'DemandifyMedia':       { priority: 'High',     color: '#8B1A1A', why: 'Ad optimisation and reporting — AI tools are industry standard now' },
    'HR & Recruitment':     { priority: 'High',     color: '#8B1A1A', why: 'CV screening and scheduling are solved problems with AI' },
    'Content & Design':     { priority: 'High',     color: '#8B1A1A', why: 'Generative AI for content/design is fastest-moving category' },
    'Leadership':           { priority: 'High',     color: '#8B1A1A', why: 'Decision intelligence and real-time visibility gaps' },
    'IT':                   { priority: 'Medium',   color: '#8B1A1A', why: 'Already closest — focus on enabling others, not self-training' },
    'Operations':           { priority: 'Medium',   color: '#8B1A1A', why: 'Process automation needs depends on current tool stack' },
    'Government Relations': { priority: 'Medium',   color: '#8B1A1A', why: 'Document automation + status tracking — achievable in 6 months' },
    'Other':                { priority: 'Medium',   color: '#8B1A1A', why: 'Assess after more data' },
  }

  // TAIRS calculation per entity (dept/office/person)
  function calcTAIRS(params: {
    readinessScores: number[]   // self-reported 1–5
    allTools: string[]          // all tool mentions (with duplicates)
    interviewed: number         // members who completed interview
    totalJoinedForGroup: number // members who joined
  }) {
    const { readinessScores, allTools, interviewed, totalJoinedForGroup } = params

    // ① AI Fluency (0–40)
    const fluency = readinessScores.length
      ? (readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length / 5) * 40
      : 0

    // ② Digital Maturity (0–35)
    // Ratio of advanced tool usage vs total — avoids rewarding sheer volume
    const aiMentions     = allTools.filter(t => AI_TOOLS.has(t)).length
    const modernMentions = allTools.filter(t => MODERN_SAAS.has(t)).length
    const total          = allTools.length || 1
    const maturityRatio  = (aiMentions * 3 + modernMentions * 1.5) / total
    const maturity       = Math.min(35, maturityRatio * 35 * 3) // scale up (events co. typically < 0.3)

    // ③ Engagement Rate (0–25)
    const engagement = totalJoinedForGroup > 0
      ? (interviewed / totalJoinedForGroup) * 25
      : 0

    const total_score = Math.round(fluency + maturity + engagement)
    return {
      score:    Math.min(100, total_score),
      fluency:  Math.round(fluency),
      maturity: Math.round(maturity),
      engagement: Math.round(engagement),
    }
  }

  // TAIRS tier label + color
  function tairsTier(score: number) {
    if (score >= 75) return { label: 'AI-Forward',  color: '#166534', desc: 'Deploy automations now' }
    if (score >= 55) return { label: 'AI-Ready',    color: '#0E7490', desc: 'Train + deploy in parallel' }
    if (score >= 35) return { label: 'AI-Aware',    color: '#92400E', desc: '90-day foundation plan' }
    if (score >= 15) return { label: 'AI-Curious',  color: '#C2410C', desc: 'Awareness + pilot needed' }
    return               { label: 'AI-Unaware',   color: '#991B1B', desc: 'Start from literacy basics' }
  }

  // ── Per-department TAIRS ──
  type DeptTairs = {
    dept: string; score: number; fluency: number; maturity: number; engagement: number
    interviewed: number; joined: number; impact: typeof DEPT_IMPACT[string]
  }
  const deptTairsMap: DeptTairs[] = []
  for (const dept of [...new Set(members.map(m => m.department ?? 'Other'))]) {
    const dMembers   = members.filter(m => (m.department ?? 'Other') === dept)
    const dTasks     = tasks.filter(t => (memberIndex[t.staff_id]?.department ?? 'Other') === dept)
    const readScores = dTasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)
    const allTools   = dTasks.flatMap(t => t.tools_used ?? [])
    const interviewed = dMembers.filter(m => m.profile_complete).length
    const r = calcTAIRS({ readinessScores: readScores, allTools, interviewed, totalJoinedForGroup: dMembers.length })
    deptTairsMap.push({ dept, ...r, interviewed, joined: dMembers.length, impact: DEPT_IMPACT[dept] ?? DEPT_IMPACT['Other'] })
  }
  const sortedDeptTairs = [...deptTairsMap].sort((a, b) => b.score - a.score)

  // ── Per-office TAIRS ──
  const officeTairs = OFFICES.map(o => {
    const oMembers   = members.filter(m => m.office_id === o.id)
    const oTasks     = tasks.filter(t => memberIndex[t.staff_id]?.office_id === o.id)
    const readScores = oTasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)
    const allTools   = oTasks.flatMap(t => t.tools_used ?? [])
    const interviewed = oMembers.filter(m => m.profile_complete).length
    const r = calcTAIRS({ readinessScores: readScores, allTools, interviewed, totalJoinedForGroup: oMembers.length })
    return { ...o, ...r, interviewed, joined: oMembers.length }
  }).filter(o => o.joined > 0).sort((a, b) => b.score - a.score)

  // ── Org-level TAIRS (weighted by dept size) ──
  let orgScore = 0
  if (deptTairsMap.length > 0) {
    const totalW = deptTairsMap.reduce((s, d) => s + d.joined, 0) || 1
    orgScore = Math.round(deptTairsMap.reduce((s, d) => s + d.score * (d.joined / totalW), 0))
  }
  const orgTier = tairsTier(orgScore)

  // ── Top individual TAIRS ──
  const memberTairs = Object.fromEntries(
    members.map(m => {
      const mTasks     = tasks.filter(t => t.staff_id === m.id)
      const readScores = mTasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)
      const allTools   = mTasks.flatMap(t => t.tools_used ?? [])
      const r = calcTAIRS({ readinessScores: readScores, allTools, interviewed: m.profile_complete ? 1 : 0, totalJoinedForGroup: 1 })
      return [m.id, r]
    })
  )
  const topIndividuals = members
    .filter(m => m.profile_complete)
    .map(m => ({ ...m, toars: memberTairs[m.id]?.score ?? 0 }))
    .sort((a, b) => b.toars - a.toars)
    .slice(0, 8)

  // Legacy compat for existing readiness dist block
  const deptScores = sortedDeptTairs.map(d => ({ dept: d.dept, avg: d.fluency / 8, count: d.interviewed }))
  const officeScores = officeTairs.map(o => ({ ...o, avg: o.fluency / 8 }))

  /* ── AI-generated response detector ──
     Flags answers that pattern-match AI writing rather than human speech.
     Checks: AI phrases, formal corporate language, excessive structure,
     unnaturally long responses, suspiciously perfect formatting.
     Score 0-100. Above 45 = flagged for review.
  ── */
  function detectAIWriting(text: string): { score: number; flags: string[]; verdict: string } {
    if (!text || text.length < 30) return { score: 0, flags: [], verdict: 'Too short to assess' }
    const flags: string[] = []
    let score = 0
    const lower = text.toLowerCase()

    // Common AI sentence starters and filler phrases
    const aiPhrases = [
      'as a ', 'certainly ', 'i would be happy', 'it is worth noting',
      'furthermore', 'in conclusion', 'to summarize', 'to ensure', 'in order to',
      'this allows me to', 'this enables', 'i leverage', ' utilize ', ' utilise ',
      'actionable insights', 'synergies', 'key stakeholders', 'bandwidth',
      'it is important to note', 'it is crucial', 'it is essential',
      'moving forward', 'going forward', 'at the end of the day',
      'in terms of', 'in the context of', 'with respect to',
    ]
    const phraseHits = aiPhrases.filter(p => lower.includes(p)).length
    if (phraseHits >= 3) { score += 35; flags.push(`AI filler phrases (${phraseHits} found)`) }
    else if (phraseHits >= 2) { score += 20; flags.push('AI language patterns detected') }
    else if (phraseHits === 1) { score += 8 }

    // Formal corporate vocabulary (uncommon in casual interview responses)
    const formalWords = [
      'ensure', 'facilitate', 'leverage', 'optimize', 'implement',
      'streamline', 'stakeholder', 'deliverable', 'actionable',
      'strategic', 'holistic', 'robust', 'scalable', 'seamless',
      'proactive', 'synergy', 'paradigm', 'ecosystem',
    ]
    const formalHits = formalWords.filter(w => lower.includes(w)).length
    if (formalHits >= 4) { score += 25; flags.push(`Formal corporate language (${formalHits} words)`) }
    else if (formalHits >= 2) { score += 12; flags.push('Some formal language') }

    // Unnaturally structured (bullet points, numbered lists)
    const bulletLines  = (text.match(/^[\-•\*\u2022]/gm) || []).length
    const numberedLines = (text.match(/^\d+[\.\)]/gm) || []).length
    if (bulletLines > 3 || numberedLines > 3) { score += 20; flags.push('Over-structured with lists') }
    else if (bulletLines > 1 || numberedLines > 1) { score += 8 }

    // Word count extremes
    const wordCount = text.trim().split(/\s+/).length
    if (wordCount > 300) { score += 25; flags.push(`Very long response (${wordCount} words)`) }
    else if (wordCount > 180) { score += 12; flags.push(`Long response (${wordCount} words)`) }
    else if (wordCount < 8) { score += 5 }

    // Unnaturally long sentences (AI tends toward complex sentence construction)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().split(/\s+/).length > 3)
    const avgSentLen = sentences.length > 0 ? wordCount / sentences.length : 0
    if (avgSentLen > 28) { score += 15; flags.push('Unnaturally long sentences') }

    // Perfect capitalisation + no informal language (humans make small errors)
    const hasInformal = /\b(gonna|wanna|kinda|sorta|yeah|nope|stuff|things|bit|tons|loads|heaps|super|really|very|just|like,|honestly)\b/i.test(text)
    if (!hasInformal && wordCount > 60) { score += 10; flags.push('No informal language (unusual for interview)') }

    // Verdict
    const final = Math.min(100, score)
    const verdict = final >= 65 ? 'Very likely AI-generated'
      : final >= 45 ? 'Possibly AI-assisted — review'
      : final >= 25 ? 'Some AI patterns — check'
      : 'Appears human-written'

    return { score: final, flags, verdict }
  }

  function dismissWelcome() {
    const uid = sessionStorage.getItem('tai_admin_staff_id') ?? 'admin'
    localStorage.setItem(`tresci_admin_welcomed_${uid}`, '1')
    setShowWelcome(false)
    if (!localStorage.getItem(`tresci_tour_done_${uid}`)) {
      setTimeout(() => setTourStep(0), 400)
    }
  }

  function endTour() {
    const uid = sessionStorage.getItem('tai_admin_staff_id') ?? 'admin'
    localStorage.setItem(`tresci_tour_done_${uid}`, '1')
    setTourStep(null)
    setTourRect(null)
  }

  function markProgress(key: 'staff' | 'brief' | 'course') {
    setGettingStarted((prev: { staff: boolean; brief: boolean; course: boolean }) => {
      if (prev[key]) return prev
      const next = { ...prev, [key]: true }
      localStorage.setItem('tresci_admin_progress', JSON.stringify(next))
      return next
    })
  }

  /* ── Login screen ── */
  if (!authed) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ width: '56px', height: '56px', background: '#00A5A320', border: '2px solid #00A5A3', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', marginBottom: '8px' }}>Admin Access</h1>
          <p style={{ fontSize: '13px', color: '#5B7080', marginBottom: '32px' }}>Trescademy — Leadership Dashboard</p>
          <form onSubmit={handleAuth}>
            <input type="email" value={adminEmail} onChange={e => { setAdminEmail(e.target.value); setCodeError('') }}
              placeholder="Your work email" autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? '#FF6B6B' : '#DDE8EE'}`, background: '#FFFFFF', color: '#0F1923', fontSize: '13px', outline: 'none', fontFamily: 'inherit', marginBottom: '10px', boxSizing: 'border-box' }} />
            <input type="password" value={code} onChange={e => { setCode(e.target.value); setCodeError('') }}
              placeholder="Password"
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? '#FF6B6B' : '#DDE8EE'}`, background: '#FFFFFF', color: '#0F1923', fontSize: '13px', outline: 'none', fontFamily: 'inherit', marginBottom: '12px', boxSizing: 'border-box' }} />
            {codeError && <p style={{ fontSize: '13px', color: '#FF6B6B', marginBottom: '12px' }}>{codeError}</p>}
            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#00897B', color: 'white', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter Dashboard
            </button>
          </form>
          <Link href="/dashboard" style={{ display: 'block', marginTop: '20px', fontSize: '13px', color: '#5B7080', textDecoration: 'none' }}>Back to dashboard</Link>
        </div>
      </div>
    )
  }

  /* ═══════════ DASHBOARD ═══════════ */
  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', color: '#0F1923' }}>

      {/* ── Welcome Modal (first login only) ── */}
      {showWelcome && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,165,163,0.35)', borderRadius: '16px', maxWidth: '640px', width: '100%', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,165,163,0.08)' }}>

            {/* Top colour bar */}
            <div style={{ height: '4px', background: 'linear-gradient(90deg, #00A5A3 0%, #C0F43C 60%, #A478FF 100%)' }} />

            <div style={{ padding: '36px 40px 32px' }}>

              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{ width: '52px', height: '52px', background: 'linear-gradient(135deg, #00A5A3 0%, #005F7A 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00897B', marginBottom: '3px' }}>First time here?</div>
                  <div style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.4px', lineHeight: 1.1 }}>Welcome to Trescademy</div>
                </div>
              </div>

              <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.75, margin: '0 0 28px' }}>
                Trescademy is Trescon&apos;s internal AI readiness platform — measuring where every employee stands today and moving them forward through structured, role-specific learning.
              </p>

              {/* Feature tiles — 3 column grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '28px' }}>
                {[
                  {
                    color: '#00897B',
                    bg: 'rgba(0,165,163,0.1)',
                    border: 'rgba(0,165,163,0.25)',
                    icon: <svg width="18" height="18" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
                    title: 'TAIRS Score',
                    desc: 'Live AI readiness score (0–100) per staff member',
                  },
                  {
                    color: '#00695C',
                    bg: 'rgba(192,244,60,0.08)',
                    border: 'rgba(192,244,60,0.22)',
                    icon: <svg width="18" height="18" fill="none" stroke="#3D6B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
                    title: 'AI Courses',
                    desc: 'Role-based learning paths, generated and tracked',
                  },
                  {
                    color: '#A478FF',
                    bg: 'rgba(164,120,255,0.09)',
                    border: 'rgba(164,120,255,0.25)',
                    icon: <svg width="18" height="18" fill="none" stroke="#A478FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
                    title: 'Tresci AI',
                    desc: 'Ask anything — platform, progress, or strategy',
                  },
                ].map((item, i) => (
                  <div key={i} style={{ padding: '16px 14px', background: item.bg, border: `1px solid ${item.border}`, borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', background: `${item.bg}`, border: `1px solid ${item.border}`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: item.color, marginBottom: '4px' }}>{item.title}</div>
                      <div style={{ fontSize: '11.5px', color: '#5B7080', lineHeight: 1.55 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={dismissWelcome}
                style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #00A5A3 0%, #00C9C7 100%)', color: 'white', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                Take me to the dashboard
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '13px', color: '#5B7080' }}>
                This screen only appears on first login
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', boxShadow: '0 1px 3px rgba(0,165,163,0.08)', padding: '0 40px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/admin" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img src="/trescon-logo.png" alt="Trescon" style={{ height: '40px', width: 'auto', display: 'block' }} />
          </Link>
          <div style={{ width: '1px', height: '22px', background: '#DDE8EE' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '22px', height: '22px', background: '#00897B', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Platform Admin</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {loading && <span style={{ fontSize: '13px', color: '#00897B' }}>Updating...</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00897B', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '13px', color: '#5B7080' }}>Live</span>
          </div>
          <Link href={adminStaffId ? `/dashboard?id=${adminStaffId}` : '/dashboard'} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            My Learning
          </Link>
          <Link href="/hr" style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            HR Portal
          </Link>
          <Link href="/docs" style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            Platform Docs
          </Link>
          <Link id="tour-tresci-btn" href="/insights" style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            AI Insights
          </Link>
          <button
            onClick={() => setShowRoadmap(true)}
            style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            What&apos;s Next
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('trescademy_staff_id')
              localStorage.removeItem('tai_staff_id')
              sessionStorage.removeItem('tai_admin_authed')
              sessionStorage.removeItem('tai_admin_staff_id')
              window.location.href = '/login'
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #fecaca', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg width="13" height="13" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
              <line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#FF6B6B' }}>Sign out</span>
          </button>
        </div>
      </nav>

      {/* ── Demo mode banner — auto-hides once real staff data is imported ── */}
      {isDemo && (
        <div style={{ background: 'rgba(139,26,26,0.08)', borderBottom: '1px solid rgba(139,26,26,0.25)', padding: '10px 40px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="14" height="14" fill="none" stroke="#8B1A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B1A1A', animation: 'demoGlow 3s linear infinite' }}>Demo Mode</span>
          <span style={{ fontSize: '13px', color: '#5B7080' }}>The data shown on this dashboard is sample data for demonstration purposes only. It does not represent any real individual or organisation.</span>
        </div>
      )}

      <div style={{ padding: '40px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00897B', marginBottom: '6px' }}>Trescon Platform</div>
            <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', marginBottom: '4px', margin: 0 }}>Leadership Dashboard</h1>
            <p style={{ fontSize: '13px', color: '#5B7080', margin: '6px 0 0' }}>
              Live org intelligence — AI readiness, learning progress, and staff development across all offices.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#5B7080' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00897B', animation: 'pulse 2s infinite' }} />
            Live · updates in real time
          </div>
        </div>

        {/* ── Tabs ── */}
        {(() => {
          const TAB_ACCENT: Record<string, string> = {
            overview:     '#00897B',
            people:       '#0E7490',
            intelligence: '#A478FF',
            learning:     '#00897B',
            action:       '#166534',
            suggest:      '#A478FF',
            events:       '#00897B',
            knowledge:    '#166534',
            review:       '#991B1B',
          }
          return (
            <div id="tour-tabs" style={{ display: 'flex', gap: '6px', marginBottom: '28px', flexWrap: 'wrap' }}>
              {([
                ['overview',     'Overview'],
                ['people',       'People'],
                ['intelligence', 'Intelligence'],
                ['learning',     'Staff Learning'],
                ['action',       'Playbook'],
                ['suggest',      'Content Studio'],
                ['events',       'Events'],
                ['knowledge',    'Knowledge Base'],
                ...(adminStaffId === 'super-admin' ? [['review', 'Review Queue']] : []),
              ] as [typeof tab, string][]).map(([t, label]) => {
                const accent  = TAB_ACCENT[t] ?? '#00897B'
                const active  = tab === t
                return (
                  <button key={t}
                    id={t === 'intelligence' ? 'tour-intelligence-tab' : t === 'suggest' ? 'tour-studio-tab' : undefined}
                    onClick={() => { setTab(t as typeof tab); if (t === 'learning') fetchLearning(); if (t === 'people') { fetchStaffList(); markProgress('staff') } if (t === 'events') fetchEvents(); if (t === 'knowledge') { fetchDocs(); fetchCustomDocTypes(); } if (t === 'review') fetchDrafts(); if (t === 'suggest') markProgress('course') }}
                    style={{
                      padding:         active ? '9px 22px' : '9px 20px',
                      borderRadius:    '10px',
                      border:          active ? `1.5px solid ${accent}` : '1px solid #DDE8EE',
                      cursor:          'pointer',
                      fontFamily:      'inherit',
                      fontSize:        '13px',
                      fontWeight:      active ? 800 : 600,
                      background:      active ? accent : '#FFFFFF',
                      color:           active ? '#FFFFFF' : '#5B7080',
                      boxShadow:       active ? `0 4px 14px ${accent}50` : '0 1px 2px rgba(15,25,35,0.04)',
                      transition:      'all 0.15s ease',
                      letterSpacing:   active ? '0.1px' : 'normal',
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {tab === 'overview' && (<>

        {/* ── Getting Started Card (until all 3 steps done) ── */}
        {!(gettingStarted.staff && gettingStarted.brief && gettingStarted.course) && (
          <div id="tour-started" style={{ marginBottom: '28px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00897B', marginBottom: '4px' }}>Getting Started</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Three things to explore first</div>
              </div>
              <div style={{ fontSize: '13px', color: '#0F1923' }}>
                {[gettingStarted.staff, gettingStarted.brief, gettingStarted.course].filter(Boolean).length} / 3 done
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { key: 'staff', label: 'View your staff and their AI readiness scores', action: () => { setTab('people'); fetchStaffList(); markProgress('staff') }, tab: 'People' },
                { key: 'brief', label: 'Explore the Intelligence tab to see org-wide insights', action: () => { setTab('intelligence'); markProgress('brief') }, tab: 'Intelligence' },
                { key: 'course', label: 'Build your first course in Content Studio', action: () => { setTab('suggest'); markProgress('course') }, tab: 'Content Studio' },
              ].map(step => {
                const done = gettingStarted[step.key as keyof typeof gettingStarted]
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: done ? 'rgba(0,137,123,0.04)' : '#FFFFFF', border: `1px solid ${done ? 'rgba(0,137,123,0.2)' : '#DDE8EE'}`, borderRadius: '12px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: done ? 'rgba(0,137,123,0.12)' : '#DDE8EE', border: `2px solid ${done ? '#00897B' : '#DDE8EE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {done
                        ? <svg width="10" height="10" fill="none" stroke="#00697B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        : <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0F1923' }} />
                      }
                    </div>
                    <div style={{ flex: 1, fontSize: '13px', color: done ? '#0F1923' : '#5B7080', fontWeight: 600, textDecoration: done ? 'line-through' : 'none' }}>{step.label}</div>
                    {!done && (
                      <button onClick={step.action} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(0,165,163,0.3)', background: 'rgba(0,165,163,0.1)', color: '#00897B', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                        Go to {step.tab}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Zone 1: Participation Banner ── */}
        <div id="tour-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderTop: '4px solid #00897B', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '12px' }}>Staff in System</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: '#00897B', lineHeight: 1 }}>{totalJoined}</span>
              <span style={{ fontSize: '13px', color: '#2D3E50', fontWeight: 700 }}>total</span>
            </div>
            <div style={{ height: '6px', background: '#E0F2F1', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ height: '100%', width: `${totalJoined > 0 ? Math.min(100, Math.round(profilesComplete / totalJoined * 100)) : 0}%`, background: '#00897B', borderRadius: '3px', transition: 'width 0.6s' }} />
            </div>
            <div style={{ fontSize: '12px', color: '#2D3E50', fontWeight: 600 }}>{totalJoined > 0 ? Math.round(profilesComplete / totalJoined * 100) : 0}% profiles complete · <span style={{ color: '#D97706' }}>{profilePending} pending</span></div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderTop: '4px solid #7DC520', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '12px' }}>Profiles Complete</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: '#00695C', lineHeight: 1 }}>{profilesComplete}</span>
              <span style={{ fontSize: '13px', color: '#2D3E50', fontWeight: 700 }}>/ {totalJoined}</span>
            </div>
            <div style={{ height: '6px', background: '#F1F8E9', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ height: '100%', width: `${totalJoined > 0 ? Math.round(profilesComplete / totalJoined * 100) : 0}%`, background: '#7DC520', borderRadius: '3px', transition: 'width 0.6s' }} />
            </div>
            <div style={{ fontSize: '12px', color: '#2D3E50', fontWeight: 600 }}>{totalJoined > 0 ? Math.round(profilesComplete / totalJoined * 100) : 0}% completion rate · {totalTasks} entries captured</div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderTop: `4px solid ${orgTier.color}`, borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>AI Readiness Score</div>
              <Link href="/docs" style={{ fontSize: '11px', color: '#00897B', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                How it works
                <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: orgTier.color, lineHeight: 1 }}>{orgScore > 0 ? orgScore : '—'}</span>
              {orgScore > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: orgTier.color, lineHeight: 1.2 }}>{orgTier.label}</div>
                  <div style={{ fontSize: '12px', color: '#2D3E50', fontWeight: 600, marginTop: '4px' }}>{orgTier.desc}</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#5B7080', fontWeight: 600 }}>Baseline 25–40 · Target 60+ · out of 100</div>
          </div>
        </div>




        {/* ══ TAIRS — Org Score ══ */}
        {members.length > 0 && (
          <div style={{ marginBottom: '28px' }}>

            {/* Tier Summary Strip — who is where right now */}
            {(() => {
              const TIERS = [
                { label: 'AI-Forward', color: '#166534', range: '75–100', desc: 'Building AI workflows' },
                { label: 'AI-Ready',   color: '#0E7490', range: '55–74',  desc: 'Using AI regularly' },
                { label: 'AI-Aware',   color: '#92400E', range: '35–54',  desc: 'Tried it, not a habit' },
                { label: 'AI-Curious', color: '#C2410C', range: '15–34',  desc: 'Knows AI exists' },
                { label: 'AI-Unaware', color: '#991B1B', range: '0–14',   desc: 'Needs foundations first' },
              ]
              const tierCounts: Record<string, number> = Object.fromEntries(TIERS.map(t => [t.label, 0]))
              members.filter(m => m.profile_complete).forEach(m => {
                const score = memberTairs[m.id]?.score ?? 0
                tierCounts[tairsTier(score).label] = (tierCounts[tairsTier(score).label] ?? 0) + 1
              })
              const total = profilesComplete || 1
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  {TIERS.map((t, i) => {
                    const count = tierCounts[t.label] ?? 0
                    const pct   = Math.round(count / total * 100)
                    return (
                      <div key={t.label} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderTop: `4px solid ${t.color}`, borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: '0 2px 8px rgba(15,25,35,0.05)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', color: t.color, textTransform: 'uppercase' }}>{t.range}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '36px', fontWeight: 900, color: count > 0 ? t.color : '#B8CDD8', lineHeight: 1 }}>{count}</span>
                          {count > 0 && <span style={{ fontSize: '12px', color: '#2D3E50', fontWeight: 700 }}>{count === 1 ? 'person' : 'people'}</span>}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: count > 0 ? '#0F1923' : '#5B7080' }}>{t.label}</div>
                        <div style={{ fontSize: '11px', color: '#5B7080', lineHeight: 1.4, fontWeight: 600 }}>{t.desc}</div>
                        <div style={{ height: '4px', background: '#E8EEF4', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: t.color, borderRadius: '2px', transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* ── Zone 2: Department Intelligence Table + Office Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Left: Department Readiness Table */}
              {(() => {
                const TIER_FILTERS = [
                  { id: 'all',          label: 'All',          color: '#5B7080' },
                  { id: 'AI-Forward',   label: 'AI-Forward',   color: '#166534' },
                  { id: 'AI-Ready',     label: 'AI-Ready',     color: '#0E7490' },
                  { id: 'AI-Aware',     label: 'AI-Aware',     color: '#92400E' },
                  { id: 'AI-Curious',   label: 'AI-Curious',   color: '#C2410C' },
                  { id: 'AI-Unaware',   label: 'AI-Unaware',   color: '#991B1B' },
                ]
                const PRIORITY_FILTERS = [
                  { id: 'Critical', color: '#FF6B6B' },
                  { id: 'High',     color: '#8B1A1A' },
                  { id: 'Medium',   color: '#8B1A1A' },
                ]
                const visibleDepts = sortedDeptTairs.filter(d => {
                  if (deptTierFilter === 'all') return true
                  // tier filter
                  const tierMatch = TIER_FILTERS.slice(1).some(f => f.id === deptTierFilter)
                  if (tierMatch) return tairsTier(d.score).label === deptTierFilter
                  // priority filter
                  return d.impact.priority === deptTierFilter
                })
                const ACTIONS: Record<string, string> = {
                  'AI-Forward':  'Assign as AI Pilot Lead — ship first automation',
                  'AI-Ready':    'Pair with Forward staff · 30-day workflow plan',
                  'AI-Aware':    'Half-day workshop · build one AI habit',
                  'AI-Curious':  'Role-specific AI demo · no theory',
                  'AI-Unaware':  'Digital literacy first · personal plan via HR',
                }
                return (
                  <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                    {/* Header + filters */}
                    <div style={{ padding: '18px 20px', borderBottom: '1px solid #DDE8EE' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>Department Readiness</div>
                          <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '2px' }}>
                            {visibleDepts.length} of {sortedDeptTairs.length} departments
                            {deptTierFilter !== 'all' && <span style={{ color: '#5B7080' }}> · filtered by <strong style={{ color: '#0F1923' }}>{deptTierFilter}</strong></span>}
                          </div>
                        </div>
                      </div>
                      {/* Tier filter pills */}
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {TIER_FILTERS.map(f => {
                          const active = deptTierFilter === f.id
                          const count  = f.id === 'all' ? sortedDeptTairs.length : sortedDeptTairs.filter(d => tairsTier(d.score).label === f.id).length
                          return (
                            <button key={f.id} onClick={() => setDeptTierFilter(f.id)}
                              style={{ padding: '4px 10px', borderRadius: '16px', border: `1px solid ${active ? f.color : '#DDE8EE'}`, background: active ? `${f.color}18` : 'transparent', color: active ? f.color : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                              {f.label}
                              {f.id !== 'all' && count > 0 && <span style={{ fontSize: '9px', opacity: 0.7 }}>{count}</span>}
                            </button>
                          )
                        })}
                        <div style={{ width: '1px', background: '#DDE8EE', margin: '0 2px' }} />
                        {PRIORITY_FILTERS.map(f => {
                          const active = deptTierFilter === f.id
                          const count  = sortedDeptTairs.filter(d => d.impact.priority === f.id).length
                          if (count === 0) return null
                          return (
                            <button key={f.id} onClick={() => setDeptTierFilter(f.id)}
                              style={{ padding: '4px 10px', borderRadius: '16px', border: `1px solid ${active ? f.color : '#DDE8EE'}`, background: active ? `${f.color}18` : 'transparent', color: active ? f.color : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                              {f.id}
                              <span style={{ fontSize: '9px', opacity: 0.7 }}>{count}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {visibleDepts.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#5B7080' }}>No departments match this filter</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {visibleDepts.map((d, i) => {
                          const tier        = tairsTier(d.score)
                          const impact      = d.impact
                          const completePct = d.joined > 0 ? Math.round(d.interviewed / d.joined * 100) : 0
                          const isTop       = i === 0 && deptTierFilter === 'all'
                          return (
                            <div key={d.dept} style={{
                              borderBottom: i < visibleDepts.length - 1 ? '1px solid #E8EEF4' : 'none',
                              background: isTop ? `${tier.color}05` : '#FFFFFF',
                              borderLeft: `4px solid ${tier.color}`,
                              padding: '16px 20px',
                            }}>
                              {/* Top row */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                {/* Score circle */}
                                <div style={{
                                  width: '52px', height: '52px', borderRadius: '50%',
                                  background: `${tier.color}12`,
                                  border: `2px solid ${tier.color}30`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexShrink: 0,
                                }}>
                                  <span style={{ fontSize: '18px', fontWeight: 900, color: tier.color, lineHeight: 1 }}>{d.score}</span>
                                </div>
                                {/* Dept info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923' }}>{d.dept}</span>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: tier.color, background: `${tier.color}15`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${tier.color}25`, whiteSpace: 'nowrap' }}>{tier.label}</span>
                                    <span style={{ fontSize: '11px', fontWeight: 800, color: impact.color, background: `${impact.color}12`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${impact.color}25`, whiteSpace: 'nowrap' }}>{impact.priority} Priority</span>
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#5B7080' }}>{d.joined} enrolled · {d.interviewed} assessed</div>
                                </div>
                                {/* Coverage */}
                                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '4px' }}>Coverage</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                                    <div style={{ width: '60px', height: '5px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${completePct}%`, background: completePct === 100 ? '#00897B' : tier.color, borderRadius: '3px' }} />
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: completePct === 100 ? '#3D6B00' : '#2D3E50' }}>{completePct}%</span>
                                  </div>
                                </div>
                              </div>
                              {/* Action row */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingLeft: '64px' }}>
                                <svg width="13" height="13" fill="none" stroke={tier.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><polyline points="9 18 15 12 9 6"/></svg>
                                <span style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.55, fontWeight: 500 }}>{ACTIONS[tier.label] ?? '—'}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Right: Office Cards + AI Champions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                {/* Office cards 2x2 grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {OFFICES.map(o => {
                    const oData  = officeTairs.find(x => x.id === o.id)
                    const joined = officeMap[o.id]?.count ?? 0
                    const tier   = oData ? tairsTier(oData.score) : null
                    return (
                      <div key={o.id} style={{ background: '#FFFFFF', border: `1px solid ${o.color}25`, borderRadius: '16px', padding: '16px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: o.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{o.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '36px', fontWeight: 900, color: o.color, lineHeight: 1 }}>{joined}</span>
                          <span style={{ fontSize: '13px', color: '#0F1923', marginLeft: '4px' }}>staff</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: '#5B7080' }}>{members.filter(m => m.office_id === o.id && m.profile_complete).length} profiles complete</span>
                          {tier && oData && (
                            <span style={{ fontSize: '13px', fontWeight: 800, color: tier.color }}>TAIRS {oData.score}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* AI Champions */}
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px', flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '14px' }}>AI Champions</div>
                  {topIndividuals.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#5B7080' }}>No interview data yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {topIndividuals.slice(0, 6).map((person, i) => {
                        const tier = tairsTier(person.toars)
                        const off  = getOffice(person.office_id)
                        return (
                          <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: i < 3 ? `${tier.color}08` : 'transparent', borderRadius: '10px', border: i < 3 ? `1px solid ${tier.color}18` : '1px solid transparent' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', minWidth: '18px' }}>#{i+1}</span>
                            <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: `${off?.color ?? '#00897B'}20`, border: `1px solid ${off?.color ?? '#00897B'}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? '#00695C' }}>{person.name.charAt(0)}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</div>
                              <div style={{ fontSize: '13px', color: '#5B7080' }}>{person.department ?? '—'}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: tier.color, lineHeight: 1 }}>{person.toars}</div>
                              <div style={{ fontSize: '8px', color: tier.color, fontWeight: 700 }}>{tier.label}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── AI Readiness Distribution + Top Tools ── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginRight: '4px', flexShrink: 0 }}>View by department:</span>
            {['all', ...DEPT_ORDER.filter(d => deptMap[d])].map(d => {
              const active = readinessDeptFilter === d
              const deptData = d !== 'all' ? deptMap[d] : null
              return (
                <button key={d} onClick={() => setReadinessDeptFilter(d)}
                  style={{ padding: '4px 12px', borderRadius: '16px', border: `1px solid ${active ? '#00695C' : '#DDE8EE'}`, background: active ? 'rgba(0,122,110,0.1)' : 'transparent', color: active ? '#00695C' : '#2D3E50', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}>
                  {d === 'all' ? 'All Departments' : d}
                  {deptData && <span style={{ fontSize: '13px', color: active ? '#00695C' : '#2D3E50', fontWeight: 400 }}>({deptData.complete})</span>}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Readiness distribution */}
            <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#5B7080' }}>Self-Reported Readiness</div>
                {readinessDeptFilter !== 'all' && (
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#00897B', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.25)', padding: '1px 7px', borderRadius: '10px' }}>{readinessDeptFilter}</div>
                )}
              </div>
              <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '20px' }}>
                {readinessDeptFilter === 'all' ? 'How staff describe their own AI usage in daily work' : `${deptReadinessList.length} interview${deptReadinessList.length !== 1 ? 's' : ''} from this department`}
              </div>
              {deptReadinessList.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#5B7080' }}>No interview data{readinessDeptFilter !== 'all' ? ' for this department' : ' yet'}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[1, 2, 3, 4, 5].map(n => {
                    const count = readinessDist[n] || 0
                    const pct   = deptReadinessList.length ? Math.round(count / deptReadinessList.length * 100) : 0
                    return (
                      <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: `${readinessColors[n-1]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: readinessColors[n-1] }}>{n}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span style={{ fontSize: '13px', color: '#5B7080' }}>{readinessLabels[n]}</span>
                            <span style={{ fontSize: '13px', color: count > 0 ? readinessColors[n-1] : '#5B7080', fontWeight: 700 }}>{pct > 0 ? `${pct}%` : ''}</span>
                          </div>
                          <div style={{ height: '5px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: readinessColors[n-1], borderRadius: '3px', transition: 'width 0.4s' }} />
                          </div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: count > 0 ? readinessColors[n-1] : '#DDE8EE', minWidth: '24px', textAlign: 'right' }}>{count}</div>
                      </div>
                    )
                  })}
                  <div style={{ paddingTop: '10px', borderTop: '1px solid #DDE8EE', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#5B7080' }}>Avg readiness</span>
                    <span style={{ fontWeight: 800, color: readinessColors[Math.round(deptReadinessList.reduce((a,b)=>a+b,0)/deptReadinessList.length)-1] }}>
                      {(deptReadinessList.reduce((a,b)=>a+b,0)/deptReadinessList.length).toFixed(1)} / 5
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* Top tools */}
            <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#5B7080' }}>Top Tools Used</div>
                {readinessDeptFilter !== 'all' && (
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#00897B', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.25)', padding: '1px 7px', borderRadius: '10px' }}>{readinessDeptFilter}</div>
                )}
              </div>
              <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '20px' }}>
                {readinessDeptFilter === 'all' ? "What the whole team actually uses" : `Tools mentioned by ${readinessDeptFilter} team`}
              </div>
              {topTools.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#5B7080' }}>No interview data{readinessDeptFilter !== 'all' ? ' for this department' : ' yet'}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {topTools.map(([tool, count], i) => {
                    const pct      = Math.round(count / topTools[0][1] * 100)
                    const isAI     = AI_TOOLS.has(tool)
                    const isSaaS   = MODERN_SAAS.has(tool)
                    const barColor = isAI ? '#C0F43C' : isSaaS ? '#00897B' : '#5B7080'
                    const tagColor = isAI ? '#3D6B00' : isSaaS ? '#00897B' : '#5B7080'
                    return (
                      <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', minWidth: '18px' }}>#{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{tool}</span>
                            {isAI && <span style={{ fontSize: '9px', fontWeight: 800, color: '#00695C', background: 'rgba(0,122,110,0.1)', padding: '1px 5px', borderRadius: '4px' }}>AI</span>}
                            {isSaaS && !isAI && <span style={{ fontSize: '9px', fontWeight: 700, color: '#00897B', background: 'rgba(0,165,163,0.12)', padding: '1px 5px', borderRadius: '4px' }}>SaaS</span>}
                          </div>
                          <div style={{ height: '4px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '3px', transition: 'width 0.4s' }} />
                          </div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: tagColor, minWidth: '22px', textAlign: 'right' }}>{count}</div>
                      </div>
                    )
                  })}
                  <div style={{ paddingTop: '10px', borderTop: '1px solid #DDE8EE', display: 'flex', gap: '14px', fontSize: '13px' }}>
                    <span style={{ color: '#00695C' }}>■ AI tool</span>
                    <span style={{ color: '#00897B' }}>■ Modern SaaS</span>
                    <span style={{ color: '#5B7080' }}>■ Basic / Other</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </>)}

        {/* Filters — shown for overview, members, intelligence tabs only */}
        {(tab === 'overview' || tab === 'intelligence') && (
          <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Row 1: Search + interview status */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '0 0 240px' }}>
                <svg width="13" height="13" fill="none" stroke="#0F1923" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search name, email, dept…"
                  style={{ width: '100%', paddingLeft: '34px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '16px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ width: '1px', height: '24px', background: '#DDE8EE' }} />
              {([['all', 'All'], ['done', 'Assessed'], ['pending', 'Pending']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setInterviewFilter(val)}
                  style={{ padding: '5px 14px', borderRadius: '16px', border: `1px solid ${interviewFilter === val ? '#00897B' : '#DDE8EE'}`, background: interviewFilter === val ? 'rgba(0,137,123,0.1)' : 'transparent', color: interviewFilter === val ? '#00695C' : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {label}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#5B7080', fontWeight: 600 }}>
                {filteredMembers.length} of {members.length}
              </div>
            </div>
            {/* Row 2: Office + Dept pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* All Offices */}
              <button onClick={() => setOfficeFilter('all')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '10px', border: `1.5px solid ${officeFilter === 'all' ? '#5B7080' : '#DDE8EE'}`, background: officeFilter === 'all' ? '#5B708015' : '#FFFFFF', color: officeFilter === 'all' ? '#2D3E50' : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                All Offices
              </button>
              {/* Per-office — colored dot + name, matching Overview style */}
              {OFFICES.map(o => {
                const active = officeFilter === o.id
                return (
                  <button key={o.id} onClick={() => setOfficeFilter(o.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px 5px 10px', borderRadius: '10px', border: `1.5px solid ${active ? o.color : '#DDE8EE'}`, background: active ? `${o.color}18` : '#FFFFFF', color: active ? o.color : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: active ? o.color : '#B8CDD8', flexShrink: 0 }} />
                    {o.label}
                  </button>
                )
              })}
              <div style={{ width: '1px', height: '24px', background: '#DDE8EE', flexShrink: 0 }} />
              {['all', ...allDepts].map(d => (
                <button key={d} onClick={() => setDeptFilter(d)}
                  style={{ padding: '5px 12px', borderRadius: '10px', border: `1.5px solid ${deptFilter === d ? '#00695C' : '#DDE8EE'}`, background: deptFilter === d ? 'rgba(0,107,92,0.1)' : '#FFFFFF', color: deptFilter === d ? '#00695C' : '#5B7080', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                  {d === 'all' ? 'All Depts' : d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px 100px', gap: '0', padding: '10px 24px', borderBottom: '1px solid #DDE8EE', background: '#FFFFFF' }}>
              {['Name', 'Office', 'Department', 'Interview', 'Joined'].map(h => (
                <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>{h}</div>
              ))}
            </div>
            {[...filteredMembers].sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()).map((m, i, arr) => {
              const off = getOffice(m.office_id)
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px 100px', gap: '0', alignItems: 'center', padding: '11px 24px', borderBottom: i < arr.length - 1 ? '1px solid #E8EEF4' : 'none' }}>
                  {/* Name + email */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, paddingRight: '12px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: `${off?.color ?? '#00897B'}18`, border: `1px solid ${off?.color ?? '#00897B'}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? '#00695C' }}>{m.name.charAt(0)}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                      <div style={{ fontSize: '13px', color: '#5B7080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                    </div>
                  </div>
                  {/* Office */}
                  <div style={{ paddingRight: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: off?.color ?? '#00695C' }}>{off?.label ?? '—'}</span>
                  </div>
                  {/* Department */}
                  <div style={{ paddingRight: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#5B7080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{m.department ?? '—'}</span>
                  </div>
                  {/* Interview status */}
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: m.profile_complete ? '#3D6B00' : '#5B7080', background: m.profile_complete ? 'rgba(61,107,0,0.1)' : '#FFFFFF', padding: '3px 9px', borderRadius: '6px', border: `1px solid ${m.profile_complete ? 'rgba(61,107,0,0.25)' : '#DDE8EE'}` }}>
                      {m.profile_complete ? 'Assessed' : 'Pending'}
                    </span>
                  </div>
                  {/* Date */}
                  <div style={{ fontSize: '13px', color: '#5B7080', textAlign: 'right' }}>
                    {new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    <div style={{ fontSize: '13px', color: '#5B7080' }}>
                      {new Date(m.joined_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredMembers.length === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>{members.length === 0 ? 'No staff have joined yet' : 'No results match the current filters'}</div>
            )}
          </div>
        )}

        {/* ── Staff Feedback (overview tab) ── */}
        {tab === 'overview' && (
          <div style={{ marginTop: '28px' }}>

            {/* Header + Generate Report button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF' }}>Staff Feedback</div>
                <div style={{ fontSize: '13px', color: '#0F1923', marginTop: '2px' }}>{feedbackItems.length} submission{feedbackItems.length !== 1 ? 's' : ''} — what the team wants built next</div>
              </div>
              {feedbackItems.length > 0 && (
                <button
                  onClick={async () => {
                    setReportLoading(true); setReportError(''); setFeedbackReport(null)
                    const res = await fetch('/api/feedback/report')
                    if (res.ok) { const d = await res.json(); setFeedbackReport(d.report) }
                    else { const d = await res.json(); setReportError(d.error ?? 'Failed') }
                    setReportLoading(false)
                  }}
                  disabled={reportLoading}
                  style={{ padding: '9px 20px', borderRadius: '10px', border: 'none', background: '#A478FF', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: reportLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', opacity: reportLoading ? 0.7 : 1 }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {reportLoading ? 'Analysing...' : 'Generate AI Report'}
                </button>
              )}
            </div>

            {/* AI Report */}
            {reportError && <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: '10px', fontSize: '13px', color: '#FF6B6B' }}>{reportError}</div>}

            {feedbackReport && (() => {
              const r = feedbackReport as {
                summary: string; total_submissions: number;
                top_themes: {theme:string;count:number;description:string}[];
                top_requests: {feature:string;priority:string;departments:string[];rationale:string}[];
                sentiment: {positive:number;constructive:number;critical:number;overview:string};
                recommended_build_order: {rank:number;item:string;reason:string}[];
                departments_most_engaged: string[];
              }
              const PRIORITY_COLOR: Record<string,string> = { high: '#FF6B6B', medium: '#8B1A1A', low: '#3D6B00' }
              return (
                <div style={{ background: 'rgba(164,120,255,0.06)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '12px' }}>AI Feedback Analysis</div>

                  {/* Summary */}
                  <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.7, margin: '0 0 20px', fontStyle: 'italic' }}>{r.summary}</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

                    {/* Top Themes */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '12px' }}>Key Themes</div>
                      {r.top_themes?.map((t, i) => (
                        <div key={i} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{t.theme}</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF' }}>{t.count}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#0F1923', lineHeight: 1.5 }}>{t.description}</div>
                        </div>
                      ))}
                    </div>

                    {/* Build Order */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '12px' }}>Recommended Build Order</div>
                      {r.recommended_build_order?.map(b => (
                        <div key={b.rank} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#A478FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, color: '#0F1923', flexShrink: 0 }}>{b.rank}</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '2px' }}>{b.item}</div>
                            <div style={{ fontSize: '13px', color: '#0F1923', lineHeight: 1.5 }}>{b.reason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Requests */}
                  <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '12px' }}>Top Feature Requests</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {r.top_requests?.map((req, i) => (
                        <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: PRIORITY_COLOR[req.priority] ?? '#A478FF', background: `${PRIORITY_COLOR[req.priority] ?? '#A478FF'}15`, padding: '3px 8px', borderRadius: '6px', flexShrink: 0, marginTop: '1px' }}>{req.priority}</span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '2px' }}>{req.feature}</div>
                            <div style={{ fontSize: '13px', color: '#0F1923', lineHeight: 1.5 }}>{req.rationale}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sentiment */}
                  <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '12px' }}>Sentiment Overview</div>
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
                      {[['Positive', r.sentiment?.positive, '#3D6B00'], ['Constructive', r.sentiment?.constructive, '#8B1A1A'], ['Critical', r.sentiment?.critical, '#FF6B6B']].map(([label, val, color]) => (
                        <div key={label as string} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '36px', fontWeight: 900, color: color as string }}>{val}%</div>
                          <div style={{ fontSize: '13px', color: '#0F1923' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: '13px', color: '#5B7080', fontStyle: 'italic' }}>{r.sentiment?.overview}</div>
                  </div>
                </div>
              )
            })()}

            {/* Raw submissions */}
            <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 24px', borderBottom: '1px solid #DDE8EE' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '1px', textTransform: 'uppercase' }}>All Submissions</div>
              </div>
              {feedbackItems.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: '#0F1923' }}>No feedback yet. The form appears at the bottom of every staff dashboard.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {feedbackItems.map((f, i) => (
                    <div key={f.id} style={{ padding: '14px 24px', borderBottom: i < feedbackItems.length - 1 ? '1px solid #DDE8EE' : 'none' }}>
                      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '5px' }}>{f.message}</div>
                      <div style={{ fontSize: '13px', color: '#0F1923' }}>
                        {f.name}{f.department ? ` · ${f.department}` : ''} · {new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── People tab ── */}
        {tab === 'people' && (() => {
          const memberById: Record<string, Member> = Object.fromEntries(members.map(m => [m.id, m]))
          const LEVEL_LABEL: Record<string,string> = { super_admin:'Super Admin', office_head:'Office Head', dept_head:'Dept Head', team_lead:'Team Lead', staff:'Staff' }
          const LEVEL_COLOR: Record<string,string> = { super_admin:'#166534', office_head:'#0E7490', dept_head:'#7C3AED', team_lead:'#92400E', staff:'#5B7080' }

          const allPeople = staffList.map(s => {
            const member  = memberById[s.id]
            const tData   = memberTairs[s.id]
            const score   = tData?.score ?? null
            const tTier   = score !== null ? tairsTier(score) : null
            const tColor  = tTier ? { color: tTier.color, bg: `${tTier.color}15` } : null
            return { ...s, access_enabled: (s as {access_enabled?:boolean}).access_enabled ?? false, profile_complete: member?.profile_complete ?? false, joined_at: member?.joined_at ?? null, tairs_score: score, tier_label: tTier?.label ?? null, tier_color: tColor }
          })

          const totalEnabled       = allPeople.filter(p => p.access_enabled).length
          const totalNotEnabled    = allPeople.filter(p => !p.access_enabled).length
          const totalProfileDone   = allPeople.filter(p => p.profile_complete).length
          const totalProfilePending = allPeople.filter(p => p.access_enabled && !p.profile_complete).length

          const filtered = allPeople.filter(p => {
            const q = staffSearch.toLowerCase()
            const match = !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.department ?? '').toLowerCase().includes(q) || (p.role ?? '').toLowerCase().includes(q)
            if (!match) return false
            if (officeFilter !== 'all' && p.office_id !== officeFilter) return false
            if (peopleFilter === 'enabled')         return p.access_enabled
            if (peopleFilter === 'not-enabled')     return !p.access_enabled
            if (peopleFilter === 'profile-done')    return p.profile_complete
            if (peopleFilter === 'profile-pending') return p.access_enabled && !p.profile_complete
            return true
          })

          return (
            <div>
              {/* HRMS sync bar */}
              <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(0,137,123,0.08)', border: '1px solid rgba(0,137,123,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" fill="none" stroke="#00897B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>HRMS Sync</div>
                    {hrmsSyncState === 'done' && hrmsSyncResult ? (
                      <div style={{ fontSize: '12px', color: '#166534', lineHeight: 1.4 }}>
                        {hrmsSyncResult.message}
                      </div>
                    ) : hrmsSyncState === 'error' ? (
                      <div style={{ fontSize: '12px', color: '#8B1A1A', lineHeight: 1.4 }}>Sync failed — check console for details</div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#5B7080', lineHeight: 1.4 }}>Pull active staff from HRMS (trescon-resource-planner)</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={syncFromHRMS}
                    disabled={hrmsSyncState === 'loading'}
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: hrmsSyncState === 'loading' ? '#DDE8EE' : '#00897B', color: hrmsSyncState === 'loading' ? '#5B7080' : '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: hrmsSyncState === 'loading' ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                  >
                    {hrmsSyncState === 'loading' ? (
                      <>
                        <div style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        Syncing…
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        Sync from HRMS
                      </>
                    )}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Total', value: staffList.length, color: '#0F1923' },
                    { label: 'Enabled', value: totalEnabled, color: '#166534' },
                    { label: 'Active Profiles', value: totalProfileDone, color: '#0E7490' },
                    { label: 'Not Yet Enabled', value: totalNotEnabled, color: '#5B7080' },
                  ].map(stat => (
                    <div key={stat.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                      <div style={{ fontSize: '10px', color: '#5B7080', fontWeight: 700, marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Filter + search row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {([
                  ['all',             `All (${allPeople.length})`],
                  ['enabled',         `Enabled (${totalEnabled})`],
                  ['not-enabled',     `Not Enabled (${totalNotEnabled})`],
                  ['profile-done',    `Profile Done (${totalProfileDone})`],
                  ['profile-pending', `Awaiting Profile (${totalProfilePending})`],
                ] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setPeopleFilter(key)}
                    style={{ padding: '6px 14px', borderRadius: '20px', border: `1.5px solid ${peopleFilter === key ? '#00897B' : '#DDE8EE'}`, background: peopleFilter === key ? '#00897B' : '#FFFFFF', color: peopleFilter === key ? '#FFFFFF' : '#5B7080', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {label}
                  </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <svg width="12" height="12" fill="none" stroke="#5B7080" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder="Search name, email, department…"
                      style={{ paddingLeft: '30px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', width: '230px' }} />
                  </div>
                  <button onClick={fetchStaffList} disabled={staffLoading}
                    style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Refresh
                  </button>
                  {totalNotEnabled > 0 && (
                    <button onClick={async () => {
                      if (!confirm(`Enable platform access for all ${totalNotEnabled} staff? They will be able to log in immediately.`)) return
                      await fetch('/api/staff-access', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enable_all: true, enabled: true }) })
                      fetchStaffList()
                    }} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(22,101,52,0.3)', background: 'rgba(22,101,52,0.07)', color: '#166534', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      Enable All ({totalNotEnabled})
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              {staffLoading ? (
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '60px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>Loading staff records…</div>
              ) : staffList.length === 0 ? (
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                  <svg width="36" height="36" fill="none" stroke="#B8CDD8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ marginBottom: '16px' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>No staff records yet</div>
                  <div style={{ fontSize: '13px', color: '#5B7080', maxWidth: '340px', margin: '0 auto' }}>Staff records will appear here once your HRMS is connected and synced.</div>
                </div>
              ) : (
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1fr 1.2fr 1.1fr 110px', padding: '10px 20px', background: '#E8EEF4', borderBottom: '1px solid #DDE8EE' }}>
                    {['Name', 'Department / Role', 'Office', 'Level', 'Platform Status', 'AI Score', ''].map(h => (
                      <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>{h}</div>
                    ))}
                  </div>
                  {filtered.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>No staff match this filter.</div>
                  ) : filtered.map((p, idx) => {
                    const off        = getOffice(p.office_id ?? '')
                    const levelColor = LEVEL_COLOR[p.job_level] ?? '#5B7080'
                    const levelLabel = LEVEL_LABEL[p.job_level] ?? p.job_level
                    let statusLabel: string, statusColor: string, statusBg: string
                    if (!p.access_enabled)   { statusLabel = 'Not Enabled';      statusColor = '#5B7080'; statusBg = '#5B708015' }
                    else if (!p.profile_complete) { statusLabel = 'Awaiting Profile'; statusColor = '#92400E'; statusBg = '#92400E15' }
                    else                     { statusLabel = 'Active';           statusColor = '#166534'; statusBg = '#16653415' }
                    return (
                      <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1fr 1.2fr 1.1fr 110px', alignItems: 'center', padding: '12px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid #E8EEF4' : 'none' }}>
                        {/* Name + email */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: `${off?.color ?? '#00897B'}18`, border: `1px solid ${off?.color ?? '#00897B'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: off?.color ?? '#00897B' }}>{p.name.charAt(0)}</span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                            <div style={{ fontSize: '11px', color: '#5B7080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                          </div>
                        </div>
                        {/* Dept / Role */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.department ?? '—'}</div>
                          <div style={{ fontSize: '11px', color: '#5B7080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.role ?? '—'}</div>
                        </div>
                        {/* Office */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: off?.color ?? '#B8CDD8', flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: off?.color ?? '#5B7080' }}>{off?.label ?? '—'}</span>
                        </div>
                        {/* Level */}
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: levelColor, background: `${levelColor}15`, padding: '3px 8px', borderRadius: '6px' }}>{levelLabel}</span>
                        </div>
                        {/* Platform Status */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor, background: statusBg, padding: '3px 8px', borderRadius: '6px', width: 'fit-content' }}>{statusLabel}</span>
                          {p.joined_at && <div style={{ fontSize: '10px', color: '#B8CDD8', fontWeight: 600 }}>Joined {new Date(p.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
                        </div>
                        {/* AI Score */}
                        <div>
                          {p.tairs_score !== null && p.tier_color ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '18px', fontWeight: 900, color: p.tier_color.color, lineHeight: 1 }}>{p.tairs_score}</span>
                              <span style={{ fontSize: '9px', fontWeight: 700, color: p.tier_color.color, background: p.tier_color.bg, padding: '2px 5px', borderRadius: '4px' }}>{p.tier_label}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#B8CDD8' }}>—</span>
                          )}
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                          <button onClick={async () => {
                            await fetch('/api/staff-access', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, enabled: !p.access_enabled }) })
                            fetchStaffList()
                          }} style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${p.access_enabled ? '#DDE8EE' : 'rgba(22,101,52,0.3)'}`, background: p.access_enabled ? '#FFFFFF' : 'rgba(22,101,52,0.07)', color: p.access_enabled ? '#5B7080' : '#166534', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            {p.access_enabled ? 'Disable' : 'Enable'}
                          </button>
                          <Link href={`/dashboard?id=${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#00897B', fontSize: '11px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                            View
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Intelligence tab ── */}
        {tab === 'intelligence' && (() => {
          // Group tasks by person so each person gets one row
          const peopleWithTasks = filteredMembers
            .filter(m => m.profile_complete)
            .map(m => {
              const personTasks = tasks.filter(t => t.staff_id === m.id)
              const readinessTask = personTasks.find(t => t.ai_readiness != null)
              const aiProofEntry  = personTasks.find(t => t.ai_proof)
              const allTools      = [...new Set(personTasks.flatMap(t => t.tools_used ?? []))]
              const mainAnswer    = personTasks.find(t => t.task_description && t.task_description.trim().length > 20)
              const score         = memberTairs[m.id]?.score ?? 0
              const tier          = tairsTier(score)
              const readiness     = readinessTask?.ai_readiness ?? null
              return { member: m, personTasks, readinessTask, aiProofEntry, allTools, mainAnswer, score, tier, readiness }
            })
            .sort((a, b) => b.score - a.score)

          return (
            <div>
              {/* Header bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: '#5B7080' }}>
                  <span style={{ color: '#0F1923', fontWeight: 700 }}>{peopleWithTasks.length}</span> assessed · sorted by AI Readiness Score (highest first) · click any row to read full answers
                </div>
                <Link href="/insights" style={{ background: '#00897B', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '9px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Generate AI Insights
                </Link>
              </div>

              {/* Column headers */}
              {peopleWithTasks.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.6fr 80px 36px', gap: '0', padding: '7px 20px', marginBottom: '4px' }}>
                  {['Employee', 'Readiness', 'AI Score', 'Tools used', 'Track', ''].map(h => (
                    <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>{h}</div>
                  ))}
                </div>
              )}

              {/* Person rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {peopleWithTasks.map(({ member: m, personTasks, aiProofEntry, allTools, mainAnswer, score, tier, readiness }) => {
                  const off    = getOffice(m.office_id)
                  const isOpen = expandedTask === m.id
                  const readinessColor = readiness ? readinessColors[readiness - 1] : '#5B7080'

                  return (
                    <div key={m.id} style={{ background: isOpen ? 'rgba(0,165,163,0.05)' : '#FFFFFF', border: `1px solid ${isOpen ? 'rgba(0,165,163,0.25)' : '#DDE8EE'}`, borderRadius: '12px', overflow: 'hidden', transition: 'all 0.15s' }}>

                      {/* Row — always visible */}
                      <button
                        onClick={() => setExpandedTask(isOpen ? null : m.id)}
                        style={{ width: '100%', padding: '13px 20px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.6fr 80px 36px', gap: '0', alignItems: 'center', textAlign: 'left' }}
                      >
                        {/* Col 1: Employee */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, paddingRight: '12px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: `${off?.color ?? '#00897B'}18`, border: `1px solid ${off?.color ?? '#00897B'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? '#00695C' }}>{m.name.charAt(0)}</span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                            <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '1px' }}>
                              <span style={{ color: off?.color ?? '#00695C' }}>{off?.label}</span>
                              {m.department ? ` · ${m.department}` : ''}
                            </div>
                          </div>
                        </div>

                        {/* Col 2: Readiness 1-5 */}
                        <div style={{ paddingRight: '12px' }}>
                          {readiness ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: `${readinessColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <span style={{ fontSize: '13px', fontWeight: 900, color: readinessColor }}>{readiness}</span>
                                </div>
                                <span style={{ fontSize: '9px', color: '#5B7080' }}>/5</span>
                              </div>
                              <div style={{ fontSize: '13px', color: readinessColor, lineHeight: 1.3 }}>{readinessLabels[readiness]}</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#5B7080' }}>—</span>
                          )}
                        </div>

                        {/* Col 3: TAIRS individual score */}
                        <div style={{ paddingRight: '12px' }}>
                          {score > 0 ? (
                            <div>
                              <span style={{ fontSize: '36px', fontWeight: 900, color: tier.color, lineHeight: 1 }}>{score}</span>
                              <div style={{ fontSize: '9px', fontWeight: 700, color: tier.color, marginTop: '2px' }}>{tier.label}</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#5B7080' }}>—</span>
                          )}
                        </div>

                        {/* Col 4: Top tools */}
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', paddingRight: '12px' }}>
                          {allTools.slice(0, 4).map((tool, j) => {
                            const isAI = AI_TOOLS.has(tool)
                            return (
                              <span key={j} style={{ fontSize: '13px', color: isAI ? '#3D6B00' : '#5B7080', background: isAI ? 'rgba(192,244,60,0.1)' : '#DDE8EE', padding: '2px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>{tool}</span>
                            )
                          })}
                          {allTools.length > 4 && <span style={{ fontSize: '13px', color: '#5B7080' }}>+{allTools.length - 4}</span>}
                        </div>

                        {/* Col 5: Track badge */}
                        <div>
                          {aiProofEntry?.ai_proof ? (
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#00695C', background: 'rgba(0,122,110,0.1)', border: '1px solid rgba(192,244,60,0.25)', padding: '3px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>Advanced</span>
                          ) : (
                            <span style={{ fontSize: '9px', fontWeight: 700, color: '#5B7080', background: '#FFFFFF', padding: '3px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>Standard</span>
                          )}
                        </div>

                        {/* Col 6: Chevron */}
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <svg width="14" height="14" fill="none" stroke="#0F1923" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </div>
                      </button>

                      {/* Expanded: all their task answers */}
                      {isOpen && (
                        <div style={{ borderTop: '1px solid #DDE8EE', padding: '20px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {personTasks.map((t, ti) => {
                              const hasContent = t.task_description || t.ai_proof || (t.tools_used?.length > 0)
                              if (!hasContent) return null
                              const detection = t.task_description ? detectAIWriting(t.task_description) : { score: 0, flags: [], verdict: '' }
                              const flagColor = detection.score >= 65 ? '#FF6B6B' : detection.score >= 45 ? '#8B1A1A' : detection.score >= 25 ? '#8B1A1A' : '#00897B'
                              return (
                                <div key={t.id} style={{ background: '#F8FAFB', border: '1px solid #DDE8EE', borderRadius: '10px', padding: '16px' }}>
                                  {/* Task label */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>
                                      Entry {ti + 1}{t.task_name ? ` — ${t.task_name}` : ''}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      {t.ai_readiness && (
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: readinessColors[t.ai_readiness - 1], background: `${readinessColors[t.ai_readiness - 1]}15`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${readinessColors[t.ai_readiness - 1]}25` }}>
                                          Readiness {t.ai_readiness}/5
                                        </span>
                                      )}
                                      {detection.score >= 25 && t.task_description && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: `${flagColor}12`, border: `1px solid ${flagColor}35`, borderRadius: '6px', padding: '2px 8px' }}>
                                          <svg width="10" height="10" fill="none" stroke={flagColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                          <span style={{ fontSize: '13px', fontWeight: 700, color: flagColor }}>{detection.verdict}</span>
                                          <span style={{ fontSize: '9px', color: '#5B7080' }}>{detection.score}/100</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Answer text */}
                                  {t.task_description && (
                                    <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: (t.ai_proof || t.tools_used?.length) ? '12px' : '0' }}>
                                      {t.task_description}
                                    </div>
                                  )}

                                  {/* AI Proof */}
                                  {t.ai_proof && (
                                    <div style={{ background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.18)', borderRadius: '8px', padding: '12px 14px', marginBottom: t.tools_used?.length ? '10px' : '0' }}>
                                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#00695C', marginBottom: '6px' }}>Advanced Track — Workflow Proof</div>
                                      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.ai_proof}</div>
                                    </div>
                                  )}

                                  {/* Tools */}
                                  {t.tools_used?.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: t.task_description || t.ai_proof ? '10px' : '0' }}>
                                      {t.tools_used.map((tool, j) => (
                                        <span key={j} style={{ fontSize: '13px', color: AI_TOOLS.has(tool) ? '#3D6B00' : '#00897B', background: AI_TOOLS.has(tool) ? 'rgba(192,244,60,0.1)' : 'rgba(0,165,163,0.12)', border: `1px solid ${AI_TOOLS.has(tool) ? 'rgba(192,244,60,0.2)' : 'rgba(0,165,163,0.2)'}`, padding: '2px 9px', borderRadius: '5px' }}>{tool}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {peopleWithTasks.length === 0 && (
                  <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '48px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>
                    No interview data yet{officeFilter !== 'all' || deptFilter !== 'all' ? ' for this filter' : ''}.
                  </div>
                )}
              </div>
            </div>
          )
        })()}


        {/* ── Learning tab ── */}
        {tab === 'learning' && (() => {
          if (learningLoading) return (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid #DDE8EE', borderTopColor: '#00897B', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
              <div style={{ color: '#5B7080', fontSize: '13px' }}>Loading learning data…</div>
            </div>
          )
          if (!learningData) return (
            <div style={{ padding: '60px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>
              No learning data yet. Staff need to complete courses first.
            </div>
          )

          const { completions, courses, staff: ldStaff, attempts } = learningData
          const staffMap   = Object.fromEntries(ldStaff.map(s => [s.id, s]))
          const courseMap  = Object.fromEntries(courses.map(c => [c.id, c]))
          const passedComp = completions.filter(c => c.passed)

          // Summary stats
          const totalAttempts   = attempts.length
          const totalPassed     = passedComp.length
          const passRate        = totalAttempts > 0 ? Math.round(totalPassed / totalAttempts * 100) : 0
          const avgScore        = passedComp.length > 0 ? Math.round(passedComp.reduce((s, c) => s + (c.test_score ?? 0), 0) / passedComp.length) : 0
          const activeStaff     = new Set(attempts.map(a => a.staff_id)).size
          const thisWeek        = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          const completionsThisWeek = passedComp.filter(c => new Date(c.completed_at) > thisWeek).length

          // Per-course stats
          const courseStats = courses.map(c => {
            const cComp    = completions.filter(x => x.course_id === c.id)
            const cAttempt = attempts.filter(x => x.course_id === c.id)
            const cPassed  = cComp.filter(x => x.passed)
            const cAvg     = cPassed.length > 0 ? Math.round(cPassed.reduce((s, x) => s + (x.test_score ?? 0), 0) / cPassed.length) : null
            return { ...c, completions: cPassed.length, attempts: cAttempt.length, avgScore: cAvg }
          }).sort((a, b) => b.completions - a.completions)

          // Per-dept stats
          const deptStats: Record<string, { name: string; completed: number; staff: number; avgScore: number }> = {}
          for (const comp of passedComp) {
            const s = staffMap[comp.staff_id]
            if (!s) continue
            const dept = s.department ?? 'Other'
            if (!deptStats[dept]) deptStats[dept] = { name: dept, completed: 0, staff: 0, avgScore: 0 }
            deptStats[dept].completed++
            deptStats[dept].avgScore = Math.round(((deptStats[dept].avgScore * (deptStats[dept].completed - 1)) + (comp.test_score ?? 0)) / deptStats[dept].completed)
          }
          const deptStatsList = Object.values(deptStats).sort((a, b) => b.completed - a.completed)

          // Top learners
          const learnerMap: Record<string, { name: string; dept: string; completed: number; avgScore: number }> = {}
          for (const comp of passedComp) {
            const s = staffMap[comp.staff_id]
            if (!s) continue
            if (!learnerMap[comp.staff_id]) learnerMap[comp.staff_id] = { name: s.name, dept: s.department ?? '—', completed: 0, avgScore: 0 }
            learnerMap[comp.staff_id].completed++
            learnerMap[comp.staff_id].avgScore = Math.round(((learnerMap[comp.staff_id].avgScore * (learnerMap[comp.staff_id].completed - 1)) + (comp.test_score ?? 0)) / learnerMap[comp.staff_id].completed)
          }
          const topLearners = Object.entries(learnerMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.completed - a.completed || b.avgScore - a.avgScore).slice(0, 10)

          const TIER_COLOR: Record<string, string> = { foundation: '#8B1A1A', adoption: '#00695C', advanced: '#3D6B00' }

          return (
            <div>
              {/* Summary strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
                {[
                  { label: 'Courses Available',   value: courses.length,         sub: 'in library',          accent: '#00897B' },
                  { label: 'Total Completions',    value: totalPassed,            sub: 'passes recorded',     accent: '#7DC520' },
                  { label: 'This Week',            value: completionsThisWeek,    sub: 'completed',           accent: '#6B21A8' },
                  { label: 'Avg Passing Score',    value: avgScore ? `${avgScore}%` : '—', sub: 'across all passes', accent: '#D97706' },
                  { label: 'Active Learners',      value: activeStaff,            sub: 'attempted a course',  accent: '#DC2626' },
                ].map(({ label, value, sub, accent }) => (
                  <div key={label} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderTop: `4px solid ${accent}`, borderRadius: '14px', padding: '20px', boxShadow: '0 2px 8px rgba(15,25,35,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '10px' }}>{label}</div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: accent, marginBottom: '4px', lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: '12px', color: '#5B7080', fontWeight: 600 }}>{sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '20px' }}>

                {/* Course completion table */}
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                  <div style={{ padding: '18px 20px', borderBottom: '1px solid #DDE8EE' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>Course Performance</div>
                    <div style={{ fontSize: '13px', color: '#0F1923', marginTop: '2px' }}>Completions and avg score per course</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 48px 56px', padding: '8px 20px', borderBottom: '1px solid #DDE8EE', gap: '8px' }}>
                    {['Course', 'Track', 'Done', 'Avg'].map(h => (
                      <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>{h}</div>
                    ))}
                  </div>
                  {courseStats.map((c, i) => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 48px 56px', padding: '12px 20px', borderBottom: i < courseStats.length - 1 ? '1px solid #E8EEF4' : 'none', gap: '8px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923', lineHeight: 1.3 }}>{c.title}</div>
                        {c.is_mandatory && <div style={{ fontSize: '13px', color: '#8B1A1A', marginTop: '2px' }}>Mandatory</div>}
                      </div>
                      <div><span style={{ fontSize: '13px', fontWeight: 700, color: TIER_COLOR[c.tier_level] ?? '#00695C', background: `${TIER_COLOR[c.tier_level] ?? '#00695C'}15`, padding: '2px 7px', borderRadius: '5px', textTransform: 'capitalize' }}>{c.tier_level}</span></div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: c.completions > 0 ? '#0F1923' : '#DDE8EE' }}>{c.completions}</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: c.avgScore ? (c.avgScore >= 80 ? '#3D6B00' : c.avgScore >= 70 ? '#00695C' : '#8B1A1A') : '#DDE8EE' }}>{c.avgScore ? `${c.avgScore}%` : '—'}</div>
                    </div>
                  ))}
                  {courseStats.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>No courses yet. Seed courses first.</div>
                  )}
                </div>

                {/* Right column: Dept stats + Top learners */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                  {/* Dept completion */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #DDE8EE' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>By Department</div>
                    </div>
                    {deptStatsList.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#0F1923', fontSize: '13px' }}>No completions yet</div>
                    ) : (
                      deptStatsList.map((d, i) => (
                        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px', borderBottom: i < deptStatsList.length - 1 ? '1px solid #E8EEF4' : 'none' }}>
                          <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>{d.name}</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', minWidth: '24px', textAlign: 'right' }}>{d.completed}</div>
                          <div style={{ fontSize: '13px', color: d.avgScore >= 80 ? '#3D6B00' : '#00695C', fontWeight: 700, minWidth: '40px', textAlign: 'right' }}>{d.avgScore}%</div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Top learners */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #DDE8EE' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>Top Learners</div>
                    </div>
                    {topLearners.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#0F1923', fontSize: '13px' }}>No completions yet</div>
                    ) : (
                      topLearners.map((l, i) => (
                        <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 36px 44px', alignItems: 'center', gap: '10px', padding: '10px 18px', borderBottom: i < topLearners.length - 1 ? '1px solid #E8EEF4' : 'none' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: i < 3 ? '#3D6B00' : '#5B7080' }}>#{i + 1}</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>{l.name}</div>
                            <div style={{ fontSize: '13px', color: '#0F1923' }}>{l.dept}</div>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', textAlign: 'right' }}>{l.completed}</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: l.avgScore >= 80 ? '#3D6B00' : '#00695C', textAlign: 'right' }}>{l.avgScore}%</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Pass rate strip */}
              <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '16px 22px', display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '4px' }}>Overall Pass Rate</div>
                  <div style={{ fontSize: '36px', fontWeight: 900, color: passRate >= 70 ? '#3D6B00' : passRate >= 50 ? '#8B1A1A' : '#FF6B6B' }}>{passRate}%</div>
                </div>
                <div style={{ flex: 1, maxWidth: '400px' }}>
                  <div style={{ height: '8px', background: '#E8EEF4', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${passRate}%`, background: passRate >= 70 ? '#7DC520' : passRate >= 50 ? '#8B1A1A' : '#FF6B6B', borderRadius: '4px', transition: 'width 0.6s' }} />
                  </div>
                  <div style={{ fontSize: '13px', color: '#0F1923', marginTop: '5px' }}>{totalPassed} passes out of {totalAttempts} total attempts</div>
                </div>
                <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>
                  Target: 70%+ pass rate across all courses.<br/>Below 70% on any course = content or prompt difficulty issue.
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Playbook tab ── */}
        {tab === 'action' && (() => {
          const PLAYBOOK = [
            {
              tier: 'AI-Forward',  range: '75–100', color: '#166534',
              means: 'Already building AI workflows. Has hands-on experience integrating multiple tools.',
              action: 'Assign as AI Pilot Leads. They run the first automation sprint for their department.',
              next: 'Book them into a 1-hour AI pilot kickoff. Give them a problem statement and 30 days to ship a working automation.',
              owner: 'AI Lead + Dept Head',
              by: 'This sprint',
            },
            {
              tier: 'AI-Ready',    range: '55–74',  color: '#0E7490',
              means: 'Uses AI regularly. Comfortable with tools but not yet building systematic workflows.',
              action: 'Pair with an AI-Forward colleague. Start a 30-day tool adoption plan with one specific workflow to automate.',
              next: 'Enroll in Trescademy Intermediate track. Weekly 45-min session + one workflow deliverable per week.',
              owner: 'Trescademy Training',
              by: '30 days',
            },
            {
              tier: 'AI-Aware',    range: '35–54',  color: '#92400E',
              means: 'Knows what AI is and has tried it, but not using it consistently in their daily work.',
              action: 'Foundation workshop (half day). Pick one tool for their role and commit to using it daily for 2 weeks.',
              next: '2-week AI daily habit challenge. Each person picks one task to do with AI every day and logs it.',
              owner: 'Trescademy Training + HR',
              by: '60 days',
            },
            {
              tier: 'AI-Curious',  range: '15–34',  color: '#C2410C',
              means: 'Heard about AI but hasn\'t used it in a work context. Low digital tool sophistication.',
              action: 'Awareness session first — why AI matters for their specific role. Then intro to ChatGPT basics.',
              next: 'Department-specific AI demo: show them 3 things AI can do for their exact job today. No theory.',
              owner: 'HR + Trescademy',
              by: '90 days',
            },
            {
              tier: 'AI-Unaware',  range: '0–14',   color: '#991B1B',
              means: 'Not actively using digital tools beyond basics. AI adoption needs to start from digital literacy.',
              action: 'Digital literacy assessment first. Build a personalised catch-up plan before any AI training.',
              next: 'One-on-one session with HR to understand barriers. Set up a buddy from AI-Aware tier.',
              owner: 'HR',
              by: '120 days',
            },
          ]

          return (
            <div>

              {/* Tier Playbook Table */}
              <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '3px' }}>AI Readiness Playbook</div>
                    <div style={{ fontSize: '13px', color: '#5B7080' }}>What each TAIRS tier means and exactly what to do next for each group of people.</div>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#FFFFFF' }}>
                        {['Tier', 'Score Range', 'What it means', 'Recommended Action', 'Immediate Next Step', 'Owner', 'By'].map(h => (
                          <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5B7080', borderBottom: '1px solid #DDE8EE', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PLAYBOOK.map((row, i) => (
                        <tr key={row.tier} style={{ borderBottom: i < PLAYBOOK.length - 1 ? '1px solid #DDE8EE' : 'none' }}>
                          <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: row.color, background: `${row.color}15`, padding: '3px 8px', borderRadius: '6px', border: `1px solid ${row.color}30` }}>{row.tier}</span>
                          </td>
                          <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, color: row.color, whiteSpace: 'nowrap' }}>{row.range}</td>
                          <td style={{ padding: '14px 16px', fontSize: '13px', color: '#5B7080', maxWidth: '200px', lineHeight: 1.5 }}>{row.means}</td>
                          <td style={{ padding: '14px 16px', fontSize: '13px', color: '#0F1923', fontWeight: 600, maxWidth: '220px', lineHeight: 1.5 }}>{row.action}</td>
                          <td style={{ padding: '14px 16px', fontSize: '13px', color: '#5B7080', maxWidth: '200px', lineHeight: 1.5 }}>{row.next}</td>
                          <td style={{ padding: '14px 16px', fontSize: '13px', color: row.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.owner}</td>
                          <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: row.color, background: `${row.color}18`, border: `1px solid ${row.color}35`, padding: '3px 8px', borderRadius: '5px' }}>{row.by}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Live Department Action Matrix */}
              <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #DDE8EE' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '3px' }}>Department Action Matrix — Live</div>
                  <div style={{ fontSize: '13px', color: '#5B7080' }}>Each department mapped to its current tier and the recommended action to take now. Updates as more staff complete interviews.</div>
                </div>
                {sortedDeptTairs.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', fontSize: '13px', color: '#5B7080' }}>No interview data yet. Seed demo data or wait for staff to complete interviews.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#FFFFFF' }}>
                          {['Department', 'TAIRS', 'Tier', 'People', 'Coverage', 'AI Priority', 'TAI Action', 'Owner', 'By'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5B7080', borderBottom: '1px solid #DDE8EE', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDeptTairs.map((d, i) => {
                          const tier    = tairsTier(d.score)
                          const play    = PLAYBOOK.find(p => p.tier === tier.label) ?? PLAYBOOK[4]
                          const impact  = d.impact
                          const covPct  = d.joined > 0 ? Math.round(d.interviewed / d.joined * 100) : 0
                          return (
                            <tr key={d.dept} style={{ borderBottom: i < sortedDeptTairs.length - 1 ? '1px solid #E8EEF4' : 'none', background: i === 0 ? `${tier.color}04` : 'transparent' }}>
                              <td style={{ padding: '13px 14px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{d.dept}</div>
                              </td>
                              <td style={{ padding: '13px 14px', textAlign: 'center' }}>
                                <span style={{ fontSize: '13px', fontWeight: 900, color: tier.color }}>{d.score}</span>
                              </td>
                              <td style={{ padding: '13px 10px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: tier.color, background: `${tier.color}15`, padding: '2px 7px', borderRadius: '5px', border: `1px solid ${tier.color}25` }}>{tier.label}</span>
                              </td>
                              <td style={{ padding: '13px 14px', fontSize: '13px', color: '#5B7080', textAlign: 'center' }}>{d.joined}</td>
                              <td style={{ padding: '13px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <div style={{ width: '44px', height: '4px', background: '#E8EEF4', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${covPct}%`, background: covPct === 100 ? '#C0F43C' : '#00897B', borderRadius: '2px' }} />
                                  </div>
                                  <span style={{ fontSize: '13px', color: '#5B7080', fontWeight: 700 }}>{covPct}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '13px 10px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: impact.color, background: `${impact.color}15`, padding: '2px 7px', borderRadius: '5px' }}>{impact.priority}</span>
                              </td>
                              <td style={{ padding: '13px 14px', fontSize: '13px', color: '#0F1923', fontWeight: 600, maxWidth: '200px', lineHeight: 1.5 }}>{play.action}</td>
                              <td style={{ padding: '13px 14px', fontSize: '13px', color: tier.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{play.owner}</td>
                              <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: tier.color, background: `${tier.color}18`, border: `1px solid ${tier.color}40`, padding: '3px 8px', borderRadius: '5px' }}>{play.by}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Dev Tools — collapsed by default */}
              <div style={{ marginTop: '8px' }}>
                <button onClick={() => setShowDevTools(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: '#0F1923', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 0' }}>
                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points={showDevTools ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/></svg>
                  Dev tools
                </button>
                {showDevTools && (
                  <div style={{ background: '#FFFFFF', border: '1px dashed #DDE8EE', borderRadius: '12px', padding: '18px 20px', marginTop: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#0F1923', marginBottom: '10px' }}>Demo Data</div>
                    <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '12px' }}>
                      Seed 21 demo staff across 4 offices. All use <code style={{ background: '#FFFFFF', padding: '1px 4px', borderRadius: '3px', fontSize: '13px' }}>@demo.tai</code> emails — safe to clear.
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button onClick={seedDemo} disabled={seedLoading} style={{ padding: '7px 16px', borderRadius: '8px', border: 'none', background: 'rgba(0,165,163,0.2)', color: '#00897B', fontSize: '13px', fontWeight: 700, cursor: seedLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        {seedLoading ? 'Working...' : 'Seed Demo'}
                      </button>
                      <button onClick={clearDemo} disabled={seedLoading} style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(255,107,107,0.2)', background: 'transparent', color: 'rgba(255,107,107,0.7)', fontSize: '13px', fontWeight: 700, cursor: seedLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        Clear Demo
                      </button>
                      {seedMsg && <span style={{ fontSize: '13px', color: seedMsg.includes('failed') || seedMsg.includes('Error') ? '#FF6B6B' : '#3D6B00', fontWeight: 600 }}>{seedMsg}</span>}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )
        })()}


        {/* ── Suggest a Course tab ── */}
        {tab === 'suggest' && (
          <div style={{ maxWidth: '720px' }}>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '6px' }}>Content Studio</div>
              <h2 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 6px' }}>Build a Course</h2>
              <p style={{ fontSize: '13px', color: '#5B7080', margin: 0, lineHeight: 1.6 }}>Describe the gap you have spotted. Gemini will design a full course — overview, tasks, and 10 quiz questions — ready to review and publish. The person who suggested it gets credited on the course card and receives a notification on their dashboard when it goes live.</p>
            </div>

            {/* Input panel */}
            {(suggestState === 'idle' || suggestState === 'thinking') && (
              <div style={{ background: 'rgba(164,120,255,0.06)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '16px', padding: '28px' }}>
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Your Suggestion</label>
                  <textarea
                    value={suggestion}
                    onChange={e => setSuggestion(e.target.value)}
                    placeholder="e.g. Create a course for the Events team on using AI to build run-of-show documents and vendor briefing packs"
                    rows={4}
                    disabled={suggestState === 'thinking'}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(164,120,255,0.25)', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', resize: 'vertical', opacity: suggestState === 'thinking' ? 0.6 : 1 }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Department</label>
                    <select value={suggestDept} onChange={e => setSuggestDept(e.target.value)} disabled={suggestState === 'thinking'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      {['Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations', 'IT', 'HR & Recruitment', 'Content & Design', 'Government Relations', 'DemandifyMedia', 'Leadership'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Tier Level</label>
                    <select value={suggestTier} onChange={e => setSuggestTier(e.target.value as 'foundation' | 'adoption' | 'advanced')} disabled={suggestState === 'thinking'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      <option value="foundation">Foundation — AI basics for this role</option>
                      <option value="adoption">Adoption — Intermediate workflows</option>
                      <option value="advanced">Advanced — Strategy and leadership</option>
                    </select>
                  </div>
                </div>
                {/* Credit to field */}
                <div style={{ marginBottom: '22px', background: 'rgba(164,120,255,0.05)', border: '1px solid rgba(164,120,255,0.15)', borderRadius: '12px', padding: '16px 18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '12px' }}>Course Credit</div>
                  <p style={{ fontSize: '13px', color: '#5B7080', margin: '0 0 12px', lineHeight: 1.55 }}>
                    Who identified this gap and requested this course? They will be credited on the course card and notified on their dashboard when it goes live.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#5B7080', marginBottom: '6px' }}>Full Name</label>
                      <input
                        value={creditName}
                        onChange={e => setCreditName(e.target.value)}
                        placeholder="e.g. Priya Menon"
                        disabled={suggestState === 'thinking'}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#5B7080', marginBottom: '6px' }}>Role / Department</label>
                      <input
                        value={creditRole}
                        onChange={e => setCreditRole(e.target.value)}
                        placeholder="e.g. Head of Events"
                        disabled={suggestState === 'thinking'}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>

                <button onClick={submitSuggestion} disabled={!suggestion.trim() || suggestState === 'thinking'}
                  style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: suggestion.trim() && suggestState !== 'thinking' ? '#A478FF' : '#DDE8EE', color: suggestion.trim() && suggestState !== 'thinking' ? 'white' : '#0F1923', fontSize: '13px', fontWeight: 800, cursor: suggestion.trim() && suggestState !== 'thinking' ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {suggestState === 'thinking' ? 'Designing your course...' : 'Generate Course'}
                </button>
              </div>
            )}

            {/* Thinking state — conversational response */}
            {suggestState === 'thinking' && (
              <div style={{ marginTop: '20px', background: 'rgba(164,120,255,0.08)', border: '1px solid rgba(164,120,255,0.25)', borderRadius: '16px', padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(164,120,255,0.2)', border: '2px solid rgba(164,120,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" fill="none" stroke="#A478FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF', marginBottom: '4px' }}>Course Designer</div>
                  <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>
                    I have received your suggestion for a <strong style={{ color: '#0F1923' }}>{suggestTier}</strong> course for the <strong style={{ color: '#0F1923' }}>{suggestDept}</strong> team. I am preparing a course just right — with full reading content, personalised tasks, and a 10-question bank. Sending it for your approval shortly...
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', gap: '5px' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#A478FF', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Generated course review */}
            {(suggestState === 'ready' || suggestState === 'publishing') && generatedCourse && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ background: 'rgba(164,120,255,0.08)', border: '1px solid rgba(164,120,255,0.25)', borderRadius: '16px', padding: '20px 24px', marginBottom: '20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(164,120,255,0.2)', border: '2px solid rgba(164,120,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" fill="none" stroke="#A478FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF', marginBottom: '4px' }}>Course Designer</div>
                    <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>
                      Your course is ready for review. I have built a complete <strong style={{ color: '#0F1923' }}>{suggestTier}</strong> course for <strong style={{ color: '#0F1923' }}>{suggestDept}</strong> with full reading content, 4 personalised task steps, and a 10-question bank. Review it below — edit anything you like — then approve to publish.
                    </div>
                  </div>
                </div>

                {/* Course preview */}
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDE8EE' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>{(generatedCourse.tier_level as string)} · {suggestDept}</div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F1923', marginBottom: '4px' }}>{generatedCourse.title as string}</div>
                    <div style={{ fontSize: '13px', color: '#5B7080' }}>{generatedCourse.subtitle as string}</div>
                  </div>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDE8EE' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>Overview</div>
                    <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.7 }}>{generatedCourse.overview as string}</div>
                  </div>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDE8EE' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>Task Steps ({(generatedCourse.task_steps as unknown[]).length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(generatedCourse.task_steps as Array<{step: number; instruction: string; tip: string}>).map((ts) => (
                        <div key={ts.step} style={{ padding: '12px 16px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #DDE8EE' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF', marginBottom: '4px' }}>Step {ts.step}</div>
                          <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.55 }}>{ts.instruction}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: '20px 24px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                      Question Bank ({(generatedCourse.question_bank as unknown[]).length} questions · 5 served randomly per attempt)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(generatedCourse.question_bank as Array<{question: string; correct_index: number; options: string[]}>).map((q, i) => (
                        <div key={i} style={{ padding: '12px 16px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #DDE8EE' }}>
                          <div style={{ fontSize: '13px', color: '#0F1923', fontWeight: 600, marginBottom: '4px' }}>Q{i + 1}: {q.question}</div>
                          <div style={{ fontSize: '13px', color: '#00695C' }}>Correct: {q.options[q.correct_index]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Credit preview */}
                {creditName && (
                  <div style={{ padding: '12px 16px', background: 'rgba(164,120,255,0.07)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '10px', fontSize: '13px', color: '#5B7080', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(164,120,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF' }}>{creditName.charAt(0)}</span>
                    </div>
                    <div>
                      <span style={{ color: '#5B7080' }}>Suggested by </span>
                      <strong style={{ color: '#0F1923' }}>{creditName}</strong>
                      {creditRole && <span style={{ color: '#5B7080' }}> · {creditRole}</span>}
                      <span style={{ color: '#0F1923', fontSize: '13px', display: 'block', marginTop: '1px' }}>Will be credited on the course card. Email notification sent on publish.</span>
                    </div>
                  </div>
                )}

                {publishMsg && (
                  <div style={{ padding: '12px 16px', background: publishMsg.includes('live') ? 'rgba(192,244,60,0.1)' : 'rgba(255,107,107,0.1)', border: `1px solid ${publishMsg.includes('live') ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: '10px', fontSize: '13px', color: publishMsg.includes('live') ? '#3D6B00' : '#FF6B6B', fontWeight: 700, marginBottom: '16px' }}>
                    {publishMsg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={submitForReview} disabled={suggestState === 'publishing'}
                    style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: '#A478FF', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', opacity: suggestState === 'publishing' ? 0.7 : 1 }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                    {suggestState === 'publishing' ? 'Submitting...' : 'Submit for Review'}
                  </button>
                  <button onClick={() => { setSuggestState('idle'); setGeneratedCourse(null); setPublishMsg('') }}
                    style={{ padding: '13px 20px', borderRadius: '12px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Start Over
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


        {/* ── Events tab ── */}
        {tab === 'events' && (() => {
          const TYPE_COLOR: Record<string,string> = { conference:'#00897B', summit:'#A78BFA', forum:'#60A5FA', awards:'#F59E0B', workshop:'#34D399', flagship:'#8B1A1A', managed:'#3730A3', bespoke:'#5B7080', corporate:'#0F1923', others:'#B8CDD8', other:'#0F1923' }
          const STATUS_CFG: Record<string,{color:string;bg:string}> = {
            planning:  { color:'#5B7080',  bg:'#DDE8EE' },
            upcoming:  { color:'#3730A3',  bg:'rgba(55,48,163,0.1)' },
            active:    { color:'#3D6B00',  bg:'rgba(61,107,0,0.1)'  },
            completed: { color:'#00897B',  bg:'rgba(0,165,163,0.12)' },
            cancelled: { color:'#FF6B6B',  bg:'rgba(255,107,107,0.12)' },
          }

          const today    = new Date()
          const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000) : null
          const fmt       = (n: number, cur = 'USD') => {
            const abs = Math.abs(n)
            const str = abs >= 1000000 ? `${(abs/1000000).toFixed(1)}M` : abs >= 1000 ? `${(abs/1000).toFixed(0)}K` : `${abs.toLocaleString()}`
            return `${n < 0 ? '-' : ''}${cur === 'INR' ? '₹' : '$'}${str}`
          }

          const upcoming = events
            .filter(e => e.status !== 'completed' && e.status !== 'cancelled')
            .sort((a,b) => (a.event_date ?? '9999').localeCompare(b.event_date ?? '9999'))
          const past = events
            .filter(e => e.status === 'completed' || e.status === 'cancelled')
            .sort((a,b) => (b.event_date ?? '').localeCompare(a.event_date ?? ''))

          const totalStaff = events.reduce((s,e) => s + ((e.event_staff as {count:number}[]|null)?.[0]?.count ?? 0), 0)

          const createForm = (
            <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#00897B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>New Event</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                {[
                  { label: 'Event Name', key: 'name', placeholder: 'World AI Show Dubai 2026', full: true },
                  { label: 'Client / Partner', key: 'client_name', placeholder: 'UAE Ministry of AI', full: false },
                  { label: 'City', key: 'city', placeholder: 'Dubai', full: false },
                  { label: 'Venue', key: 'venue', placeholder: 'Dubai World Trade Centre', full: false },
                ].map(f => (
                  <div key={f.key} style={f.full ? { gridColumn: '1/-1' } : {}}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>{f.label}</label>
                    <input value={eventForm[f.key as keyof typeof eventForm]} onChange={e => setEventForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Type</label>
                  <select value={eventForm.type} onChange={e => setEventForm(p => ({ ...p, type: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                    {['conference','summit','forum','awards','workshop','other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Date</label>
                  <input type="date" value={eventForm.event_date} onChange={e => setEventForm(p => ({ ...p, event_date: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>
              <textarea value={eventForm.description} onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of this event…" rows={2}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'none', marginBottom: '12px' }} />
              {eventMsg && <div style={{ fontSize: '13px', color: eventMsg.includes('created') ? '#3D6B00' : '#FF6B6B', marginBottom: '10px' }}>{eventMsg}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={async () => { await createEvent(); if (events.length > 0) setShowCreateEvent(false) }} disabled={eventSaving}
                  style={{ padding: '10px 22px', borderRadius: '9px', border: 'none', background: '#00897B', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: eventSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: eventSaving ? 0.6 : 1 }}>
                  {eventSaving ? 'Creating…' : 'Create Event'}
                </button>
                {events.length > 0 && (
                  <button onClick={() => setShowCreateEvent(false)}
                    style={{ padding: '10px 18px', borderRadius: '9px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                )}
              </div>
            </div>
          )

          return (
            <div>
              {/* ── Summary strip ── */}
              {events.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '24px' }}>
                  {[
                    { label: 'Total Events',   val: events.length,                                                              color: '#0F1923', icon: '📋' },
                    { label: 'Active',         val: events.filter(e=>e.status==='active').length,                               color: '#3D6B00', icon: '🟢' },
                    { label: 'Upcoming',       val: events.filter(e=>e.status==='upcoming'||e.status==='planning').length,      color: '#3730A3', icon: '📅' },
                    { label: 'Completed',      val: events.filter(e=>e.status==='completed').length,                            color: '#00897B', icon: '✅' },
                    { label: 'Staff Deployed', val: totalStaff,                                                                 color: '#8B1A1A', icon: '👥' },
                  ].map(s => (
                    <div key={s.label} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#8A9BAB', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>{s.label}</div>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Loading */}
              {eventsLoading && <div style={{ textAlign: 'center', padding: '60px 0', color: '#5B7080', fontSize: '13px' }}>Loading events…</div>}

              {/* Empty state */}
              {!eventsLoading && events.length === 0 && (
                <div style={{ maxWidth: '520px', margin: '0 auto' }}>{createForm}</div>
              )}

              {/* Populated */}
              {!eventsLoading && events.length > 0 && (
                <>
                  {/* ── View switcher + New Event ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    {(['upcoming','past'] as const).map(v => (
                      <button key={v} onClick={() => {
                        setEventView(v)
                        if (v === 'past' && Object.keys(eventSummaries).length === 0) fetchEventSummaries()
                      }}
                        style={{ padding: '8px 18px', borderRadius: '8px', border: `1px solid ${eventView===v ? '#00897B' : '#DDE8EE'}`, background: eventView===v ? '#00897B' : '#FFFFFF', color: eventView===v ? '#FFFFFF' : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {v === 'upcoming' ? `Upcoming & Active (${upcoming.length})` : `Past & Completed (${past.length})`}
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setShowCreateEvent(s => !s)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: showCreateEvent ? '#DDE8EE' : '#00897B', color: showCreateEvent ? '#5B7080' : '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {showCreateEvent ? 'Cancel' : '+ New Event'}
                    </button>
                  </div>

                  {showCreateEvent && <div style={{ marginBottom: '24px' }}>{createForm}</div>}

                  {/* ══ UPCOMING TABLE VIEW ══ */}
                  {eventView === 'upcoming' && (
                    <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                          <thead>
                            <tr style={{ background: '#F4F7FA' }}>
                              {['Event', 'Type', 'Status', 'Date', 'Countdown', 'City / Client', 'Staff', 'Tasks', 'Actions'].map(h => (
                                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: '#8A9BAB', letterSpacing: '0.7px', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid #E8EEF4' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {upcoming.map((ev, i) => {
                              const days       = daysUntil(ev.event_date)
                              const staffCount = (ev.event_staff    as {count:number}[]|null)?.[0]?.count ?? 0
                              const taskCount  = (ev.event_checklist as {count:number}[]|null)?.[0]?.count ?? 0
                              const s          = eventSummaries[ev.id]
                              const sc         = STATUS_CFG[ev.status] ?? STATUS_CFG.planning
                              const tc         = TYPE_COLOR[ev.type]   ?? '#5B7080'
                              const urgency    = days === null ? '#8A9BAB' : days < 0 ? '#FF6B6B' : days <= 30 ? '#F59E0B' : days <= 90 ? '#3730A3' : '#3D6B00'
                              const taskDone   = s?.task_done ?? 0
                              const taskTotal  = s?.task_total ?? taskCount
                              const taskPct    = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0
                              return (
                                <tr key={ev.id} style={{ borderBottom: i < upcoming.length-1 ? '1px solid #F0F4F8' : 'none', background: i%2===0 ? '#FFFFFF' : '#FAFBFC' }}>
                                  <td style={{ padding: '13px 14px', maxWidth: '220px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', lineHeight: 1.3 }}>{ev.name}</div>
                                    {s?.confirmed_revenue ? <div style={{ fontSize: '11px', color: '#3D6B00', fontWeight: 700, marginTop: '2px' }}>{fmt(s.confirmed_revenue, s.currency)} confirmed</div> : null}
                                  </td>
                                  <td style={{ padding: '13px 14px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: `${tc}18`, color: tc, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{ev.type}</span>
                                  </td>
                                  <td style={{ padding: '13px 14px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{ev.status}</span>
                                  </td>
                                  <td style={{ padding: '13px 14px', fontSize: '13px', color: '#2D3E50', whiteSpace: 'nowrap' }}>
                                    {ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}) : '—'}
                                  </td>
                                  <td style={{ padding: '13px 14px' }}>
                                    {days !== null
                                      ? <span style={{ fontSize: '13px', fontWeight: 900, color: urgency, whiteSpace: 'nowrap' }}>{days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'Today' : `${days}d`}</span>
                                      : <span style={{ color: '#C0C8D0' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '13px 14px', fontSize: '13px', color: '#5B7080' }}>
                                    {ev.city || '—'}
                                    {ev.client_name && <div style={{ fontSize: '11px', color: '#8A9BAB', marginTop: '1px' }}>{ev.client_name}</div>}
                                  </td>
                                  <td style={{ padding: '13px 14px', fontSize: '13px', fontWeight: 700, color: '#0F1923', textAlign: 'center' }}>{staffCount || '—'}</td>
                                  <td style={{ padding: '13px 14px', minWidth: '90px' }}>
                                    {taskTotal > 0 ? (
                                      <div>
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F1923', marginBottom: '4px' }}>{taskDone}/{taskTotal} <span style={{ color: '#8A9BAB', fontWeight: 400 }}>done</span></div>
                                        <div style={{ height: '4px', background: '#E8EEF4', borderRadius: '2px', overflow: 'hidden', width: '70px' }}>
                                          <div style={{ height: '100%', width: `${taskPct}%`, background: taskPct >= 80 ? '#3D6B00' : taskPct >= 40 ? '#F59E0B' : '#00897B', borderRadius: '2px', transition: 'width 0.3s' }} />
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '11px', color: '#B8CDD8' }}>No checklist</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '13px 14px' }}>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                      <Link href={`/admin/events/${ev.id}`} style={{ padding: '5px 11px', borderRadius: '7px', background: '#00897B', color: '#FFFFFF', fontSize: '11px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>Workspace</Link>
                                      <Link href={`/admin/events/${ev.id}/plan`} style={{ padding: '5px 11px', borderRadius: '7px', border: '1px solid rgba(192,244,60,0.5)', background: 'rgba(192,244,60,0.07)', color: '#3D6B00', fontSize: '11px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>Plan</Link>
                                      <button onClick={() => { setSelectedEvent(ev === selectedEvent ? null : ev); if (ev !== selectedEvent) { fetchEventStaff(ev.id); fetchEventSummaries() } }}
                                        style={{ padding: '5px 11px', borderRadius: '7px', border: `1px solid ${selectedEvent?.id===ev.id ? 'rgba(0,165,163,0.4)' : '#DDE8EE'}`, background: selectedEvent?.id===ev.id ? 'rgba(0,165,163,0.08)' : 'transparent', color: selectedEvent?.id===ev.id ? '#00695C' : '#5B7080', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                        Staff
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {upcoming.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#8A9BAB', fontSize: '13px' }}>No upcoming or active events.</div>}
                    </div>
                  )}

                  {/* ══ PAST EVENTS P&L VIEW ══ */}
                  {eventView === 'past' && (
                    summariesLoading
                      ? <div style={{ textAlign: 'center', padding: '60px 0', color: '#5B7080', fontSize: '13px' }}>Loading P&L data…</div>
                      : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px' }}>
                          {past.map(ev => {
                            const s          = eventSummaries[ev.id]
                            const netPnl     = s ? s.net_pnl : null
                            const missing: string[] = []
                            if (!s?.has_budget)   missing.push('approved budget')
                            if (!s?.has_revenue)  missing.push('deal revenue')
                            if (!s?.has_expenses) missing.push('expense records')
                            const hasAny = s && (s.has_budget || s.has_revenue || s.has_expenses)
                            return (
                              <div key={ev.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
                                <div style={{ height: '3px', background: ev.status==='cancelled' ? '#FF6B6B' : netPnl !== null && netPnl >= 0 ? '#3D6B00' : netPnl !== null ? '#FF6B6B' : '#DDE8EE' }} />
                                <div style={{ padding: '16px 18px' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', lineHeight: 1.3, marginBottom: '3px' }}>{ev.name}</div>
                                  <div style={{ fontSize: '11px', color: '#8A9BAB', marginBottom: '14px' }}>
                                    {ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : ''}
                                    {ev.city ? ` · ${ev.city}` : ''}
                                    {' · '}
                                    <span style={{ textTransform: 'capitalize', color: ev.status==='completed' ? '#00897B' : '#FF6B6B', fontWeight: 700 }}>{ev.status}</span>
                                  </div>

                                  {hasAny ? (
                                    <>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                        <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: '8px' }}>
                                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#8A9BAB', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Revenue</div>
                                          <div style={{ fontSize: '14px', fontWeight: 900, color: '#3D6B00' }}>{s.has_revenue ? fmt(s.confirmed_revenue, s.currency) : <span style={{ color: '#C0C8D0' }}>—</span>}</div>
                                          {s.pending_revenue > 0 && <div style={{ fontSize: '10px', color: '#F59E0B', marginTop: '2px' }}>+{fmt(s.pending_revenue, s.currency)} pending</div>}
                                        </div>
                                        <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: '8px' }}>
                                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#8A9BAB', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Expenses</div>
                                          <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F1923' }}>{s.has_expenses ? fmt(s.total_expenses, s.currency) : <span style={{ color: '#C0C8D0' }}>—</span>}</div>
                                          {s.has_budget && <div style={{ fontSize: '10px', color: '#8A9BAB', marginTop: '2px' }}>Budget: {fmt(s.approved_budget, s.currency)}</div>}
                                        </div>
                                      </div>
                                      {netPnl !== null && s.has_revenue && s.has_expenses && (
                                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: netPnl >= 0 ? 'rgba(61,107,0,0.07)' : 'rgba(255,107,107,0.07)', border: `1px solid ${netPnl >= 0 ? 'rgba(61,107,0,0.18)' : 'rgba(255,107,107,0.18)'}`, marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#8A9BAB', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net P&L</span>
                                          <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '15px', fontWeight: 900, color: netPnl >= 0 ? '#3D6B00' : '#FF6B6B' }}>{netPnl >= 0 ? '+' : ''}{fmt(netPnl, s.currency)}</div>
                                            {s.margin_pct !== null && <div style={{ fontSize: '10px', fontWeight: 700, color: netPnl >= 0 ? '#3D6B00' : '#FF6B6B' }}>{s.margin_pct.toFixed(1)}% margin</div>}
                                          </div>
                                        </div>
                                      )}
                                      {missing.length > 0 && (
                                        <div style={{ fontSize: '11px', color: '#F59E0B', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: '7px', padding: '8px 10px', marginBottom: '10px', lineHeight: 1.5 }}>
                                          Partial P&L — missing {missing.join(', ')}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div style={{ padding: '13px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #DDE8EE', marginBottom: '10px' }}>
                                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#8A9BAB', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>P&L unavailable</div>
                                      <div style={{ fontSize: '12px', color: '#8A9BAB', lineHeight: 1.5 }}>I can give you a complete overview once the budget, deal revenue, and expenses are added in the workspace.</div>
                                    </div>
                                  )}

                                  <Link href={`/admin/events/${ev.id}`} style={{ display: 'block', textAlign: 'center', padding: '7px', borderRadius: '8px', border: '1px solid #DDE8EE', color: '#00897B', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                                    Open Workspace
                                  </Link>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                  )}

                  {/* ── Staff assignment panel ── */}
                  {selectedEvent && (
                    <div style={{ marginTop: '20px', background: '#FFFFFF', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '20px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#00897B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>Staff on {selectedEvent.name}</div>
                      {eventStaff.length === 0
                        ? <div style={{ fontSize: '13px', color: '#8A9BAB', marginBottom: '14px' }}>No staff assigned yet.</div>
                        : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '8px', marginBottom: '14px' }}>
                            {eventStaff.map(es => (
                              <div key={es.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #DDE8EE' }}>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{es.staff_members?.name}</div>
                                  <div style={{ fontSize: '12px', color: '#5B7080' }}>{es.role || es.staff_members?.department}</div>
                                </div>
                                <button onClick={() => removeEventStaff(es.staff_members?.id)}
                                  style={{ fontSize: '12px', color: '#FF6B6B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>Remove</button>
                              </div>
                            ))}
                          </div>
                        )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select value={assignStaffId} onChange={e => setAssignStaffId(e.target.value)}
                          style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="">Select staff…</option>
                          {staffList.map(s => <option key={s.id} value={s.id}>{s.name} — {s.department}</option>)}
                        </select>
                        <input value={assignRole} onChange={e => setAssignRole(e.target.value)} placeholder="Role (optional)"
                          style={{ width: '130px', padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                        <button onClick={assignStaff}
                          style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: '#00897B', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}

        {/* ── Knowledge Base tab ── */}
        {tab === 'knowledge' && (() => {
          const TYPE_COLOR: Record<string,string> = { policy:'#8B1A1A', event_brief:'#00897B', staff_doc:'#3D6B00', onboarding:'#A78BFA', event_report:'#60A5FA', other:'#0F1923' }
          const LAYER_CFG: Record<string,{label:string;color:string;bg:string}> = {
            knowledge_base: { label:'Knowledge Base', color:'#00897B', bg:'rgba(0,165,163,0.12)' },
            general:        { label:'General',        color:'#60A5FA', bg:'rgba(96,165,250,0.12)' },
            specific:       { label:'Specific',       color:'#F59E0B', bg:'rgba(245,158,11,0.12)' },
          }
          const typeLabel = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const filteredDocs = docs.filter(d => {
            if (docFilter === 'flagged')        return d.flagged
            if (docFilter === 'knowledge_base') return d.layer === 'knowledge_base'
            if (docFilter === 'general')        return d.layer === 'general'
            if (docFilter === 'specific')       return d.layer === 'specific'
            return true
          })
          const flaggedCount = docs.filter(d => d.flagged).length

          const uploadForm = (
            <div style={{ background: '#FFFFFF', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#00695C', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>Upload Document</div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Document Title</label>
                <input value={docForm.title} onChange={e => setDocForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. HR Policy Handbook 2026"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Type</label>
                  <select value={docForm.type} onChange={e => { setDocForm(p => ({ ...p, type: e.target.value })); setOtherTypeLabel(''); setSaveAsNewType(false) }}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="policy">Policy</option>
                    <option value="event_brief">Event Brief</option>
                    <option value="staff_doc">Staff Document</option>
                    <option value="onboarding">Onboarding</option>
                    {customDocTypes.map(ct => <option key={ct.key} value={ct.key}>{ct.label}</option>)}
                    <option value="other">Other…</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Visible To</label>
                  <select value={docForm.visibility} onChange={e => setDocForm(p => ({ ...p, visibility: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="all">All Staff</option>
                    <option value="event_only">Event Staff Only</option>
                  </select>
                </div>
              </div>
              {docForm.type === 'other' && (
                <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(192,244,60,0.04)', border: '1px solid rgba(192,244,60,0.12)', borderRadius: '9px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>What type is this?</label>
                  <input value={otherTypeLabel} onChange={e => setOtherTypeLabel(e.target.value)} placeholder="e.g. SOP, Vendor Contract"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  {otherTypeLabel.trim().length > 1 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={saveAsNewType} onChange={e => setSaveAsNewType(e.target.checked)} style={{ accentColor: '#C0F43C', width: '13px', height: '13px' }} />
                      <span style={{ fontSize: '13px', color: '#5B7080', fontWeight: 600 }}>Save &ldquo;{otherTypeLabel.trim()}&rdquo; as a permanent type</span>
                    </label>
                  )}
                </div>
              )}
              {docForm.visibility === 'event_only' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Link to Event</label>
                  <select value={docForm.event_id} onChange={e => setDocForm(p => ({ ...p, event_id: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="">Select event…</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>File (PDF or TXT)</label>
                <label style={{ display: 'block', padding: '18px', border: `1.5px dashed ${docFile ? 'rgba(192,244,60,0.35)' : '#DDE8EE'}`, borderRadius: '10px', textAlign: 'center', cursor: 'pointer', background: docFile ? 'rgba(192,244,60,0.04)' : 'transparent' }}>
                  <input type="file" accept=".pdf,.txt,.md" style={{ display: 'none' }} onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
                  {docFile ? (
                    <div><div style={{ fontSize: '13px', fontWeight: 700, color: '#00695C' }}>{docFile.name}</div><div style={{ fontSize: '13px', color: '#0F1923', marginTop: '2px' }}>{(docFile.size / 1024).toFixed(0)} KB</div></div>
                  ) : (
                    <div><svg width="20" height="20" fill="none" stroke="#0F1923" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ margin: '0 auto 6px', display: 'block' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><div style={{ fontSize: '13px', color: '#0F1923' }}>Click to select file</div></div>
                  )}
                </label>
              </div>
              {docMsg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: docMsg.includes('Done') ? 'rgba(192,244,60,0.07)' : 'rgba(255,107,107,0.07)', border: `1px solid ${docMsg.includes('Done') ? 'rgba(192,244,60,0.2)' : 'rgba(255,107,107,0.2)'}`, color: docMsg.includes('Done') ? '#3D6B00' : '#FF6B6B', marginBottom: '10px', lineHeight: 1.5 }}>{docMsg}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={uploadDoc} disabled={docUploading || !docFile}
                  style={{ flex: 1, padding: '11px', borderRadius: '9px', border: 'none', background: docUploading || !docFile ? '#DDE8EE' : '#C0F43C', color: docUploading || !docFile ? '#0F1923' : '#0F1923', fontSize: '13px', fontWeight: 800, cursor: docUploading || !docFile ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {docUploading ? 'Analysing with AI…' : 'Upload & Analyse'}
                </button>
                {docs.length > 0 && <button onClick={() => setShowUploadForm(false)}
                  style={{ padding: '11px 16px', borderRadius: '9px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>}
              </div>
              {docAnalysis && (
                <div style={{ marginTop: '14px', padding: '14px', background: docAnalysis.flagged ? 'rgba(139,26,26,0.06)' : 'rgba(0,165,163,0.06)', border: `1px solid ${docAnalysis.flagged ? 'rgba(139,26,26,0.2)' : 'rgba(0,165,163,0.2)'}`, borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: docAnalysis.flagged ? '#8B1A1A' : '#00897B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{docAnalysis.flagged ? 'Low Confidence — Flagged' : 'AI Analysis Complete'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 800, color: docAnalysis.confidence >= 75 ? '#3D6B00' : '#8B1A1A' }}>{docAnalysis.confidence}%</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    {[{ l:'Layer', v: docAnalysis.layer.replace('_', ' ') },{ l:'Department', v: docAnalysis.department },{ l:'Min Level', v: docAnalysis.min_level }].map(({l,v}) => (
                      <div key={l} style={{ background: '#FFFFFF', borderRadius: '7px', padding: '7px 9px' }}>
                        <div style={{ fontSize: '9px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>{l}</div>
                        <div style={{ fontSize: '13px', color: '#0F1923', fontWeight: 700, textTransform: 'capitalize' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: docAnalysis.tresci_use ? '#3D6B00' : '#DDE8EE', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: docAnalysis.tresci_use ? '#3D6B00' : '#0F1923', fontWeight: 600 }}>{docAnalysis.tresci_use ? 'Tresci will use this document' : 'Not indexed by Tresci'}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, margin: 0 }}>{docAnalysis.ai_reasoning}</p>
                </div>
              )}
            </div>
          )

          return (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00695C', marginBottom: '6px' }}>Knowledge Base</div>
                  <h2 style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', margin: 0 }}>Documents</h2>
                </div>
                {docs.length > 0 && !showUploadForm && (
                  <button onClick={() => setShowUploadForm(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload Document
                  </button>
                )}
              </div>

              {/* EMPTY STATE */}
              {!docsLoading && docs.length === 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '32px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    {[
                      { n:'1', label:'Upload a document', sub:'PDF or text — policy, brief, report, anything' },
                      { n:'2', label:'AI classifies it', sub:'Decides who sees it, what it is for, confidence score' },
                      { n:'3', label:'Goes live or flagged', sub:'High confidence = auto-live. Low = you review first' },
                      { n:'4', label:'Tresci answers from it', sub:'Staff ask questions — Tresci reads docs to reply' },
                    ].map((s, i) => (
                      <div key={s.n} style={{ padding: '18px 16px', borderRight: i < 3 ? '1px solid #DDE8EE' : 'none' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#00897B', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 900, color: '#FFFFFF' }}>{s.n}</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '4px' }}>{s.label}</div>
                        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.4 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ maxWidth: '520px', margin: '0 auto' }}>{uploadForm}</div>
                </>
              )}

              {docsLoading && <div style={{ color: '#0F1923', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading documents…</div>}

              {/* POPULATED STATE */}
              {!docsLoading && docs.length > 0 && (
                <>
                  {/* Collapsible guide */}
                  <details style={{ marginBottom: '20px' }}>
                    <summary style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      How this section works
                    </summary>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: '12px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', overflow: 'hidden' }}>
                      {[
                        { n:'1', label:'Upload a document', sub:'PDF or text — policy, brief, report' },
                        { n:'2', label:'AI classifies it', sub:'Layer, department, audience, confidence' },
                        { n:'3', label:'Goes live or flagged', sub:'High confidence = auto-live, low = review' },
                        { n:'4', label:'Tresci answers from it', sub:'Staff questions answered from your docs' },
                      ].map((s, i) => (
                        <div key={s.n} style={{ padding: '12px 14px', borderRight: i < 3 ? '1px solid #DDE8EE' : 'none' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#00897B', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '7px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 900, color: '#FFFFFF' }}>{s.n}</span>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '2px' }}>{s.label}</div>
                          <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.4 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  </details>

                  {/* Inline upload form */}
                  {showUploadForm && <div style={{ marginBottom: '24px' }}>{uploadForm}</div>}

                  {/* Filter pills + count */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    {([
                      { key:'all',           label:`All (${docs.length})` },
                      { key:'knowledge_base',label:`Knowledge Base (${docs.filter(d=>d.layer==='knowledge_base').length})` },
                      { key:'general',       label:`General (${docs.filter(d=>d.layer==='general').length})` },
                      { key:'specific',      label:`Specific (${docs.filter(d=>d.layer==='specific').length})` },
                      ...(flaggedCount > 0 ? [{ key:'flagged', label:`Flagged (${flaggedCount})` }] : []),
                    ] as {key:string;label:string}[]).map(f => (
                      <button key={f.key} onClick={() => setDocFilter(f.key as typeof docFilter)}
                        style={{ padding: '6px 14px', borderRadius: '16px', border: `1px solid ${docFilter === f.key ? (f.key === 'flagged' ? 'rgba(139,26,26,0.5)' : 'rgba(192,244,60,0.4)') : '#DDE8EE'}`, background: docFilter === f.key ? (f.key === 'flagged' ? 'rgba(139,26,26,0.1)' : 'rgba(192,244,60,0.08)') : 'transparent', color: docFilter === f.key ? (f.key === 'flagged' ? '#8B1A1A' : '#3D6B00') : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Document grid */}
                  {filteredDocs.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#0F1923', fontSize: '13px' }}>No documents match this filter.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                      {filteredDocs.map(doc => {
                        const tc   = TYPE_COLOR[doc.type] ?? '#5B7080'
                        const lCfg = LAYER_CFG[doc.layer] ?? { label: doc.layer, color: '#0F1923', bg: '#DDE8EE' }
                        return (
                          <div key={doc.id} style={{ background: '#FFFFFF', border: `1px solid ${doc.flagged ? 'rgba(139,26,26,0.25)' : '#DDE8EE'}`, borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {/* Top colour strip */}
                            <div style={{ height: '3px', background: tc, opacity: 0.8 }} />
                            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {/* Badges row */}
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: `${tc}18`, color: tc, border: `1px solid ${tc}35` }}>
                                  {typeLabel(doc.type)}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: lCfg.bg, color: lCfg.color }}>
                                  {lCfg.label}
                                </span>
                                {doc.flagged && (
                                  <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: 'rgba(139,26,26,0.12)', color: '#8B1A1A' }}>Flagged</span>
                                )}
                              </div>

                              {/* Title */}
                              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', lineHeight: 1.4 }}>{doc.title}</div>

                              {/* Department + level (if specific) */}
                              {doc.layer === 'specific' && (
                                <div style={{ fontSize: '13px', color: '#0F1923', display: 'flex', gap: '8px' }}>
                                  <span>{doc.department}</span>
                                  <span style={{ color: '#5B7080' }}>·</span>
                                  <span>{doc.min_level}</span>
                                </div>
                              )}

                              {/* Tresci indicator + confidence */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: doc.tresci_use ? '#C0F43C' : '#DDE8EE', flexShrink: 0 }} />
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: doc.tresci_use ? '#3D6B00' : '#5B7080' }}>
                                    {doc.tresci_use ? 'Used by Tresci' : 'Not indexed'}
                                  </span>
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: doc.confidence >= 75 ? '#0F1923' : '#8B1A1A' }}>
                                  {doc.confidence}% AI confidence
                                </span>
                              </div>

                              {/* Footer: word count + date + remove */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #DDE8EE' }}>
                                <span style={{ fontSize: '13px', color: '#0F1923' }}>
                                  {doc.word_count?.toLocaleString()} words · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </span>
                                <button onClick={() => deleteDoc(doc.id)}
                                  style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,107,107,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}

        {/* ── Review Queue tab (super admin only) ── */}
        {tab === 'review' && adminStaffId === 'super-admin' && (
          <div>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#FF6B6B', marginBottom: '6px' }}>Review Queue</div>
              <h2 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 6px' }}>Courses Pending Approval</h2>
              <p style={{ fontSize: '13px', color: '#5B7080', margin: 0, lineHeight: 1.6 }}>These courses were generated via Content Studio and are waiting for your review. Approve to publish them to the library, or reject to remove them.</p>
            </div>

            {reviewMsg && (
              <div style={{ marginBottom: '20px', padding: '12px 16px', background: reviewMsg.includes('approved') ? 'rgba(192,244,60,0.08)' : 'rgba(0,165,163,0.08)', border: `1px solid ${reviewMsg.includes('approved') ? 'rgba(192,244,60,0.25)' : 'rgba(0,165,163,0.25)'}`, borderRadius: '10px', fontSize: '13px', color: reviewMsg.includes('approved') ? '#3D6B00' : '#00897B', fontWeight: 600 }}>
                {reviewMsg}
              </div>
            )}

            {draftsLoading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#0F1923', fontSize: '13px' }}>Loading drafts...</div>
            ) : draftCourses.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px' }}>
                <div style={{ fontSize: '13px', color: '#5B7080' }}>No courses pending review. When someone submits a course via Content Studio it will appear here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {draftCourses.map(course => {
                  const TIER_COLOR: Record<string, string> = { foundation: '#00695C', adoption: '#3D6B00', advanced: '#A478FF' }
                  const tierColor = TIER_COLOR[course.tier_level] ?? '#00695C'
                  const isExpanded = expandedDraftId === course.id
                  return (
                    <div key={course.id} style={{ background: '#FFFFFF', border: '1px solid rgba(255,107,107,0.15)', borderRadius: '16px', overflow: 'hidden' }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 20px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: tierColor, background: `${tierColor}15`, padding: '2px 8px', borderRadius: '5px', textTransform: 'capitalize' }}>{course.tier_level}</span>
                            {course.dept_tags?.map(d => (
                              <span key={d} style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', background: '#E8EEF4', border: '1px solid #DDE8EE', padding: '2px 8px', borderRadius: '5px' }}>{d}</span>
                            ))}
                            <span style={{ fontSize: '13px', color: 'rgba(255,107,107,0.8)', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>Pending Review</span>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', lineHeight: 1.3 }}>{course.title}</div>
                          <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '2px' }}>{course.subtitle}</div>
                          {course.suggested_by_name && (
                            <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '4px' }}>Suggested by {course.suggested_by_name}{course.suggested_by_role ? ` · ${course.suggested_by_role}` : ''}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                          <button onClick={() => setExpandedDraftId(isExpanded ? null : course.id)}
                            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {isExpanded ? 'Collapse' : 'Preview'}
                          </button>
                          <button onClick={() => rejectCourse(course.id)}
                            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: '#FF6B6B', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Reject
                          </button>
                          <button onClick={() => approveCourse(course.id)}
                            style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            Approve & Publish
                          </button>
                        </div>
                      </div>
                      {/* Expanded preview */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #DDE8EE', padding: '20px', background: '#FFFFFF' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Overview</div>
                          <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.7, margin: 0 }}>{course.overview}</p>
                          <div style={{ marginTop: '12px', fontSize: '13px', color: '#0F1923' }}>{course.estimated_minutes} min · {course.is_mandatory ? 'Mandatory' : 'Optional'}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes demoGlow{0%{color:#8B1A1A}20%{color:#FF6B6B}40%{color:#C0F43C}60%{color:#00A5A3}80%{color:#8B1A1A}100%{color:#FFD08A}} @keyframes tourPop{0%{opacity:0;transform:scale(0.95) translateY(6px)}100%{opacity:1;transform:scale(1) translateY(0)}} @keyframes slideInRight{0%{transform:translateX(100%);opacity:0}100%{transform:translateX(0);opacity:1}}`}</style>

      {/* ── What's Next — Roadmap Panel ── */}
      {showRoadmap && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex' }}>
          {/* Backdrop */}
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowRoadmap(false)} />

          {/* Drawer */}
          <div style={{ width: '520px', background: '#FFFFFF', borderLeft: '1px solid rgba(164,120,255,0.25)', height: '100%', overflowY: 'auto', animation: 'slideInRight 0.25s ease', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid #DDE8EE', position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '4px' }}>Platform Roadmap</div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.3px' }}>What&apos;s next for Trescademy</div>
                </div>
                <button onClick={() => setShowRoadmap(false)} style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" fill="none" stroke="#5B7080" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

              {/* ── Section 1: What's live ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C0F43C',  }} />
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#00695C' }}>Live now</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    'TAIRS scoring — live AI readiness score for every staff member',
                    'Personal dashboard with role-specific course recommendations',
                    'AI-generated courses via Content Studio — ready to publish in minutes',
                    'Tresci — internal AI assistant scoped to Trescademy and your org',
                    'Admin dashboard with org-wide intelligence and tier breakdowns',
                    'Events Hub and Knowledge Base for company documents',
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 14px', background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.12)', borderRadius: '10px' }}>
                      <svg width="13" height="13" style={{ flexShrink: 0, marginTop: '2px' }} fill="none" stroke="#3D6B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Section 2: Phase 2 ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8B1A1A' }} />
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#8B1A1A' }}>Phase 2 — Rolling out next</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { title: 'Staff onboarding via email', desc: 'Welcome email with platform intro, login link, and temp password sent automatically when staff are imported.' },
                    { title: 'Manager team view', desc: 'Managers see their team\'s TAIRS scores, who hasn\'t started, and who needs a nudge — without seeing individual data of others.' },
                    { title: 'Completion certificates', desc: 'Staff receive a certificate on passing a course. Shareable and stored against their profile.' },
                    { title: 'Weekly org pulse report', desc: 'Auto-generated Monday report to leadership: who moved tiers, what changed, what needs action.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'rgba(139,26,26,0.05)', border: '1px solid rgba(139,26,26,0.15)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#8B1A1A', marginBottom: '4px' }}>{item.title}</div>
                      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Section 3: Phase 3 ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#A478FF' }} />
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#A478FF' }}>Phase 3 — Intelligence deepens</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { title: 'Events Hub AI-first', desc: 'Upload an event brief — AI extracts structure, assigns staff, surfaces readiness gaps. No manual data entry.' },
                    { title: 'Department deep-dives', desc: 'Per-department AI report: current tier split, top skill gaps, projected score in 30 days, recommended courses.' },
                    { title: 'Course effectiveness scoring', desc: 'AI tracks whether TAIRS scores actually improve after each course. Courses that don\'t move the needle get flagged.' },
                    { title: 'TAOS integration', desc: 'Trescademy\'s org intelligence feeds the broader Trescon AI Operating System — capability data becomes a business asset.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'rgba(164,120,255,0.05)', border: '1px solid rgba(164,120,255,0.12)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF', marginBottom: '4px' }}>{item.title}</div>
                      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Section 4: How AI shapes the roadmap ── */}
              <div style={{ background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '22px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#00897B', marginBottom: '12px' }}>How AI decides what gets built</div>
                <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.75, margin: '0 0 16px' }}>
                  Trescademy doesn&apos;t wait for a committee to decide what to build next. Every interaction is data. The AI reads patterns across all staff and surfaces what the organisation actually needs.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { signal: 'Questionnaire responses', output: 'Identifies skill gaps by department and role. Drives which courses get generated first.' },
                    { signal: 'Course completions and drop-offs', output: 'Courses with low pass rates or high abandonment get flagged. AI rebuilds or reorders them.' },
                    { signal: 'Tresci questions asked', output: 'The most common questions reveal what staff don\'t understand. Becomes new platform documentation.' },
                    { signal: 'Manager feedback and ratings', output: 'Leadership priorities re-rank the build order. The platform adapts to what the business needs most.' },
                  ].map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 12px', background: 'rgba(0,165,163,0.06)', borderRadius: '10px', border: '1px solid rgba(0,165,163,0.12)' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#00897B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>Signal</div>
                        <div style={{ fontSize: '13px', color: '#0F1923', fontWeight: 600, lineHeight: 1.4 }}>{row.signal}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>Output</div>
                        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.4 }}>{row.output}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Footer note ── */}
              <div style={{ textAlign: 'center', fontSize: '13px', color: '#5B7080', lineHeight: 1.7, paddingBottom: '8px' }}>
                This roadmap updates as the platform learns.<br />Feedback from your team shapes every build decision.
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Guided Tour Overlay ── */}
      {tourStep !== null && tourRect && (() => {
        const step    = TOUR_STEPS[tourStep]
        const PAD     = 10
        const hl      = { left: tourRect.left - PAD, top: tourRect.top - PAD, width: tourRect.width + PAD * 2, height: tourRect.height + PAD * 2 }
        const tipW    = 340
        const tipH    = 180
        const rawLeft = tourRect.left
        const tipLeft = Math.max(12, Math.min(rawLeft, window.innerWidth - tipW - 12))
        const below   = tourRect.bottom + 16 + tipH < window.innerHeight
        const tipTop  = below ? tourRect.bottom + 16 : tourRect.top - tipH - 16

        return (
          <>
            {/* Dark overlay with SVG cutout */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 1100, pointerEvents: 'none' }}>
              <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                <defs>
                  <mask id="tourmask">
                    <rect x="0" y="0" width="100%" height="100%" fill="white" />
                    <rect x={hl.left} y={hl.top} width={hl.width} height={hl.height} rx="12" fill="black" />
                  </mask>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#tourmask)" />
              </svg>
              {/* Highlight ring */}
              <div style={{ position: 'absolute', left: hl.left, top: hl.top, width: hl.width, height: hl.height, borderRadius: '12px', border: '2px solid #00A5A3', boxShadow: '0 0 0 4px rgba(0,165,163,0.18), 0 0 28px rgba(0,165,163,0.25)' }} />
            </div>

            {/* Click absorber (keeps page non-interactive during tour) */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 1099, cursor: 'default' }} onClick={e => e.stopPropagation()} />

            {/* Tooltip card */}
            <div style={{ position: 'fixed', zIndex: 1110, left: tipLeft, top: tipTop, width: tipW, background: '#FFFFFF', border: '1px solid rgba(0,165,163,0.4)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.65)', animation: 'tourPop 0.2s ease' }}>
              {/* Step indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {TOUR_STEPS.map((_, i) => (
                    <div key={i} style={{ width: i === tourStep ? '18px' : '6px', height: '6px', borderRadius: '3px', background: i === tourStep ? '#00897B' : '#DDE8EE', transition: 'all 0.2s' }} />
                  ))}
                </div>
                <button onClick={endTour} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', padding: '0' }}>Skip tour</button>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '7px' }}>{step.title}</div>
              <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.65, marginBottom: '18px' }}>{step.desc}</div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {tourStep > 0 && (
                  <button
                    onClick={() => setTourStep(s => s! - 1)}
                    style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >Back</button>
                )}
                <button
                  onClick={() => tourStep < TOUR_STEPS.length - 1 ? setTourStep(s => s! + 1) : endTour()}
                  style={{ flex: 1, padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #00A5A3, #00C9C7)', color: 'white', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {tourStep < TOUR_STEPS.length - 1 ? 'Next →' : 'Done'}
                </button>
              </div>
            </div>
          </>
        )
      })()}

    </div>
  )
}
