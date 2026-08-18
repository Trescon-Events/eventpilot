'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { buildQuestions, ALL_DEPARTMENTS } from '@/app/lib/questions'
import type { Question } from '@/app/lib/questions'
import { computeAIRS } from '@/app/lib/airs'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { VALID_ACCESS_ROLES } from '@/app/lib/access/access-roles'
import PageHeader from '@/app/components/PageHeader'

// Colors here are literal (not CSS vars) on purpose — several are reused
// as `${meta.color}NN` alpha-suffixed strings elsewhere (badges, borders),
// which only works with a real hex value. Brightened for dark-card contrast
// where the original light-theme hex didn't already clear 4.5:1 on #142330.
const ROLE_META: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  standard:        { label: 'Standard',        color: '#7E93A1', bg: '#7E93A115', desc: 'Default — basic platform access' },
  hr:              { label: 'HR',              color: '#F5B94D', bg: '#F5B94D15', desc: 'Access to HR portal and leave management' },
  project_manager: { label: 'Project Mgr',    color: '#5AA9F2', bg: '#5AA9F215', desc: 'Can create and manage events' },
  project_director:{ label: 'Project Dir',    color: '#AF70E3', bg: '#AF70E315', desc: 'Project oversight across events' },
  admin:           { label: 'Admin',           color: '#34D399', bg: '#34D39915', desc: 'Platform admin — People, Events, Knowledge' },
  super_admin:     { label: 'Super Admin',     color: '#0099B3', bg: '#0099B315', desc: 'Full platform access, no restrictions' },
}

// Derived from the module registry (app/lib/registry/modules.tsx) instead of
// a hand-maintained duplicate list — this array previously drifted out of
// sync with the registry (had an orphan 'events' key with no real grantKey
// anywhere, an orphan 'smart_excel_admin', and 'timesheets' even though that
// module is actually access:'always' and was never gated by a grant at all).
// A module appears here only if it (or its toolkitHub override) is really
// `tool_grant`-gated with a real, non-null grantKey.
type PlatformTool = { key: string; label: string; desc: string; color: string; icon: ReactNode }
const PLATFORM_TOOLS: PlatformTool[] = getModuleRegistry().reduce<PlatformTool[]>((acc, m) => {
  const access = m.toolkitHub?.access ?? m.access
  if (access.kind === 'tool_grant' && access.grantKey) {
    acc.push({
      key: access.grantKey,
      label: m.toolkitHub?.label ?? m.label,
      desc: m.toolkitHub?.description ?? m.description,
      color: m.toolkitHub?.color ?? m.color,
      icon: m.icon,
    })
  }
  return acc
}, [])

// Literal hex (not vars) — reused as `${o.color}NN` alpha strings throughout.
const OFFICES = [
  { id: 'dubai',     label: 'Dubai',     total: 0, color: '#12C9BD' },
  { id: 'bangalore', label: 'Bangalore', total: 0, color: '#A478FF' },
  { id: 'mangalore', label: 'Mangalore', total: 0, color: '#F1667A' },
  { id: 'manipal',   label: 'Manipal',   total: 0, color: '#8882DA' },
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

type TaskResponse = {
  staff_id?: string; task_name?: string
  task_description?: string | null; tools_used?: string[]
  time_taken_today?: string | null; ai_time_estimate?: string | null
  skill_needed?: string | null; ai_readiness?: number
  frequency?: string | null; ai_proof?: string | null
  automation_history?: string; tool_proficiency?: Record<string, number>
}
type TaskProfile = {
  staff_id: string
  responses: TaskResponse[]
  submitted_at: string | null
}

type LearningCompletion = { id: string; staff_id: string; course_id: string; test_score: number | null; passed: boolean; attempt_count: number; completed_at: string }
type LearningCourse     = { id: string; title: string; tier_level: string; is_mandatory: boolean; estimated_minutes: number }
type LearningStaff      = { id: string; name: string; department: string | null; office_id: string; role: string | null }
type LearningAttempt    = { id: string; staff_id: string; course_id: string; score: number | null; passed: boolean | null; attempted_at: string }
type NeverStarted       = { id: string; name: string; department: string | null; office_id: string; role: string | null }
type DeptParticipation  = { dept: string; total: number; active: number }

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
    textarea: 'var(--teal-mid)',
    chips:    'var(--lime)',
    scale:    'var(--red)',
    select:   'var(--red)',
    text:     'var(--teal-mid)',
  }
  // Text on a solid saturated badge fill uses that family's "-light"/"-dark"
  // token, never white/ink (globals.css pairing rule #3).
  const typeBadgeText: Record<string, string> = {
    textarea: 'var(--teal-light)',
    chips:    'var(--lime-dark)',
    scale:    'var(--red-light)',
    select:   'var(--red-light)',
    text:     'var(--teal-light)',
  }

  return (
    <div>
      {/* Dept selector */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px' }}>
        {ALL_DEPARTMENTS.map(d => (
          <button key={d} onClick={() => setQDept(d)}
            style={{ padding: '7px 16px', borderRadius: '16px', border: `1px solid ${qDept === d ? 'var(--teal)' : 'var(--border)'}`, background: qDept === d ? 'rgba(0,122,110,0.1)' : 'transparent', color: qDept === d ? 'var(--teal)' : 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {d}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={{ background: 'rgba(0,165,163,0.08)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '4px' }}>Questionnaire Preview</div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{qDept} Department</div>
          <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>{questions.length} questions total · Read-only view</div>
        </div>
        <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--teal-mid)', lineHeight: 1 }}>{questions.length}</div>
      </div>

      {/* Question cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {questions.map((q, idx) => (
          <div key={q.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
            {/* Step + type row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', flexShrink: 0 }}>
                {idx + 1}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: typeBadgeColor[q.type] ?? 'var(--card-hi)', color: typeBadgeText[q.type] ?? 'var(--ink)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {typeLabel[q.type] ?? q.type}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)', fontFamily: 'monospace' }}>{q.id}</span>
            </div>

            {/* Question text */}
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.5, marginBottom: q.subtext ? '6px' : '0' }}>
              {q.question}
            </div>
            {q.subtext && (
              <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '0' }}>
                {q.subtext}
              </div>
            )}

            {/* Options display */}
            {q.type === 'chips' && q.options && q.options.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                {q.options.map(opt => (
                  <span key={opt} style={{ padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink3)', background: 'var(--card)' }}>
                    {opt}
                  </span>
                ))}
              </div>
            )}

            {q.type === 'select' && q.options && q.options.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {q.options.map((opt, oi) => (
                  <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1.5px solid var(--border)', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{opt}</span>
                  </div>
                ))}
              </div>
            )}

            {q.type === 'scale' && q.options && q.options.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {q.options.map((opt, oi) => (
                  <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--ink3)' }}>{oi + 1}</span>
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{opt}</span>
                  </div>
                ))}
              </div>
            )}

            {q.type === 'textarea' && q.placeholder && (
              <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'var(--card)' }}>
                <span style={{ fontSize: '13px', color: 'var(--ink3)', fontStyle: 'italic', lineHeight: 1.5 }}>{q.placeholder}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Tier colors are literal (not vars) — reused as `${tier.color}NN` alpha
// strings across the Intelligence/Overview tabs; brightened for 4.5:1+ on
// the dark card background (#142330). Same 5 colors are duplicated in
// airsTier() and a couple of local consts below — kept in sync by value.
const PLAYBOOK_TIERS = [
  { tier: 'AI-Forward',  range: '75–100', color: '#34D399', action: 'Assign as AI Pilot Leads. They run the first automation sprint for their department.', owner: 'AI Lead + Dept Head', by: 'This sprint' },
  { tier: 'AI-Ready',    range: '55–74',  color: '#1296BA', action: 'Pair with an AI-Forward colleague. Start a 30-day tool adoption plan with one specific workflow to automate.', owner: 'Event Pilot Training', by: '30 days' },
  { tier: 'AI-Aware',    range: '35–54',  color: '#F5B94D', action: 'Foundation workshop (half day). Pick one tool for their role and commit to using it daily for 2 weeks.', owner: 'Event Pilot Training + HR', by: '60 days' },
  { tier: 'AI-Curious',  range: '15–34',  color: '#FB923C', action: "Awareness session first — why AI matters for their specific role. Then intro to ChatGPT basics.", owner: 'HR + Event Pilot', by: '90 days' },
  { tier: 'AI-Unaware',  range: '0–14',   color: '#F1667A', action: 'Digital literacy assessment first. Build a personalised catch-up plan before any AI training.', owner: 'HR', by: '120 days' },
]

function AdminPageInner() {
  const [authed, setAuthed]   = useState(() => typeof window !== 'undefined' && sessionStorage.getItem('tai_admin_authed') === '1')
  const [adminStaffId, setAdminStaffId] = useState(() => typeof window !== 'undefined' ? sessionStorage.getItem('tai_admin_staff_id') ?? '' : '')
  const [isSuperAdmin, setIsSuperAdmin] = useState(() => typeof window !== 'undefined' && (sessionStorage.getItem('tai_admin_staff_id') === 'super-admin' || sessionStorage.getItem('tai_is_super_admin') === '1'))
  const [code, setCode]       = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [codeError, setCodeError] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks]     = useState<TaskProfile[]>([])
  type AdminTab = 'overview' | 'people' | 'intelligence' | 'learning' | 'suggest' | 'events' | 'commercial' | 'review' | 'toolkit' | 'security' | 'finance' | 'hr' | 'branding'
  const [tab, setTab]         = useState<AdminTab>(() => {
    if (typeof window === 'undefined') return 'overview'
    const t = new URLSearchParams(window.location.search).get('tab') as AdminTab | null
    return t ?? 'overview'
  })
  // The lazy initializer above only ever reads the URL once, on first
  // mount — a client-side navigation to /admin?tab=X while already on
  // /admin (e.g. from the persistent sidebar's Admin section deep-links,
  // 2026-08-17) reuses this same component instance rather than
  // remounting it, so without this fix the URL would change but the
  // visible tab wouldn't. useSearchParams() is Next's reactive hook — it
  // re-renders this component when the query string actually changes via
  // real router navigation (a <Link>). Adjusting state DURING render
  // (React's own documented pattern for "state that tracks a changed
  // prop," not a useEffect) rather than reacting to it afterward — avoids
  // an extra render pass, and this exact effect-based version was rejected
  // by this repo's react-hooks/set-state-in-effect lint gate. Does not
  // fire for syncAdminUrl()'s own window.history.replaceState calls below
  // (a raw DOM API, outside the router Next/useSearchParams tracks) —
  // harmless, since those already happen in the same tick as their own
  // setTab() call.
  const searchParams = useSearchParams()
  const searchParamsTab = searchParams.get('tab') as AdminTab | null
  const [lastSyncedTab, setLastSyncedTab] = useState(searchParamsTab)
  if (searchParamsTab !== lastSyncedTab) {
    setLastSyncedTab(searchParamsTab)
    if (searchParamsTab) setTab(searchParamsTab)
  }

  // Activity tracking state
  type ActiveUser = { staff_id: string; last_seen_at: string; ip: string | null; staff_members: { id: string; name: string; department: string | null; role: string | null; office_id: string; job_level: string } }
  type LoginHistoryRow = { id: string; ip: string | null; success: boolean; reason: string | null; attempted_at: string }
  const [activeUsers,       setActiveUsers]       = useState<ActiveUser[]>([])
  const [loginHistoryStaff, setLoginHistoryStaff] = useState<{ id: string; name: string; email: string } | null>(null)
  const [loginHistory,      setLoginHistory]      = useState<LoginHistoryRow[]>([])
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false)
  const [loginCounts,       setLoginCounts]       = useState<Record<string, number>>({})

  // Security tab state
  type AuditRow = { id: string; email: string; ip: string | null; success: boolean; reason: string | null; attempted_at: string }
  type SecurityData = { today_logins: number; today_failures: number; locked_now: string[]; recent: AuditRow[] }
  const [securityData,    setSecurityData]    = useState<SecurityData | null>(null)
  const [securityLoading, setSecurityLoading] = useState(false)

  async function fetchActiveUsers() {
    const res = await fetch('/api/activity/active')
    if (res.ok) setActiveUsers(await res.json())
  }

  async function fetchLoginCounts() {
    const res = await fetch('/api/activity/logins?summary=1')
    if (res.ok) setLoginCounts(await res.json())
  }

  async function openLoginHistory(staff: { id: string; name: string; email: string }) {
    setLoginHistoryStaff(staff)
    setLoginHistory([])
    setLoginHistoryLoading(true)
    const res = await fetch(`/api/activity/logins?staff_id=${staff.id}&limit=50`)
    if (res.ok) setLoginHistory(await res.json())
    setLoginHistoryLoading(false)
  }

  async function fetchSecurity() {
    if (securityLoading) return
    setSecurityLoading(true)
    try {
      const res = await fetch('/api/security/audit')
      if (res.ok) setSecurityData(await res.json())
    } finally {
      setSecurityLoading(false)
    }
  }

  // Staff Management tab state
  const [staffList,       setStaffList]       = useState<{id:string;name:string;email:string;department:string|null;role:string|null;office_id:string|null;job_level:string;manager_id:string|null;toolkit_access?:boolean;tool_grants?:Record<string,boolean>;access_enabled?:boolean;access_roles?:string[];last_login_at?:string|null;profile_complete?:boolean;joined_at?:string|null;attendance_exempted?:boolean;timesheet_exempted?:boolean}[]>([])
  // Tool permissions drawer
  const [permOpen,    setPermOpen]    = useState(false)
  const [permStaff,   setPermStaff]   = useState<{id:string;name:string;email:string;job_level:string;department:string|null;office_id:string|null;toolkit_access?:boolean;tool_grants?:Record<string,boolean>}|null>(null)
  const [permGrants,  setPermGrants]  = useState<Record<string,boolean>>({})
  const [permSaving,  setPermSaving]  = useState<string|null>(null)
  const [permTab,     setPermTab]     = useState<'person'|'bulk'>('person')
  const [bulkTool,    setBulkTool]    = useState('smart_data')
  const [bulkSel,     setBulkSel]     = useState<Set<string>>(new Set())
  const [bulkSearch,  setBulkSearch]  = useState('')
  const [bulkSaving,  setBulkSaving]  = useState(false)

  // Access roles modal
  const [rolesOpen,   setRolesOpen]   = useState(false)
  const [rolesStaff,  setRolesStaff]  = useState<{id:string;name:string;email:string;job_level:string;department:string|null;office_id:string|null;access_roles?:string[]}|null>(null)
  const [rolesEdit,   setRolesEdit]   = useState<string[]>([])
  const [rolesSaving, setRolesSaving] = useState(false)
  const [bulkDone,    setBulkDone]    = useState<string|null>(null)
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
        body:    JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026' }),
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
      body: JSON.stringify({ admin_code: 'eventpilot2026', staff: csvParsed }),
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
      body: JSON.stringify({ admin_code: 'eventpilot2026', staff: [addForm] }),
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
  // Dept course seeding
  const [deptSeedDept,   setDeptSeedDept]   = useState('Events')
  const [deptSeedTier,   setDeptSeedTier]   = useState<'foundation' | 'adoption' | 'advanced'>('foundation')
  const [deptSeedCount,  setDeptSeedCount]  = useState(2)
  const [deptSeedState,  setDeptSeedState]  = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [deptSeedResult, setDeptSeedResult] = useState<{ courses: { id: string; title: string; tier_level: string }[]; errors?: string[] } | null>(null)
  const [learningData, setLearningData] = useState<{ completions: LearningCompletion[]; courses: LearningCourse[]; staff: LearningStaff[]; attempts: LearningAttempt[]; never_started: NeverStarted[]; participation_by_dept: DeptParticipation[] } | null>(null)
  const [learningLoading, setLearningLoading] = useState(false)
  // Course assignment
  const [assignCourseId,    setAssignCourseId]    = useState('')
  const [assignTarget,      setAssignTarget]      = useState<'all' | 'dept' | 'individual'>('dept')
  const [assignCourseDept,  setAssignCourseDept]  = useState('')
  const [assignCourseStaff, setAssignCourseStaff] = useState('')
  const [assignDueDate,     setAssignDueDate]     = useState('')
  const [assigning,         setAssigning]         = useState(false)
  const [assignMsg,         setAssignMsg]         = useState<{ text: string; ok: boolean } | null>(null)
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
    return !localStorage.getItem(`pilot_admin_welcomed_${uid}`)
  })
  const [tourStep,    setTourStep]    = useState<number | null>(null)
  const [tourRect,    setTourRect]    = useState<DOMRect | null>(null)
  const [showRoadmap,   setShowRoadmap]   = useState(false)
  const [buildLog,      setBuildLog]      = useState<{ date: string; time: string; author: string; items: { title: string; bullets: string[] }[] }[]>([])
  const [suggText,      setSuggText]      = useState('')
  const [suggSending,   setSuggSending]   = useState(false)
  const [suggSent,      setSuggSent]      = useState(false)
  const [gettingStarted, setGettingStarted] = useState(() => {
    if (typeof window === 'undefined') return { staff: false, brief: false, course: false }
    const stored = localStorage.getItem('pilot_admin_progress')
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
    event_date: string | null; end_date: string | null; venue: string | null; city: string | null
    client_name: string | null; description: string | null
    // The event's real dates, per the Event Details page — event_date/
    // end_date are the Staff Portal project's staff-allocation window,
    // NOT the event's actual dates (Madhu, 2026-08-13), so nothing in
    // this tab uses them for scheduling/grouping/display anymore.
    public_dates_display: string | null
    event_staff?: { count: number }[] | null
    documents?:   { count: number }[] | null
    event_checklist?: { count: number }[] | null
  }
  const [events,        setEvents]        = useState<EventRow[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventForm,     setEventForm]     = useState({ name: '', type: 'conference', status: 'planning', event_date: '', end_date: '', venue: '', city: '', client_name: '', description: '' })
  const [eventSaving,   setEventSaving]   = useState(false)
  const [eventMsg,      setEventMsg]      = useState('')
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [eventStaff,    setEventStaff]    = useState<{id:string;role:string|null;staff_members:{id:string;name:string;department:string|null}}[]>([])
  const [assignStaffId, setAssignStaffId] = useState('')
  const [assignRole,    setAssignRole]    = useState('')
  const [eventView,       setEventView]       = useState<'inprogress' | 'closed'>('inprogress')
  const [eventSearch,     setEventSearch]     = useState('')
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
      body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026', course_id: courseId }),
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
      body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026', course_id: courseId }),
    })
    if (res.ok) {
      setDraftCourses(prev => prev.filter(c => c.id !== courseId))
      setExpandedDraftId(null)
      setReviewMsg('Course rejected and removed.')
    } else {
      setReviewMsg('Rejection failed. Try again.')
    }
  }

  const [showCreateEvent, setShowCreateEvent] = useState(false)

  // Keeps the URL in sync with the current tab (replaceState, not
  // pushState — tab switches shouldn't spam browser history) so a "back" link
  // from a tool page lands the user where they actually came from instead of
  // always Overview. `sub` is legacy from the retired Knowledge Base tab's
  // sub-tab param — no current tab passes one, kept optional in case a future
  // tab wants the same pattern.
  const syncAdminUrl = (t: string, sub?: string) => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    params.set('tab', t)
    if (sub) params.set('sub', sub); else params.delete('sub')
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }

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
    if (res.ok) { setEventMsg('Event created.'); setEventForm({ name: '', type: 'conference', status: 'planning', event_date: '', end_date: '', venue: '', city: '', client_name: '', description: '' }); fetchEvents() }
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

  async function seedDemo() {
    setSeedLoading(true); setSeedMsg('')
    const res = await fetch('/api/seed-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026' }) })
    const data = await res.json()
    setSeedMsg(data.message ?? data.error ?? 'Done')
    setSeedLoading(false)
    if (data.success) fetchData()
  }

  async function clearDemo() {
    setSeedLoading(true); setSeedMsg('')
    const res = await fetch('/api/seed-demo', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026' }) })
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
        admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026',
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
      body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026', course: courseWithCredit }),
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
    { id: 'tour-tabs',             title: 'Your main sections',         desc: 'Navigate between Overview, All Staff, Intelligence, Learning Lab, Events, Knowledge Base, and more using these tabs.' },
    { id: 'tour-stats',            title: 'Org readiness at a glance',  desc: 'Total staff in the system, how many have completed their profile, and your organisation\'s live AI Readiness Score — all updating in real time.' },
    { id: 'tour-started',          title: 'Your first 3 actions',       desc: 'Complete these three steps to get Event Pilot fully running. Each one unlocks more of the platform for your team.' },
    { id: 'tour-intelligence-tab', title: 'Intelligence tab',           desc: 'AI-generated analysis of your org\'s readiness. Department breakdowns, tier distributions, and what to do about gaps — with no manual input.' },
    { id: 'tour-studio-tab',       title: 'Learning Lab',             desc: 'Describe a skill gap, pick a department, and Gemini generates a full course with reading content, tasks, and a quiz. Ready to publish in under a minute.' },
    { id: 'tour-pilot-btn',       title: 'Pilot — your AI assistant', desc: 'Ask Pilot anything: team progress, how to use a feature, what a AI Readiness Score means, or what to do next. It knows your org data.' },
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

  // Auto-auth if arriving via SSO (cookie has adm:true but sessionStorage not set yet)
  useEffect(() => {
    if (authed) return
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(session => {
        if (session?.adm && session?.sid) {
          sessionStorage.setItem('tai_admin_authed', '1')
          sessionStorage.setItem('tai_admin_staff_id', session.sid)
          localStorage.setItem('tai_staff_id', session.sid)
          setAdminStaffId(session.sid)
          setAuthed(true)
          const superAdmin = session.sid === 'super-admin' || (Array.isArray(session.roles) && session.roles.includes('super_admin'))
          if (superAdmin) sessionStorage.setItem('tai_is_super_admin', '1')
          setIsSuperAdmin(superAdmin)
        }
      })
      .catch(() => {})
  }, [authed])

  useEffect(() => {
    if (!authed) return
    fetch('/api/platform-status').then(r => r.json()).then(d => setIsDemo(d.is_demo ?? false)).catch(() => {})
    fetchData()
    fetchActiveUsers()
    fetchLoginCounts()
    // Heartbeat: tell server the admin is live; refresh active users list
    const heartbeatInterval = setInterval(() => {
      fetch('/api/activity/heartbeat', { method: 'POST' }).catch(() => {})
      fetchActiveUsers()
    }, 60_000)
    const ch = supabase.channel('admin-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_members' }, fetchData)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_task_profiles' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(ch); clearInterval(heartbeatInterval) }
  }, [authed, fetchData])  // eslint-disable-line react-hooks/exhaustive-deps

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
  // tasks is [{ staff_id, responses[] }] — flatten for readiness list
  const allResponses     = tasks.flatMap(t => t.responses ?? [])
  const readinessList    = allResponses.filter(r => r.ai_readiness).map(r => r.ai_readiness!)
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
  const deptReadinessList = rdFilteredTasks.flatMap(t => t.responses ?? []).filter(r => r.ai_readiness).map(r => r.ai_readiness!)

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
  // Literal (not vars) — indexed and reused as `${readinessColors[n]}NN` alpha strings.
  const readinessColors = ['#F1667A', '#F1667A', '#F1667A', '#12C9BD', '#C0F43C']

  /* ── Most common tools (filtered by readinessDeptFilter) ── */
  const toolCount: Record<string, number> = {}
  for (const t of rdFilteredTasks) for (const r of (t.responses ?? [])) for (const tool of (r.tools_used ?? [])) toolCount[tool] = (toolCount[tool] ?? 0) + 1
  const topTools = Object.entries(toolCount).sort((a, b) => b[1] - a[1]).slice(0, 10)

  /* ═══════════════════════════════════════════════════════════════════
     AIRS — AI Readiness Score  (0–100)

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
  // Literal (not vars) — color is reused as `${impact.color}NN` alpha strings.
  const DEPT_IMPACT: Record<string, { priority: string; color: string; why: string }> = {
    'Events':               { priority: 'Critical', color: '#F1667A', why: 'Massive manual coordination overhead — vendor, logistics, reporting' },
    'Sales & Sponsorship':  { priority: 'Critical', color: '#F1667A', why: 'Prospecting, proposal writing, follow-ups — all AI-automatable' },
    'Finance':              { priority: 'Critical', color: '#F1667A', why: 'Reconciliation, reporting, approval chasing — high automation value' },
    'Marketing':            { priority: 'High',     color: '#F1667A', why: 'Content creation and campaign analysis — most mature AI tools exist' },
    'DemandifyMedia':       { priority: 'High',     color: '#F1667A', why: 'Ad optimisation and reporting — AI tools are industry standard now' },
    'HR & Recruitment':     { priority: 'High',     color: '#F1667A', why: 'CV screening and scheduling are solved problems with AI' },
    'Content & Design':     { priority: 'High',     color: '#F1667A', why: 'Generative AI for content/design is fastest-moving category' },
    'Leadership':           { priority: 'High',     color: '#F1667A', why: 'Decision intelligence and real-time visibility gaps' },
    'IT':                   { priority: 'Medium',   color: '#F1667A', why: 'Already closest — focus on enabling others, not self-training' },
    'Operations':           { priority: 'Medium',   color: '#F1667A', why: 'Process automation needs depends on current tool stack' },
    'Government Relations': { priority: 'Medium',   color: '#F1667A', why: 'Document automation + status tracking — achievable in 6 months' },
    'Other':                { priority: 'Medium',   color: '#F1667A', why: 'Assess after more data' },
  }

  // AIRS tier label + color
  function airsTier(score: number) {
    if (score >= 75) return { label: 'AI-Forward',  color: '#34D399', desc: 'Deploy automations now' }
    if (score >= 55) return { label: 'AI-Ready',    color: '#1296BA', desc: 'Train + deploy in parallel' }
    if (score >= 35) return { label: 'AI-Aware',    color: '#F5B94D', desc: '90-day foundation plan' }
    if (score >= 15) return { label: 'AI-Curious',  color: '#FB923C', desc: 'Awareness + pilot needed' }
    return               { label: 'AI-Unaware',   color: '#F1667A', desc: 'Start from literacy basics' }
  }

  // ── Individual AIRS scores using shared computeAIRS (single source of truth) ──
  // tasks[] is [{ staff_id, responses[] }] — responses contains ai_readiness, automation_history, tool_proficiency
  const profileByStaff = Object.fromEntries(tasks.map(t => [t.staff_id, t.responses ?? []]))

  const memberTairs = Object.fromEntries(
    members.map(m => {
      const responses = profileByStaff[m.id] ?? []
      const score = responses.length > 0 ? computeAIRS(responses) : 0
      return [m.id, { score }]
    })
  )

  // ── Per-department AIRS (average of individual scores, weighted by assessed members) ──
  type DeptAirs = {
    dept: string; score: number; fluency: number; maturity: number; engagement: number
    interviewed: number; joined: number; impact: typeof DEPT_IMPACT[string]
  }
  const deptAirsMap: DeptAirs[] = []
  for (const dept of [...new Set(members.map(m => m.department ?? 'Other'))]) {
    const dMembers    = members.filter(m => (m.department ?? 'Other') === dept)
    const interviewed = dMembers.filter(m => m.profile_complete).length
    const dScores     = dMembers.filter(m => m.profile_complete).map(m => memberTairs[m.id]?.score ?? 0)
    const score       = dScores.length > 0 ? Math.round(dScores.reduce((a, b) => a + b, 0) / dScores.length) : 0
    // keep fluency/maturity/engagement for legacy UI slots — derive from score
    deptAirsMap.push({ dept, score, fluency: score, maturity: 0, engagement: 0, interviewed, joined: dMembers.length, impact: DEPT_IMPACT[dept] ?? DEPT_IMPACT['Other'] })
  }
  const sortedDeptAirs = [...deptAirsMap].sort((a, b) => b.score - a.score)

  // ── Per-office AIRS ──
  const officeAirs = OFFICES.map(o => {
    const oMembers    = members.filter(m => m.office_id === o.id)
    const interviewed = oMembers.filter(m => m.profile_complete).length
    const oScores     = oMembers.filter(m => m.profile_complete).map(m => memberTairs[m.id]?.score ?? 0)
    const score       = oScores.length > 0 ? Math.round(oScores.reduce((a, b) => a + b, 0) / oScores.length) : 0
    return { ...o, score, fluency: score, maturity: 0, engagement: 0, interviewed, joined: oMembers.length }
  }).filter(o => o.joined > 0).sort((a, b) => b.score - a.score)

  // ── Org-level AIRS (average of all assessed individual scores) ──
  const allAssessedScores = members.filter(m => m.profile_complete).map(m => memberTairs[m.id]?.score ?? 0)

  const topIndividuals = members
    .filter(m => m.profile_complete)
    .map(m => ({ ...m, toars: memberTairs[m.id]?.score ?? 0 }))
    .sort((a, b) => b.toars - a.toars)
    .slice(0, 8)

  // ── Assessed-only avg score ──
  const assessedScores  = allAssessedScores.filter(s => s > 0)
  const assessedAvg     = assessedScores.length > 0 ? Math.round(assessedScores.reduce((a, b) => a + b, 0) / assessedScores.length) : 0
  const assessedTier    = airsTier(assessedAvg)
  const participationPct = totalJoined > 0 ? Math.round(profilesComplete / totalJoined * 100) : 0

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
    localStorage.setItem(`pilot_admin_welcomed_${uid}`, '1')
    setShowWelcome(false)
    if (!localStorage.getItem(`pilot_tour_done_${uid}`)) {
      setTimeout(() => setTourStep(0), 400)
    }
  }

  function endTour() {
    const uid = sessionStorage.getItem('tai_admin_staff_id') ?? 'admin'
    localStorage.setItem(`pilot_tour_done_${uid}`, '1')
    setTourStep(null)
    setTourRect(null)
  }

  function markProgress(key: 'staff' | 'brief' | 'course') {
    setGettingStarted((prev: { staff: boolean; brief: boolean; course: boolean }) => {
      if (prev[key]) return prev
      const next = { ...prev, [key]: true }
      localStorage.setItem('pilot_admin_progress', JSON.stringify(next))
      return next
    })
  }

  /* ── Login screen ── */
  if (!authed) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ width: '56px', height: '56px', background: '#00A5A320', border: '2px solid var(--teal-mid)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Admin Access</h1>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '32px' }}>Event Pilot — Leadership Dashboard</p>
          <form onSubmit={handleAuth}>
            <input type="email" value={adminEmail} onChange={e => { setAdminEmail(e.target.value); setCodeError('') }}
              placeholder="Your work email" autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? 'var(--red)' : 'var(--border)'}`, background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', outline: 'none', fontFamily: 'inherit', marginBottom: '10px', boxSizing: 'border-box' }} />
            <input type="password" value={code} onChange={e => { setCode(e.target.value); setCodeError('') }}
              placeholder="Password"
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? 'var(--red)' : 'var(--border)'}`, background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', outline: 'none', fontFamily: 'inherit', marginBottom: '12px', boxSizing: 'border-box' }} />
            {codeError && <p style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '12px' }}>{codeError}</p>}
            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter Dashboard
            </button>
          </form>
          <Link href="/dashboard" style={{ display: 'block', marginTop: '20px', fontSize: '13px', color: 'var(--ink3)', textDecoration: 'none' }}>Back to dashboard</Link>
        </div>
      </div>
    )
  }

  /* ═══════════ DASHBOARD ═══════════ */
  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', color: 'var(--ink)' }}>

      {/* ── Welcome Modal (first login only) ── */}
      {showWelcome && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid rgba(0,165,163,0.35)', borderRadius: '16px', maxWidth: '640px', width: '100%', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,165,163,0.08)' }}>

            {/* Top colour bar */}
            <div style={{ height: '4px', background: 'linear-gradient(90deg, var(--teal-mid) 0%, var(--lime) 60%, #A478FF 100%)' }} />

            <div style={{ padding: '36px 40px 32px' }}>

              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{ width: '52px', height: '52px', background: 'linear-gradient(135deg, #12C9BD 0%, #0B8079 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" fill="none" stroke="var(--teal-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '3px' }}>First time here?</div>
                  <div style={{ fontSize: '36px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.4px', lineHeight: 1.1 }}>Welcome to Event Pilot</div>
                </div>
              </div>

              <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.75, margin: '0 0 28px' }}>
                Event Pilot is Trescon&apos;s internal AI readiness platform — measuring where every employee stands today and moving them forward through structured, role-specific learning.
              </p>

              {/* Feature tiles — 3 column grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '28px' }}>
                {[
                  {
                    color: 'var(--teal-mid)',
                    bg: 'rgba(0,165,163,0.1)',
                    border: 'rgba(0,165,163,0.25)',
                    icon: <svg width="18" height="18" fill="none" stroke="var(--teal-mid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
                    title: 'AI Readiness Score',
                    desc: 'Live AI readiness score (0–100) per staff member',
                  },
                  {
                    color: 'var(--teal)',
                    bg: 'rgba(192,244,60,0.08)',
                    border: 'rgba(192,244,60,0.22)',
                    icon: <svg width="18" height="18" fill="none" stroke="var(--lime)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
                    title: 'AI Courses',
                    desc: 'Role-based learning paths, generated and tracked',
                  },
                  {
                    color: '#A478FF',
                    bg: 'rgba(164,120,255,0.09)',
                    border: 'rgba(164,120,255,0.25)',
                    icon: <svg width="18" height="18" fill="none" stroke="#A478FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
                    title: 'Pilot AI',
                    desc: 'Ask anything — platform, progress, or strategy',
                  },
                ].map((item, i) => (
                  <div key={i} style={{ padding: '16px 14px', background: item.bg, border: `1px solid ${item.border}`, borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', background: `${item.bg}`, border: `1px solid ${item.border}`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: item.color, marginBottom: '4px' }}>{item.title}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink3)', lineHeight: 1.55 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={dismissWelcome}
                style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #12C9BD 0%, #0EA79D 100%)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                Take me to the dashboard
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '13px', color: 'var(--ink3)' }}>
                This screen only appears on first login
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Page header — replaces the old shared AppShellNav (own logo/badge
          markup, own Help/Avatar dropdowns) now that the global shell
          persists independently and already provides those, plus the
          Toolkit/Pilot Projects quick-access pair. "Platform Updates" (the
          build-log roadmap drawer) and "Org Chart" are admin-dashboard-
          specific with no other home, so they stay here as page actions. */}
      <PageHeader
        eyebrow="Admin"
        title="Admin Dashboard"
        description="Live org intelligence — AI readiness, learning progress, and staff development across all offices."
        actions={<>
          {loading && <span style={{ fontSize: '12px', color: 'var(--teal-mid)', whiteSpace: 'nowrap' }}>Updating...</span>}
          <Link href="/admin/org-chart" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, padding: '7px 11px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" fill="none" stroke="var(--teal-mid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="4" rx="1"/><rect x="1" y="14" width="6" height="4" rx="1"/><rect x="9" y="14" width="6" height="4" rx="1"/><rect x="17" y="14" width="6" height="4" rx="1"/><line x1="4" y1="14" x2="4" y2="11"/><line x1="12" y1="14" x2="12" y2="6"/><line x1="20" y1="14" x2="20" y2="11"/><line x1="4" y1="11" x2="20" y2="11"/></svg>
            Org Chart
          </Link>
          <button
            onClick={() => { setShowRoadmap(true); setSuggSent(false); setSuggText(''); fetch('/api/build-log').then(r => r.json()).then(data => { if (Array.isArray(data)) setBuildLog(data) }).catch(() => {}) }}
            title="Platform Updates — what shipped and when"
            style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
        </>}
      />

      {/* ── Demo mode banner — auto-hides once real staff data is imported ── */}
      {isDemo && (
        <div style={{ background: 'rgba(139,26,26,0.08)', borderBottom: '1px solid rgba(139,26,26,0.25)', padding: '10px 40px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="14" height="14" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', animation: 'demoGlow 3s linear infinite' }}>Demo Mode</span>
          <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>The data shown on this dashboard is sample data for demonstration purposes only. It does not represent any real individual or organisation.</span>
        </div>
      )}

      {/* ── Temporary testing quick-links (2026-08-10) — SAE Phase 2/4 tools
          have no permanent home in the nav yet. Remove once a real
          placement/navigation is decided. */}
      <div style={{ padding: '14px 40px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Testing shortcuts</span>
          <Link href="/admin/email-templates" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, padding: '6px 11px', borderRadius: '8px', textDecoration: 'none' }}>
            Email Templates
          </Link>
          <Link href="/admin/form-templates" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, padding: '6px 11px', borderRadius: '8px', textDecoration: 'none' }}>
            Form Templates (global defaults)
          </Link>
          <Link href="/admin/events/5e2f89f4-49aa-4358-9791-f7654685246d/stakeholders/form-builder/speaker" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, padding: '6px 11px', borderRadius: '8px', textDecoration: 'none' }}>
            Form Builder — Speakers (World AI Show Malaysia)
          </Link>
          <Link href="/admin/events/5e2f89f4-49aa-4358-9791-f7654685246d/stakeholders" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, padding: '6px 11px', borderRadius: '8px', textDecoration: 'none' }}>
            Stakeholder Hub (same event)
          </Link>
        </div>
      </div>

      <div style={{ padding: '40px' }}>

        {/* ── Tabs ── */}
        {(() => {
          // Literal (not vars) — reused as `${accent}NN` alpha strings below.
          const TAB_ACCENT: Record<string, string> = {
            overview:     '#12C9BD',
            people:       '#1296BA',
            intelligence: '#A478FF',
            learning:     '#12C9BD',
            suggest:      '#A478FF',
            events:       '#12C9BD',
            review:       '#F1667A',
            security:     '#6285EA',
            toolkit:      '#0EA79D',
            finance:      '#5AA9F2',
            hr:           '#A78BFA',
            branding:     '#A172F2',
          }
          // Tabs that don't render inline content in this tab bar — they're
          // pure navigation links to a separate module (with its own
          // persistent sidebar now, per the nav overhaul). Finance and HR
          // Portal had no discovery path from the Admin Dashboard at all
          // before this; added per Madhu's request, 15 Jul 2026. Distinct
          // from the old Knowledge Base/DocuHub tabs (removed earlier) which
          // rendered thousands of lines of real content inline here — a
          // link-only tab doesn't reintroduce that problem. Branding added
          // 27 Jul 2026, same reasoning — the Font Library
          // (app/admin/branding/fonts) had no discovery path either.
          const NAV_LINK_HREF: Record<string, string> = {
            toolkit: '/admin/toolkit',
            finance: '/finance',
            hr: '/hr',
            branding: '/admin/branding/fonts',
          }
          return (
            <div id="tour-tabs" style={{ display: 'flex', gap: '6px', marginBottom: '28px', flexWrap: 'wrap' }}>
              {([
                ['overview',     'Overview'],
                ['people',       'People'],
                ['intelligence', 'Intelligence'],
                ['learning',     'Learning Analytics'],
                ['suggest',      'AI Course Generator'],
                ['events',       'Events'],
                ['finance',      'Finance'],
                ['hr',           'HR Portal'],
                ['branding',     'Branding'],
                ...(isSuperAdmin ? [['review', 'Review Queue']] : []),
                ...(isSuperAdmin ? [['security', 'Security']] : []),
              ] as [typeof tab, string][]).map(([t, label]) => {
                const accent  = TAB_ACCENT[t] ?? '#12C9BD'
                const active  = tab === t
                return (
                  <button key={t}
                    id={t === 'intelligence' ? 'tour-intelligence-tab' : t === 'suggest' ? 'tour-studio-tab' : undefined}
                    onClick={() => { if (NAV_LINK_HREF[t]) { window.location.href = NAV_LINK_HREF[t]; return; } setTab(t as typeof tab); syncAdminUrl(t); if (t === 'learning') fetchLearning(); if (t === 'people') { fetchStaffList(); markProgress('staff') } if (t === 'events') { fetchEvents(); fetchEventSummaries(); } if (t === 'review') fetchDrafts(); if (t === 'suggest') markProgress('course'); if (t === 'security') fetchSecurity() }}
                    style={{
                      padding:         active ? '9px 22px' : '9px 20px',
                      borderRadius:    '10px',
                      border:          active ? `1.5px solid ${accent}` : '1px solid var(--border)',
                      cursor:          'pointer',
                      fontFamily:      'inherit',
                      fontSize:        '13px',
                      fontWeight:      active ? 800 : 600,
                      background:      active ? accent : 'var(--card)',
                      color:           active ? 'var(--surface)' : 'var(--ink3)',
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
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '4px' }}>Getting Started</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Three things to explore first</div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
                {[gettingStarted.staff, gettingStarted.brief, gettingStarted.course].filter(Boolean).length} / 3 done
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { key: 'staff', label: 'View your staff and their AI readiness scores', action: () => { setTab('people'); fetchStaffList(); markProgress('staff') }, tab: 'People' },
                { key: 'brief', label: 'Explore the Intelligence tab to see org-wide insights', action: () => { setTab('intelligence'); markProgress('brief') }, tab: 'Intelligence' },
                { key: 'course', label: 'Build your first course in Learning Lab', action: () => { setTab('suggest'); markProgress('course') }, tab: 'Learning Lab' },
              ].map(step => {
                const done = gettingStarted[step.key as keyof typeof gettingStarted]
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: done ? 'rgba(0,137,123,0.04)' : 'var(--card)', border: `1px solid ${done ? 'rgba(0,137,123,0.2)' : 'var(--border)'}`, borderRadius: '12px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: done ? 'rgba(0,137,123,0.12)' : 'var(--border)', border: `2px solid ${done ? 'var(--teal-mid)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {done
                        ? <svg width="10" height="10" fill="none" stroke="#0099B3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        : <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--ink4)' }} />
                      }
                    </div>
                    <div style={{ flex: 1, fontSize: '13px', color: done ? 'var(--ink)' : 'var(--ink3)', fontWeight: 600, textDecoration: done ? 'line-through' : 'none' }}>{step.label}</div>
                    {!done && (
                      <button onClick={step.action} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(0,165,163,0.3)', background: 'rgba(0,165,163,0.1)', color: 'var(--teal-mid)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
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
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: '4px solid var(--teal-mid)', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '12px' }}>Staff in System</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: 'var(--teal-mid)', lineHeight: 1 }}>{totalJoined}</span>
              <span style={{ fontSize: '13px', color: 'var(--ink2)', fontWeight: 700 }}>total</span>
            </div>
            <div style={{ height: '6px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ height: '100%', width: `${totalJoined > 0 ? Math.min(100, Math.round(profilesComplete / totalJoined * 100)) : 0}%`, background: 'var(--teal-mid)', borderRadius: '3px', transition: 'width 0.6s' }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>{totalJoined > 0 ? Math.round(profilesComplete / totalJoined * 100) : 0}% profiles complete · <span style={{ color: '#F5B94D' }}>{profilePending} pending</span></div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: '4px solid #7DC520', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '12px' }}>Profiles Complete</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: 'var(--teal)', lineHeight: 1 }}>{profilesComplete}</span>
              <span style={{ fontSize: '13px', color: 'var(--ink2)', fontWeight: 700 }}>/ {totalJoined}</span>
            </div>
            <div style={{ height: '6px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ height: '100%', width: `${totalJoined > 0 ? Math.round(profilesComplete / totalJoined * 100) : 0}%`, background: '#7DC520', borderRadius: '3px', transition: 'width 0.6s' }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>{totalJoined > 0 ? Math.round(profilesComplete / totalJoined * 100) : 0}% completion rate · {totalTasks} entries captured</div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `4px solid ${assessedAvg > 0 ? assessedTier.color : 'var(--ink3)'}`, borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>AI Readiness Score</div>
              <Link href="/docs" style={{ fontSize: '11px', color: 'var(--teal-mid)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                How it works
                <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: assessedAvg > 0 ? assessedTier.color : 'var(--ink4)', lineHeight: 1 }}>{assessedAvg > 0 ? assessedAvg : '—'}</span>
              {assessedAvg > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: assessedTier.color, lineHeight: 1.2 }}>{assessedTier.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink2)', fontWeight: 600, marginTop: '4px' }}>{assessedTier.desc}</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600, marginBottom: '6px' }}>
              {assessedAvg > 0 ? `Avg of ${profilesComplete} assessed · Target 60+ · out of 100` : 'No assessments completed yet'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ flex: 1, height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${participationPct}%`, background: participationPct >= 50 ? 'var(--teal-mid)' : participationPct >= 20 ? '#F5B94D' : 'var(--red)', borderRadius: '3px', transition: 'width 0.6s' }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: participationPct >= 50 ? 'var(--teal-mid)' : participationPct >= 20 ? '#F5B94D' : 'var(--red)', whiteSpace: 'nowrap' }}>{participationPct}% assessed</span>
            </div>
          </div>
        </div>




        {/* ══ AIRS — Org Score ══ */}
        {members.length > 0 && (
          <div style={{ marginBottom: '28px' }}>

            {/* Tier Summary Strip — who is where right now */}
            {(() => {
              const TIERS = [
                { label: 'AI-Forward', color: '#34D399', range: '75–100', desc: 'Building AI workflows' },
                { label: 'AI-Ready',   color: '#1296BA', range: '55–74',  desc: 'Using AI regularly' },
                { label: 'AI-Aware',   color: '#F5B94D', range: '35–54',  desc: 'Tried it, not a habit' },
                { label: 'AI-Curious', color: '#FB923C', range: '15–34',  desc: 'Knows AI exists' },
                { label: 'AI-Unaware', color: '#F1667A', range: '0–14',   desc: 'Needs foundations first' },
              ]
              const tierCounts: Record<string, number> = Object.fromEntries(TIERS.map(t => [t.label, 0]))
              members.filter(m => m.profile_complete).forEach(m => {
                const score = memberTairs[m.id]?.score ?? 0
                tierCounts[airsTier(score).label] = (tierCounts[airsTier(score).label] ?? 0) + 1
              })
              const total = profilesComplete || 1
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  {TIERS.map((t, i) => {
                    const count = tierCounts[t.label] ?? 0
                    const pct   = Math.round(count / total * 100)
                    return (
                      <div key={t.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `4px solid ${t.color}`, borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: '0 2px 8px rgba(15,25,35,0.05)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', color: t.color, textTransform: 'uppercase' }}>{t.range}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '36px', fontWeight: 900, color: count > 0 ? t.color : 'var(--ink4)', lineHeight: 1 }}>{count}</span>
                          {count > 0 && <span style={{ fontSize: '12px', color: 'var(--ink2)', fontWeight: 700 }}>{count === 1 ? 'person' : 'people'}</span>}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: count > 0 ? 'var(--ink)' : 'var(--ink3)' }}>{t.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.4, fontWeight: 600 }}>{t.desc}</div>
                        <div style={{ height: '4px', background: 'var(--surface)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
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
                  { id: 'all',          label: 'All',          color: '#7E93A1' },
                  { id: 'AI-Forward',   label: 'AI-Forward',   color: '#34D399' },
                  { id: 'AI-Ready',     label: 'AI-Ready',     color: '#1296BA' },
                  { id: 'AI-Aware',     label: 'AI-Aware',     color: '#F5B94D' },
                  { id: 'AI-Curious',   label: 'AI-Curious',   color: '#FB923C' },
                  { id: 'AI-Unaware',   label: 'AI-Unaware',   color: '#F1667A' },
                ]
                const PRIORITY_FILTERS = [
                  { id: 'Critical', color: '#F1667A' },
                  { id: 'High',     color: '#F1667A' },
                  { id: 'Medium',   color: '#F1667A' },
                ]
                const visibleDepts = sortedDeptAirs.filter(d => {
                  if (deptTierFilter === 'all') return true
                  // tier filter
                  const tierMatch = TIER_FILTERS.slice(1).some(f => f.id === deptTierFilter)
                  if (tierMatch) return airsTier(d.score).label === deptTierFilter
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
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                    {/* Header + filters */}
                    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Department Readiness</div>
                          <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>
                            {visibleDepts.length} of {sortedDeptAirs.length} departments
                            {deptTierFilter !== 'all' && <span style={{ color: 'var(--ink3)' }}> · filtered by <strong style={{ color: 'var(--ink)' }}>{deptTierFilter}</strong></span>}
                          </div>
                        </div>
                      </div>
                      {/* Tier filter pills */}
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {TIER_FILTERS.map(f => {
                          const active = deptTierFilter === f.id
                          const count  = f.id === 'all' ? sortedDeptAirs.length : sortedDeptAirs.filter(d => airsTier(d.score).label === f.id).length
                          return (
                            <button key={f.id} onClick={() => setDeptTierFilter(f.id)}
                              style={{ padding: '4px 10px', borderRadius: '16px', border: `1px solid ${active ? f.color : 'var(--border)'}`, background: active ? `${f.color}18` : 'transparent', color: active ? f.color : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                              {f.label}
                              {f.id !== 'all' && count > 0 && <span style={{ fontSize: '9px', opacity: 0.7 }}>{count}</span>}
                            </button>
                          )
                        })}
                        <div style={{ width: '1px', background: 'var(--border)', margin: '0 2px' }} />
                        {PRIORITY_FILTERS.map(f => {
                          const active = deptTierFilter === f.id
                          const count  = sortedDeptAirs.filter(d => d.impact.priority === f.id).length
                          if (count === 0) return null
                          return (
                            <button key={f.id} onClick={() => setDeptTierFilter(f.id)}
                              style={{ padding: '4px 10px', borderRadius: '16px', border: `1px solid ${active ? f.color : 'var(--border)'}`, background: active ? `${f.color}18` : 'transparent', color: active ? f.color : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                              {f.id}
                              <span style={{ fontSize: '9px', opacity: 0.7 }}>{count}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {visibleDepts.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>No departments match this filter</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {visibleDepts.map((d, i) => {
                          const tier        = airsTier(d.score)
                          const impact      = d.impact
                          const completePct = d.joined > 0 ? Math.round(d.interviewed / d.joined * 100) : 0
                          const isTop       = i === 0 && deptTierFilter === 'all'
                          return (
                            <div key={d.dept} style={{
                              borderBottom: i < visibleDepts.length - 1 ? '1px solid var(--surface)' : 'none',
                              background: isTop ? `${tier.color}05` : 'var(--card)',
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
                                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{d.dept}</span>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: tier.color, background: `${tier.color}15`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${tier.color}25`, whiteSpace: 'nowrap' }}>{tier.label}</span>
                                    <span style={{ fontSize: '11px', fontWeight: 800, color: impact.color, background: `${impact.color}12`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${impact.color}25`, whiteSpace: 'nowrap' }}>{impact.priority} Priority</span>
                                  </div>
                                  <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{d.joined} enrolled · {d.interviewed} assessed</div>
                                </div>
                                {/* Coverage */}
                                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '4px' }}>Coverage</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                                    <div style={{ width: '60px', height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${completePct}%`, background: completePct === 100 ? 'var(--teal-mid)' : tier.color, borderRadius: '3px' }} />
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: completePct === 100 ? 'var(--lime)' : 'var(--ink2)' }}>{completePct}%</span>
                                  </div>
                                </div>
                              </div>
                              {/* Action row */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingLeft: '64px' }}>
                                <svg width="13" height="13" fill="none" stroke={tier.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><polyline points="9 18 15 12 9 6"/></svg>
                                <span style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.55, fontWeight: 500 }}>{ACTIONS[tier.label] ?? '—'}</span>
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
                    const oData  = officeAirs.find(x => x.id === o.id)
                    const joined = officeMap[o.id]?.count ?? 0
                    const tier   = oData ? airsTier(oData.score) : null
                    return (
                      <div key={o.id} style={{ background: 'var(--card)', border: `1px solid ${o.color}25`, borderRadius: '16px', padding: '16px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: o.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{o.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '36px', fontWeight: 900, color: o.color, lineHeight: 1 }}>{joined}</span>
                          <span style={{ fontSize: '13px', color: 'var(--ink)', marginLeft: '4px' }}>staff</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{members.filter(m => m.office_id === o.id && m.profile_complete).length} profiles complete</span>
                          {tier && oData && (
                            <span style={{ fontSize: '13px', fontWeight: 800, color: tier.color }}>AIRS {oData.score}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* AI Champions */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '14px' }}>AI Champions</div>
                  {topIndividuals.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No interview data yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {topIndividuals.slice(0, 6).map((person, i) => {
                        const tier = airsTier(person.toars)
                        const off  = getOffice(person.office_id)
                        return (
                          <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: i < 3 ? `${tier.color}08` : 'transparent', borderRadius: '10px', border: i < 3 ? `1px solid ${tier.color}18` : '1px solid transparent' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', minWidth: '18px' }}>#{i+1}</span>
                            <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: `${off?.color ?? 'var(--teal-mid)'}20`, border: `1px solid ${off?.color ?? 'var(--teal-mid)'}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? 'var(--teal)' }}>{person.name.charAt(0)}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</div>
                              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{person.department ?? '—'}</div>
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
            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginRight: '4px', flexShrink: 0 }}>View by department:</span>
            {['all', ...DEPT_ORDER.filter(d => deptMap[d])].map(d => {
              const active = readinessDeptFilter === d
              const deptData = d !== 'all' ? deptMap[d] : null
              return (
                <button key={d} onClick={() => setReadinessDeptFilter(d)}
                  style={{ padding: '4px 12px', borderRadius: '16px', border: `1px solid ${active ? 'var(--teal)' : 'var(--border)'}`, background: active ? 'rgba(0,122,110,0.1)' : 'transparent', color: active ? 'var(--teal)' : 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}>
                  {d === 'all' ? 'All Departments' : d}
                  {deptData && <span style={{ fontSize: '13px', color: active ? 'var(--teal)' : 'var(--ink2)', fontWeight: 400 }}>({deptData.complete})</span>}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Readiness distribution */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Self-Reported Readiness</div>
                {readinessDeptFilter !== 'all' && (
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.25)', padding: '1px 7px', borderRadius: '10px' }}>{readinessDeptFilter}</div>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '20px' }}>
                {readinessDeptFilter === 'all' ? 'How staff describe their own AI usage in daily work' : `${deptReadinessList.length} interview${deptReadinessList.length !== 1 ? 's' : ''} from this department`}
              </div>
              {deptReadinessList.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No interview data{readinessDeptFilter !== 'all' ? ' for this department' : ' yet'}</div>
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
                            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{readinessLabels[n]}</span>
                            <span style={{ fontSize: '13px', color: count > 0 ? readinessColors[n-1] : 'var(--ink3)', fontWeight: 700 }}>{pct > 0 ? `${pct}%` : ''}</span>
                          </div>
                          <div style={{ height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: readinessColors[n-1], borderRadius: '3px', transition: 'width 0.4s' }} />
                          </div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: count > 0 ? readinessColors[n-1] : 'var(--border)', minWidth: '24px', textAlign: 'right' }}>{count}</div>
                      </div>
                    )
                  })}
                  <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--ink3)' }}>Avg readiness</span>
                    <span style={{ fontWeight: 800, color: readinessColors[Math.round(deptReadinessList.reduce((a,b)=>a+b,0)/deptReadinessList.length)-1] }}>
                      {(deptReadinessList.reduce((a,b)=>a+b,0)/deptReadinessList.length).toFixed(1)} / 5
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* Top tools */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Top Tools Used</div>
                {readinessDeptFilter !== 'all' && (
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.25)', padding: '1px 7px', borderRadius: '10px' }}>{readinessDeptFilter}</div>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '20px' }}>
                {readinessDeptFilter === 'all' ? "What the whole team actually uses" : `Tools mentioned by ${readinessDeptFilter} team`}
              </div>
              {topTools.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No interview data{readinessDeptFilter !== 'all' ? ' for this department' : ' yet'}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {topTools.map(([tool, count], i) => {
                    const pct      = Math.round(count / topTools[0][1] * 100)
                    const isAI     = AI_TOOLS.has(tool)
                    const isSaaS   = MODERN_SAAS.has(tool)
                    const barColor = isAI ? 'var(--lime)' : isSaaS ? 'var(--teal-mid)' : 'var(--ink3)'
                    const tagColor = isAI ? 'var(--lime)' : isSaaS ? 'var(--teal-mid)' : 'var(--ink3)'
                    return (
                      <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', minWidth: '18px' }}>#{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{tool}</span>
                            {isAI && <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--teal)', background: 'rgba(0,122,110,0.1)', padding: '1px 5px', borderRadius: '4px' }}>AI</span>}
                            {isSaaS && !isAI && <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--teal-mid)', background: 'rgba(0,165,163,0.12)', padding: '1px 5px', borderRadius: '4px' }}>SaaS</span>}
                          </div>
                          <div style={{ height: '4px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '3px', transition: 'width 0.4s' }} />
                          </div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: tagColor, minWidth: '22px', textAlign: 'right' }}>{count}</div>
                      </div>
                    )
                  })}
                  <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', gap: '14px', fontSize: '13px' }}>
                    <span style={{ color: 'var(--teal)' }}>■ AI tool</span>
                    <span style={{ color: 'var(--teal-mid)' }}>■ Modern SaaS</span>
                    <span style={{ color: 'var(--ink3)' }}>■ Basic / Other</span>
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
                <svg width="13" height="13" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search name, email, dept…"
                  style={{ width: '100%', paddingLeft: '34px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
              {([['all', 'All'], ['done', 'Assessed'], ['pending', 'Pending']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setInterviewFilter(val)}
                  style={{ padding: '5px 14px', borderRadius: '16px', border: `1px solid ${interviewFilter === val ? 'var(--teal-mid)' : 'var(--border)'}`, background: interviewFilter === val ? 'rgba(0,137,123,0.1)' : 'transparent', color: interviewFilter === val ? 'var(--teal)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {label}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--ink3)', fontWeight: 600 }}>
                {filteredMembers.length} of {members.length}
              </div>
            </div>
            {/* Row 2: Office + Dept pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* All Offices */}
              <button onClick={() => setOfficeFilter('all')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '10px', border: `1.5px solid ${officeFilter === 'all' ? 'var(--ink3)' : 'var(--border)'}`, background: officeFilter === 'all' ? '#5B708015' : 'var(--card)', color: officeFilter === 'all' ? 'var(--ink2)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                All Offices
              </button>
              {/* Per-office — colored dot + name, matching Overview style */}
              {OFFICES.map(o => {
                const active = officeFilter === o.id
                return (
                  <button key={o.id} onClick={() => setOfficeFilter(o.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px 5px 10px', borderRadius: '10px', border: `1.5px solid ${active ? o.color : 'var(--border)'}`, background: active ? `${o.color}18` : 'var(--card)', color: active ? o.color : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: active ? o.color : 'var(--ink4)', flexShrink: 0 }} />
                    {o.label}
                  </button>
                )
              })}
              <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />
              {['all', ...allDepts].map(d => (
                <button key={d} onClick={() => setDeptFilter(d)}
                  style={{ padding: '5px 12px', borderRadius: '10px', border: `1.5px solid ${deptFilter === d ? 'var(--teal)' : 'var(--border)'}`, background: deptFilter === d ? 'rgba(0,107,92,0.1)' : 'var(--card)', color: deptFilter === d ? 'var(--teal)' : 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                  {d === 'all' ? 'All Depts' : d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px 100px', gap: '0', padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
              {['Name', 'Office', 'Department', 'Interview', 'Joined'].map(h => (
                <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
              ))}
            </div>
            {[...filteredMembers].sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()).map((m, i, arr) => {
              const off = getOffice(m.office_id)
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px 100px', gap: '0', alignItems: 'center', padding: '11px 24px', borderBottom: i < arr.length - 1 ? '1px solid var(--surface)' : 'none' }}>
                  {/* Name + email */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, paddingRight: '12px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: `${off?.color ?? 'var(--teal-mid)'}18`, border: `1px solid ${off?.color ?? 'var(--teal-mid)'}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? 'var(--teal)' }}>{m.name.charAt(0)}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                    </div>
                  </div>
                  {/* Office */}
                  <div style={{ paddingRight: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: off?.color ?? 'var(--teal)' }}>{off?.label ?? '—'}</span>
                  </div>
                  {/* Department */}
                  <div style={{ paddingRight: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{m.department ?? '—'}</span>
                  </div>
                  {/* Interview status */}
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: m.profile_complete ? 'var(--lime)' : 'var(--ink3)', background: m.profile_complete ? 'rgba(61,107,0,0.1)' : 'var(--card)', padding: '3px 9px', borderRadius: '6px', border: `1px solid ${m.profile_complete ? 'rgba(61,107,0,0.25)' : 'var(--border)'}` }}>
                      {m.profile_complete ? 'Assessed' : 'Pending'}
                    </span>
                  </div>
                  {/* Date */}
                  <div style={{ fontSize: '13px', color: 'var(--ink3)', textAlign: 'right' }}>
                    {new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>
                      {new Date(m.joined_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredMembers.length === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>{members.length === 0 ? 'No staff have joined yet' : 'No results match the current filters'}</div>
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
                <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>{feedbackItems.length} submission{feedbackItems.length !== 1 ? 's' : ''} — what the team wants built next</div>
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
                  style={{ padding: '9px 20px', borderRadius: '10px', border: 'none', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, cursor: reportLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', opacity: reportLoading ? 0.7 : 1 }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {reportLoading ? 'Analysing...' : 'Generate AI Report'}
                </button>
              )}
            </div>

            {/* AI Report */}
            {reportError && <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: '10px', fontSize: '13px', color: 'var(--red)' }}>{reportError}</div>}

            {feedbackReport && (() => {
              const r = feedbackReport as {
                summary: string; total_submissions: number;
                top_themes: {theme:string;count:number;description:string}[];
                top_requests: {feature:string;priority:string;departments:string[];rationale:string}[];
                sentiment: {positive:number;constructive:number;critical:number;overview:string};
                recommended_build_order: {rank:number;item:string;reason:string}[];
                departments_most_engaged: string[];
              }
              const PRIORITY_COLOR: Record<string,string> = { high: '#F1667A', medium: '#F1667A', low: '#C0F43C' }
              return (
                <div style={{ background: 'rgba(164,120,255,0.06)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '12px' }}>AI Feedback Analysis</div>

                  {/* Summary */}
                  <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.7, margin: '0 0 20px', fontStyle: 'italic' }}>{r.summary}</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

                    {/* Top Themes */}
                    <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '12px' }}>Key Themes</div>
                      {r.top_themes?.map((t, i) => (
                        <div key={i} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{t.theme}</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF' }}>{t.count}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5 }}>{t.description}</div>
                        </div>
                      ))}
                    </div>

                    {/* Build Order */}
                    <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '12px' }}>Recommended Build Order</div>
                      {r.recommended_build_order?.map(b => (
                        <div key={b.rank} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, color: 'var(--purple-light)', flexShrink: 0 }}>{b.rank}</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '2px' }}>{b.item}</div>
                            <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5 }}>{b.reason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Requests */}
                  <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '12px' }}>Top Feature Requests</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {r.top_requests?.map((req, i) => (
                        <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: PRIORITY_COLOR[req.priority] ?? '#A478FF', background: `${PRIORITY_COLOR[req.priority] ?? '#A478FF'}15`, padding: '3px 8px', borderRadius: '6px', flexShrink: 0, marginTop: '1px' }}>{req.priority}</span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '2px' }}>{req.feature}</div>
                            <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5 }}>{req.rationale}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sentiment */}
                  <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '12px' }}>Sentiment Overview</div>
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
                      {[['Positive', r.sentiment?.positive, 'var(--lime)'], ['Constructive', r.sentiment?.constructive, 'var(--red)'], ['Critical', r.sentiment?.critical, 'var(--red)']].map(([label, val, color]) => (
                        <div key={label as string} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '36px', fontWeight: 900, color: color as string }}>{val}%</div>
                          <div style={{ fontSize: '13px', color: 'var(--ink)' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', fontStyle: 'italic' }}>{r.sentiment?.overview}</div>
                  </div>
                </div>
              )
            })()}

            {/* Raw submissions */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase' }}>All Submissions</div>
              </div>
              {feedbackItems.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: 'var(--ink)' }}>No feedback yet. The form appears at the bottom of every staff dashboard.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {feedbackItems.map((f, i) => (
                    <div key={f.id} style={{ padding: '14px 24px', borderBottom: i < feedbackItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '5px' }}>{f.message}</div>
                      <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
                        {f.name}{f.department ? ` · ${f.department}` : ''} · {new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Toolkit Banner (overview only) ── */}
        {tab === 'overview' && (
          <div style={{ marginBottom: '28px' }}>
            <Link href="/admin/toolkit"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-hi)', borderRadius: '16px', padding: '22px 28px', textDecoration: 'none', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(192,244,60,0.12)', border: '1px solid rgba(192,244,60,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" fill="none" stroke="var(--lime)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--lime)', marginBottom: '4px' }}>Internal Tools</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>The Toolkit</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>Website Builder · DRT · Outreach · Smart Data — authorised team members only</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--lime)', fontSize: '13px', fontWeight: 800, flexShrink: 0 }}>
                Open Toolkit
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </Link>
          </div>
        )}

        {/* ── People tab ── */}
        {tab === 'people' && (() => {
          const memberById: Record<string, Member> = Object.fromEntries(members.map(m => [m.id, m]))
          const LEVEL_LABEL: Record<string,string> = { super_admin:'Super Admin', office_head:'Office Head', dept_head:'Dept Head', team_lead:'Team Lead', staff:'Staff' }
          const LEVEL_COLOR: Record<string,string> = { super_admin:'#34D399', office_head:'#1296BA', dept_head:'#A78BFA', team_lead:'#F5B94D', staff:'#7E93A1' }

          const allPeople = staffList.map(s => {
            const member = memberById[s.id]
            return { ...s, access_enabled: (s as {access_enabled?:boolean}).access_enabled ?? false, profile_complete: member?.profile_complete ?? false, joined_at: member?.joined_at ?? null }
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
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(0,137,123,0.08)', border: '1px solid rgba(0,137,123,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>HRMS Sync</div>
                    {hrmsSyncState === 'done' && hrmsSyncResult ? (
                      <div style={{ fontSize: '12px', color: 'var(--success)', lineHeight: 1.4 }}>
                        {hrmsSyncResult.message}
                      </div>
                    ) : hrmsSyncState === 'error' ? (
                      <div style={{ fontSize: '12px', color: 'var(--red)', lineHeight: 1.4 }}>Sync failed — check console for details</div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.4 }}>Pull active staff from HRMS (trescon-resource-planner)</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={syncFromHRMS}
                    disabled={hrmsSyncState === 'loading'}
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: hrmsSyncState === 'loading' ? 'var(--border)' : 'var(--teal-mid)', color: hrmsSyncState === 'loading' ? 'var(--ink3)' : 'var(--teal-light)', fontSize: '13px', fontWeight: 800, cursor: hrmsSyncState === 'loading' ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                  >
                    {hrmsSyncState === 'loading' ? (
                      <>
                        <div style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--card)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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
                    { label: 'Total', value: staffList.length, color: 'var(--ink)' },
                    { label: 'Enabled', value: totalEnabled, color: 'var(--success)' },
                    { label: 'Active Profiles', value: totalProfileDone, color: '#1296BA' },
                    { label: 'Not Yet Enabled', value: totalNotEnabled, color: 'var(--ink3)' },
                  ].map(stat => (
                    <div key={stat.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                      <div style={{ fontSize: '10px', color: 'var(--ink3)', fontWeight: 700, marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{stat.label}</div>
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
                    style={{ padding: '6px 14px', borderRadius: '20px', border: `1.5px solid ${peopleFilter === key ? 'var(--teal-mid)' : 'var(--border)'}`, background: peopleFilter === key ? 'var(--teal-mid)' : 'var(--card)', color: peopleFilter === key ? 'var(--teal-light)' : 'var(--ink3)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {label}
                  </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <svg width="12" height="12" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder="Search name, email, department…"
                      style={{ paddingLeft: '30px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', width: '230px' }} />
                  </div>
                  <button onClick={fetchStaffList} disabled={staffLoading}
                    style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Refresh
                  </button>
                  <Link href="/admin/access-center" style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Access &amp; Permissions →
                  </Link>
                  {totalNotEnabled > 0 && (
                    <button onClick={async () => {
                      if (!confirm(`Enable platform access for all ${totalNotEnabled} staff? They will be able to log in immediately.`)) return
                      await fetch('/api/staff-access', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enable_all: true, enabled: true }) })
                      fetchStaffList()
                    }} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(52,211,153,0.3)', background: 'var(--success-light)', color: 'var(--success)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      Enable All ({totalNotEnabled})
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              {staffLoading ? (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '60px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>Loading staff records…</div>
              ) : staffList.length === 0 ? (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                  <svg width="36" height="36" fill="none" stroke="var(--ink4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ marginBottom: '16px' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>No staff records yet</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink3)', maxWidth: '340px', margin: '0 auto' }}>Staff records will appear here once your HRMS is connected and synced.</div>
                </div>
              ) : (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1fr 1.2fr 180px', padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Department / Role', 'Office', 'Level', 'Platform Status', ''].map(h => (
                      <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
                    ))}
                  </div>
                  {filtered.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>No staff match this filter.</div>
                  ) : filtered.map((p, idx) => {
                    const off        = getOffice(p.office_id ?? '')
                    const levelColor = LEVEL_COLOR[p.job_level] ?? '#7E93A1'
                    const levelLabel = LEVEL_LABEL[p.job_level] ?? p.job_level
                    let statusLabel: string, statusColor: string, statusBg: string
                    if (!p.access_enabled)   { statusLabel = 'Not Enabled';      statusColor = 'var(--ink3)'; statusBg = 'var(--border-light)' }
                    else if (!p.profile_complete) { statusLabel = 'Awaiting Profile'; statusColor = 'var(--amber)'; statusBg = 'var(--amber-light)' }
                    else                     { statusLabel = 'Active';           statusColor = 'var(--success)'; statusBg = 'var(--success-light)' }
                    return (
                      <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1fr 1.2fr 180px', alignItems: 'center', padding: '12px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid var(--surface)' : 'none' }}>
                        {/* Name + email */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: `${off?.color ?? 'var(--teal-mid)'}18`, border: `1px solid ${off?.color ?? 'var(--teal-mid)'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: off?.color ?? 'var(--teal-mid)' }}>{p.name.charAt(0)}</span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                          </div>
                        </div>
                        {/* Dept / Role */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.department ?? '—'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.role ?? '—'}</div>
                        </div>
                        {/* Office */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: off?.color ?? 'var(--ink4)', flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: off?.color ?? 'var(--ink3)' }}>{off?.label ?? '—'}</span>
                        </div>
                        {/* Level */}
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: levelColor, background: `${levelColor}15`, padding: '3px 8px', borderRadius: '6px' }}>{levelLabel}</span>
                        </div>
                        {/* Platform Status + Access Roles */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor, background: statusBg, padding: '3px 8px', borderRadius: '6px', width: 'fit-content' }}>{statusLabel}</span>
                          {p.joined_at && <div style={{ fontSize: '10px', color: 'var(--ink4)', fontWeight: 600 }}>Joined {new Date(p.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '1px' }}>
                            {(p.access_roles ?? ['standard']).map(r => {
                              const rc = ROLE_META[r] ?? ROLE_META.standard
                              return <span key={r} style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: rc.bg, color: rc.color, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{rc.label}</span>
                            })}
                          </div>
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button onClick={async () => {
                            await fetch('/api/staff-access', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, enabled: !p.access_enabled }) })
                            fetchStaffList()
                          }} style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${p.access_enabled ? 'var(--border)' : 'rgba(52,211,153,0.3)'}`, background: p.access_enabled ? 'var(--card)' : 'rgba(52,211,153,0.08)', color: p.access_enabled ? 'var(--ink3)' : 'var(--success)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            {p.access_enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => {
                            setRolesStaff(p)
                            setRolesEdit(p.access_roles ?? ['standard'])
                            setRolesOpen(true)
                          }} title="Edit access roles" style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            Roles
                          </button>
                          <button onClick={() => {
                            const grants: Record<string,boolean> = { ...(p.tool_grants ?? {}), smart_data: p.toolkit_access ?? false }
                            setPermStaff(p)
                            setPermGrants(grants)
                            setPermTab('person')
                            setBulkSel(new Set())
                            setBulkDone(null)
                            setPermOpen(true)
                          }} title="Manage tool permissions" style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer' }}>
                            {PLATFORM_TOOLS.map(tool => {
                              const g: Record<string,boolean> = { ...(p.tool_grants ?? {}), smart_data: p.toolkit_access ?? false }
                              const granted = p.job_level === 'super_admin' || (g[tool.key] ?? false)
                              return <div key={tool.key} style={{ width: '7px', height: '7px', borderRadius: '50%', background: granted ? tool.color : 'var(--border-light)', flexShrink: 0 }} />
                            })}
                          </button>
                          <Link href={`/dashboard?id=${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--teal-mid)', fontSize: '11px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                            View
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Live Now strip ───────────────────────────────────────── */}
              {activeUsers.length > 0 && (
                <div style={{ marginTop: '24px', background: 'linear-gradient(135deg, rgba(0,137,123,0.06) 0%, rgba(14,116,144,0.06) 100%)', border: '1px solid rgba(0,137,123,0.2)', borderRadius: '14px', padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--teal-mid)', boxShadow: '0 0 0 3px rgba(0,137,123,0.25)', animation: 'pulse 2s ease-in-out infinite' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0099B3', textTransform: 'uppercase', letterSpacing: '1px' }}>Live Now — {activeUsers.length} {activeUsers.length === 1 ? 'person' : 'people'} on the platform</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {activeUsers.map(u => {
                      const m   = u.staff_members
                      const off = getOffice(m.office_id ?? '')
                      const mins = Math.floor((Date.now() - new Date(u.last_seen_at).getTime()) / 60000)
                      return (
                        <div key={u.staff_id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px 6px 8px', borderRadius: '20px', background: 'var(--card)', border: '1px solid rgba(0,137,123,0.25)' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: `${off?.color ?? 'var(--teal-mid)'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: off?.color ?? 'var(--teal-mid)' }}>{m.name.charAt(0)}</span>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{m.name}</div>
                            <div style={{ fontSize: '10px', color: 'var(--ink3)' }}>{mins === 0 ? 'just now' : `${mins}m ago`}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Login Activity ───────────────────────────────────────── */}
              <div style={{ marginTop: '24px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(14,116,144,0.08)', border: '1px solid rgba(14,116,144,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" fill="none" stroke="#1296BA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Login Activity</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>
                        {(() => {
                          const enabled   = allPeople.filter(p => p.access_enabled)
                          const loggedIn  = enabled.filter(p => p.last_login_at)
                          const neverIn   = enabled.filter(p => !p.last_login_at)
                          return `${loggedIn.length} of ${enabled.length} enabled staff have logged in · ${neverIn.length} never logged in`
                        })()}
                      </div>
                    </div>
                  </div>
                  <button onClick={fetchActiveUsers} style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Refresh
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1.4fr 90px 80px', padding: '8px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Department / Role', 'Office', 'Last Login (Dubai)', 'Sessions', ''].map(h => (
                    <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
                  ))}
                </div>
                {(() => {
                  const activeSet = new Set(activeUsers.map(u => u.staff_id))
                  const loginRows = allPeople
                    .filter(p => p.access_enabled)
                    .sort((a, b) => {
                      // Live users first, then by last login desc, never-logged last
                      const aLive = activeSet.has(a.id) ? 1 : 0
                      const bLive = activeSet.has(b.id) ? 1 : 0
                      if (bLive !== aLive) return bLive - aLive
                      const aTime = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
                      const bTime = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
                      return bTime - aTime
                    })
                  const showRows = loginRows.slice(0, 50)
                  return (
                    <>
                      {showRows.map((p, idx) => {
                        const off      = getOffice(p.office_id ?? '')
                        const isLive   = activeSet.has(p.id)
                        const loginAt  = p.last_login_at
                        const loginStr = loginAt
                          ? new Date(loginAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })
                          : null
                        const count = loginCounts[p.id] ?? 0
                        return (
                          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1.4fr 90px 80px', alignItems: 'center', padding: '10px 20px', borderBottom: idx < showRows.length - 1 ? '1px solid var(--surface)' : 'none', background: isLive ? 'rgba(0,137,123,0.03)' : !loginAt ? 'rgba(220,38,38,0.02)' : 'transparent' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                              <div style={{ position: 'relative' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${off?.color ?? 'var(--teal-mid)'}18`, border: `1px solid ${off?.color ?? 'var(--teal-mid)'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: off?.color ?? 'var(--teal-mid)' }}>{p.name.charAt(0)}</span>
                                </div>
                                {isLive && <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--teal-mid)', border: '1.5px solid var(--card)' }} />}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                              </div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.department ?? '—'}</div>
                              <div style={{ fontSize: '11px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.role ?? '—'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: off?.color ?? 'var(--ink4)', flexShrink: 0 }} />
                              <span style={{ fontSize: '12px', fontWeight: 700, color: off?.color ?? 'var(--ink3)' }}>{off?.label ?? '—'}</span>
                            </div>
                            <div>
                              {isLive ? (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#0099B3', background: 'rgba(0,137,123,0.1)', padding: '2px 8px', borderRadius: '5px' }}>Live now</span>
                              ) : loginStr ? (
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1296BA' }}>{loginStr}</span>
                              ) : (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red)', background: 'rgba(220,38,38,0.08)', padding: '2px 8px', borderRadius: '5px' }}>Never</span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: count > 0 ? 700 : 400, color: count > 0 ? 'var(--ink)' : 'var(--ink4)' }}>
                              {count > 0 ? `${count}×` : '—'}
                            </div>
                            <div>
                              <button onClick={() => openLoginHistory({ id: p.id, name: p.name, email: p.email })}
                                style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                History
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {loginRows.length > 50 && (
                        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--surface)', fontSize: '12px', color: 'var(--ink3)', textAlign: 'center' }}>
                          Showing 50 of {loginRows.length} enabled staff
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

            </div>
          )
        })()}

        {/* ── Intelligence tab ── */}
        {tab === 'intelligence' && (() => {
          // Group tasks by person so each person gets one row
          const peopleWithTasks = filteredMembers
            .filter(m => m.profile_complete)
            .map(m => {
              const responses     = profileByStaff[m.id] ?? []
              const readinessTask = responses.find(t => t.ai_readiness != null)
              const aiProofEntry  = responses.find(t => t.ai_proof)
              const allTools      = [...new Set(responses.flatMap(t => t.tools_used ?? []))]
              const mainAnswer    = responses.find(t => t.task_description && t.task_description.trim().length > 20)
              const score         = memberTairs[m.id]?.score ?? 0
              const tier          = airsTier(score)
              const readiness     = readinessTask?.ai_readiness ?? null
              return { member: m, personTasks: responses, readinessTask, aiProofEntry, allTools, mainAnswer, score, tier, readiness }
            })
            .sort((a, b) => b.score - a.score)

          return (
            <div>
              {/* Header bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{peopleWithTasks.length}</span> assessed · sorted by AI Readiness Score (highest first) · click any row to read full answers
                </div>
                <Link href="/insights" style={{ background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '9px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Generate AI Insights
                </Link>
              </div>

              {/* Column headers */}
              {peopleWithTasks.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.6fr 80px 36px', gap: '0', padding: '7px 20px', marginBottom: '4px' }}>
                  {['Employee', 'Readiness', 'AI Score', 'Tools used', 'Track', ''].map(h => (
                    <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
                  ))}
                </div>
              )}

              {/* Person rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {peopleWithTasks.map(({ member: m, personTasks, aiProofEntry, allTools, mainAnswer, score, tier, readiness }) => {
                  const off    = getOffice(m.office_id)
                  const isOpen = expandedTask === m.id
                  const readinessColor = readiness ? readinessColors[readiness - 1] : 'var(--ink3)'

                  return (
                    <div key={m.id} style={{ background: isOpen ? 'rgba(0,165,163,0.05)' : 'var(--card)', border: `1px solid ${isOpen ? 'rgba(0,165,163,0.25)' : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden', transition: 'all 0.15s' }}>

                      {/* Row — always visible */}
                      <button
                        onClick={() => setExpandedTask(isOpen ? null : m.id)}
                        style={{ width: '100%', padding: '13px 20px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.6fr 80px 36px', gap: '0', alignItems: 'center', textAlign: 'left' }}
                      >
                        {/* Col 1: Employee */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, paddingRight: '12px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: `${off?.color ?? 'var(--teal-mid)'}18`, border: `1px solid ${off?.color ?? 'var(--teal-mid)'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? 'var(--teal)' }}>{m.name.charAt(0)}</span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '1px' }}>
                              <span style={{ color: off?.color ?? 'var(--teal)' }}>{off?.label}</span>
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
                                <span style={{ fontSize: '9px', color: 'var(--ink3)' }}>/5</span>
                              </div>
                              <div style={{ fontSize: '13px', color: readinessColor, lineHeight: 1.3 }}>{readinessLabels[readiness]}</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>—</span>
                          )}
                        </div>

                        {/* Col 3: AIRS individual score */}
                        <div style={{ paddingRight: '12px' }}>
                          {score > 0 ? (
                            <div>
                              <span style={{ fontSize: '36px', fontWeight: 900, color: tier.color, lineHeight: 1 }}>{score}</span>
                              <div style={{ fontSize: '9px', fontWeight: 700, color: tier.color, marginTop: '2px' }}>{tier.label}</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>—</span>
                          )}
                        </div>

                        {/* Col 4: Top tools */}
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', paddingRight: '12px' }}>
                          {allTools.slice(0, 4).map((tool, j) => {
                            const isAI = AI_TOOLS.has(tool)
                            return (
                              <span key={j} style={{ fontSize: '13px', color: isAI ? 'var(--lime)' : 'var(--ink3)', background: isAI ? 'rgba(192,244,60,0.1)' : 'var(--border)', padding: '2px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>{tool}</span>
                            )
                          })}
                          {allTools.length > 4 && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>+{allTools.length - 4}</span>}
                        </div>

                        {/* Col 5: Track badge */}
                        <div>
                          {aiProofEntry?.ai_proof ? (
                            <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--teal)', background: 'rgba(0,122,110,0.1)', border: '1px solid rgba(192,244,60,0.25)', padding: '3px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>Advanced</span>
                          ) : (
                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--card)', padding: '3px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>Standard</span>
                          )}
                        </div>

                        {/* Col 6: Chevron */}
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <svg width="14" height="14" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </div>
                      </button>

                      {/* Expanded: all their task answers */}
                      {isOpen && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '20px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {personTasks.map((t, ti) => {
                              const hasContent = t.task_description || t.ai_proof || ((t.tools_used?.length ?? 0) > 0)
                              if (!hasContent) return null
                              const detection = t.task_description ? detectAIWriting(t.task_description) : { score: 0, flags: [], verdict: '' }
                              const flagColor = detection.score >= 65 ? '#F1667A' : detection.score >= 45 ? '#F1667A' : detection.score >= 25 ? '#F1667A' : '#12C9BD'
                              return (
                                <div key={ti} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                                  {/* Task label */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>
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
                                          <span style={{ fontSize: '9px', color: 'var(--ink3)' }}>{detection.score}/100</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Answer text */}
                                  {t.task_description && (
                                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: (t.ai_proof || (t.tools_used?.length ?? 0) > 0) ? '12px' : '0' }}>
                                      {t.task_description}
                                    </div>
                                  )}

                                  {/* AI Proof */}
                                  {t.ai_proof && (
                                    <div style={{ background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.18)', borderRadius: '8px', padding: '12px 14px', marginBottom: (t.tools_used?.length ?? 0) > 0 ? '10px' : '0' }}>
                                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '6px' }}>Advanced Track — Workflow Proof</div>
                                      <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.ai_proof}</div>
                                    </div>
                                  )}

                                  {/* Tools */}
                                  {(t.tools_used?.length ?? 0) > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: t.task_description || t.ai_proof ? '10px' : '0' }}>
                                      {(t.tools_used ?? []).map((tool, j) => (
                                        <span key={j} style={{ fontSize: '13px', color: AI_TOOLS.has(tool) ? 'var(--lime)' : 'var(--teal-mid)', background: AI_TOOLS.has(tool) ? 'rgba(192,244,60,0.1)' : 'rgba(0,165,163,0.12)', border: `1px solid ${AI_TOOLS.has(tool) ? 'rgba(192,244,60,0.2)' : 'rgba(0,165,163,0.2)'}`, padding: '2px 9px', borderRadius: '5px' }}>{tool}</span>
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
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '48px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>
                    No interview data yet{officeFilter !== 'all' || deptFilter !== 'all' ? ' for this filter' : ''}.
                  </div>
                )}
              </div>

              {/* Live Department Action Matrix */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '3px' }}>Department Action Matrix — Live</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Each department mapped to its current tier and the recommended action to take now. Updates as more staff complete interviews.</div>
                </div>
                {sortedDeptAirs.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>No interview data yet. Seed demo data or wait for staff to complete interviews.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--card)' }}>
                          {['Department', 'AIRS', 'Tier', 'People', 'Coverage', 'AI Priority', 'AI Action', 'Owner', 'By'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ink3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDeptAirs.map((d, i) => {
                          const tier    = airsTier(d.score)
                          const play    = PLAYBOOK_TIERS.find(p => p.tier === tier.label) ?? PLAYBOOK_TIERS[4]
                          const impact  = d.impact
                          const covPct  = d.joined > 0 ? Math.round(d.interviewed / d.joined * 100) : 0
                          return (
                            <tr key={d.dept} style={{ borderBottom: i < sortedDeptAirs.length - 1 ? '1px solid var(--surface)' : 'none', background: i === 0 ? `${tier.color}04` : 'transparent' }}>
                              <td style={{ padding: '13px 14px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{d.dept}</div>
                              </td>
                              <td style={{ padding: '13px 14px', textAlign: 'center' }}>
                                <span style={{ fontSize: '13px', fontWeight: 900, color: tier.color }}>{d.score}</span>
                              </td>
                              <td style={{ padding: '13px 10px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: tier.color, background: `${tier.color}15`, padding: '2px 7px', borderRadius: '5px', border: `1px solid ${tier.color}25` }}>{tier.label}</span>
                              </td>
                              <td style={{ padding: '13px 14px', fontSize: '13px', color: 'var(--ink3)', textAlign: 'center' }}>{d.joined}</td>
                              <td style={{ padding: '13px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <div style={{ width: '44px', height: '4px', background: 'var(--surface)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${covPct}%`, background: covPct === 100 ? 'var(--lime)' : 'var(--teal-mid)', borderRadius: '2px' }} />
                                  </div>
                                  <span style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700 }}>{covPct}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '13px 10px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: impact.color, background: `${impact.color}15`, padding: '2px 7px', borderRadius: '5px' }}>{impact.priority}</span>
                              </td>
                              <td style={{ padding: '13px 14px', fontSize: '13px', color: 'var(--ink)', fontWeight: 600, maxWidth: '200px', lineHeight: 1.5 }}>{play.action}</td>
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
            </div>
          )
        })()}


        {/* ── Learning tab ── */}
        {tab === 'learning' && (() => {
          if (learningLoading) return (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--teal-mid)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
              <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading learning data…</div>
            </div>
          )
          if (!learningData) return (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>
              No learning data yet. Staff need to complete courses first.
            </div>
          )

          const { completions, courses, staff: ldStaff, attempts, never_started, participation_by_dept } = learningData
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

          const TIER_COLOR: Record<string, string> = { foundation: '#F1667A', adoption: '#0EA79D', advanced: '#C0F43C' }

          return (
            <div>
              {/* Summary strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
                {[
                  { label: 'Courses Available',   value: courses.length,         sub: 'in library',          accent: 'var(--teal-mid)' },
                  { label: 'Total Completions',    value: totalPassed,            sub: 'passes recorded',     accent: '#7DC520' },
                  { label: 'This Week',            value: completionsThisWeek,    sub: 'completed',           accent: '#AF70E3' },
                  { label: 'Avg Passing Score',    value: avgScore ? `${avgScore}%` : '—', sub: 'across all passes', accent: '#F5B94D' },
                  { label: 'Active Learners',      value: activeStaff,            sub: 'attempted a course',  accent: 'var(--red)' },
                ].map(({ label, value, sub, accent }) => (
                  <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `4px solid ${accent}`, borderRadius: '14px', padding: '20px', boxShadow: '0 2px 8px rgba(15,25,35,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '10px' }}>{label}</div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: accent, marginBottom: '4px', lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>{sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '20px' }}>

                {/* Course completion table */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                  <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Course Performance</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>Completions and avg score per course</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 48px 56px', padding: '8px 20px', borderBottom: '1px solid var(--border)', gap: '8px' }}>
                    {['Course', 'Track', 'Done', 'Avg'].map(h => (
                      <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
                    ))}
                  </div>
                  {courseStats.map((c, i) => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 48px 56px', padding: '12px 20px', borderBottom: i < courseStats.length - 1 ? '1px solid var(--surface)' : 'none', gap: '8px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{c.title}</div>
                        {c.is_mandatory && <div style={{ fontSize: '13px', color: 'var(--red)', marginTop: '2px' }}>Mandatory</div>}
                      </div>
                      <div><span style={{ fontSize: '13px', fontWeight: 700, color: TIER_COLOR[c.tier_level] ?? '#0EA79D', background: `${TIER_COLOR[c.tier_level] ?? '#0EA79D'}15`, padding: '2px 7px', borderRadius: '5px', textTransform: 'capitalize' }}>{c.tier_level}</span></div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: c.completions > 0 ? 'var(--ink)' : 'var(--border)' }}>{c.completions}</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: c.avgScore ? (c.avgScore >= 80 ? 'var(--lime)' : c.avgScore >= 70 ? 'var(--teal)' : 'var(--red)') : 'var(--border)' }}>{c.avgScore ? `${c.avgScore}%` : '—'}</div>
                    </div>
                  ))}
                  {courseStats.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>No courses yet. Seed courses first.</div>
                  )}
                </div>

                {/* Right column: Dept stats + Top learners */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                  {/* Dept completion */}
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>By Department</div>
                    </div>
                    {deptStatsList.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink)', fontSize: '13px' }}>No completions yet</div>
                    ) : (
                      deptStatsList.map((d, i) => (
                        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px', borderBottom: i < deptStatsList.length - 1 ? '1px solid var(--surface)' : 'none' }}>
                          <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{d.name}</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', minWidth: '24px', textAlign: 'right' }}>{d.completed}</div>
                          <div style={{ fontSize: '13px', color: d.avgScore >= 80 ? 'var(--lime)' : 'var(--teal)', fontWeight: 700, minWidth: '40px', textAlign: 'right' }}>{d.avgScore}%</div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Top learners */}
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Top Learners</div>
                    </div>
                    {topLearners.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink)', fontSize: '13px' }}>No completions yet</div>
                    ) : (
                      topLearners.map((l, i) => (
                        <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 36px 44px', alignItems: 'center', gap: '10px', padding: '10px 18px', borderBottom: i < topLearners.length - 1 ? '1px solid var(--surface)' : 'none' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: i < 3 ? 'var(--lime)' : 'var(--ink3)' }}>#{i + 1}</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{l.name}</div>
                            <div style={{ fontSize: '13px', color: 'var(--ink)' }}>{l.dept}</div>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', textAlign: 'right' }}>{l.completed}</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: l.avgScore >= 80 ? 'var(--lime)' : 'var(--teal)', textAlign: 'right' }}>{l.avgScore}%</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Pass rate strip */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 22px', display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '4px' }}>Overall Pass Rate</div>
                  <div style={{ fontSize: '36px', fontWeight: 900, color: passRate >= 70 ? 'var(--lime)' : passRate >= 50 ? 'var(--red)' : 'var(--red)' }}>{passRate}%</div>
                </div>
                <div style={{ flex: 1, maxWidth: '400px' }}>
                  <div style={{ height: '8px', background: 'var(--surface)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${passRate}%`, background: passRate >= 70 ? '#7DC520' : passRate >= 50 ? 'var(--red)' : 'var(--red)', borderRadius: '4px', transition: 'width 0.6s' }} />
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '5px' }}>{totalPassed} passes out of {totalAttempts} total attempts</div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                  Target: 70%+ pass rate across all courses.<br/>Below 70% on any course = content or prompt difficulty issue.
                </div>
              </div>

              {/* ── Participation section ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

                {/* Department participation rates */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Participation by Department</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>% of staff who have attempted at least one course</div>
                  </div>
                  {(participation_by_dept ?? []).length === 0 ? (
                    <div style={{ padding: '28px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>No data yet</div>
                  ) : (
                    (participation_by_dept ?? []).map((d, i) => {
                      const rate = d.total > 0 ? Math.round((d.active / d.total) * 100) : 0
                      return (
                        <div key={d.dept} style={{ padding: '12px 20px', borderBottom: i < (participation_by_dept ?? []).length - 1 ? '1px solid var(--surface)' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{d.dept}</div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: rate >= 70 ? 'var(--lime)' : rate >= 40 ? '#F5B94D' : 'var(--red)' }}>{rate}% <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>({d.active}/{d.total})</span></div>
                          </div>
                          <div style={{ height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${rate}%`, background: rate >= 70 ? '#7DC520' : rate >= 40 ? 'var(--amber)' : 'var(--red)', borderRadius: '3px', transition: 'width 0.5s' }} />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Never-started summary */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Never Started</div>
                      <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>Staff who have not attempted any course</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: (never_started ?? []).length > 0 ? 'var(--red)' : 'var(--lime)' }}>{(never_started ?? []).length}</div>
                  </div>
                  {(never_started ?? []).length === 0 ? (
                    <div style={{ padding: '28px', textAlign: 'center', color: 'var(--lime)', fontSize: '13px', fontWeight: 600 }}>All active staff have started at least one course.</div>
                  ) : (
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {(never_started ?? []).slice(0, 25).map((s, i) => (
                        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: i < Math.min((never_started ?? []).length, 25) - 1 ? '1px solid var(--surface)' : 'none' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{s.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{s.role ?? '—'} · {s.department ?? '—'}</div>
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber)', background: 'var(--amber-light)', padding: '3px 8px', borderRadius: '5px', whiteSpace: 'nowrap' }}>{s.office_id}</div>
                        </div>
                      ))}
                      {(never_started ?? []).length > 25 && (
                        <div style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--ink3)', textAlign: 'center' }}>+{(never_started ?? []).length - 25} more staff not shown</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Assign a Course ── */}
              <div style={{ marginTop: '16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--info)', marginBottom: '4px' }}>Course Assignment</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Assign a course to staff</div>
                  </div>
                  <svg width="18" height="18" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </div>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Course</label>
                    <select value={assignCourseId} onChange={e => setAssignCourseId(e.target.value)}
                      style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border-light)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }}>
                      <option value="">Select a course…</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.title} ({c.tier_level})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Assign to</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['dept', 'individual', 'all'] as const).map(t => (
                        <button key={t} onClick={() => setAssignTarget(t)}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${assignTarget === t ? 'var(--info)' : 'var(--border)'}`, background: assignTarget === t ? 'rgba(21,101,192,0.08)' : 'var(--border-light)', color: assignTarget === t ? 'var(--info)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {t === 'dept' ? 'Department' : t === 'individual' ? 'Individual' : 'All Staff'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {assignTarget === 'dept' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Department</label>
                      <select value={assignCourseDept} onChange={e => setAssignCourseDept(e.target.value)}
                        style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border-light)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }}>
                        <option value="">Select department…</option>
                        {Array.from(new Set(ldStaff.map(s => s.department).filter(Boolean))).sort().map(d => (
                          <option key={d} value={d!}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {assignTarget === 'individual' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Staff Member</label>
                      <select value={assignCourseStaff} onChange={e => setAssignCourseStaff(e.target.value)}
                        style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border-light)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }}>
                        <option value="">Select staff member…</option>
                        {ldStaff.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                          <option key={s.id} value={s.id}>{s.name} — {s.department ?? '—'} ({s.role})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {assignTarget === 'all' && (
                    <div style={{ padding: '12px 16px', background: 'rgba(21,101,192,0.05)', border: '1px solid rgba(21,101,192,0.15)', borderRadius: '10px', fontSize: '13px', color: 'var(--info)' }}>
                      This will assign the course to all {ldStaff.length} active staff members.
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Due Date (optional)</label>
                    <input type="date" value={assignDueDate} onChange={e => setAssignDueDate(e.target.value)}
                      style={{ padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border-light)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button
                      disabled={assigning || !assignCourseId || (assignTarget === 'dept' && !assignCourseDept) || (assignTarget === 'individual' && !assignCourseStaff)}
                      onClick={async () => {
                        if (!assignCourseId) return
                        setAssigning(true); setAssignMsg(null)
                        try {
                          let targets: string[] = []
                          if (assignTarget === 'all') {
                            targets = ldStaff.map(s => s.id)
                          } else if (assignTarget === 'dept') {
                            targets = ldStaff.filter(s => s.department === assignCourseDept).map(s => s.id)
                          } else {
                            targets = assignCourseStaff ? [assignCourseStaff] : []
                          }
                          if (targets.length === 0) { setAssignMsg({ text: 'No staff found for selection.', ok: false }); setAssigning(false); return }
                          const bulk = targets.map(sid => ({ staff_id: sid, course_id: assignCourseId, due_date: assignDueDate || undefined, assigned_by: 'admin' }))
                          const res = await fetch('/api/hr/course-assignments', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bulk }),
                          })
                          const data = await res.json()
                          if (res.ok) {
                            setAssignMsg({ text: `Assigned to ${data.assigned} staff member${data.assigned !== 1 ? 's' : ''}. They will see it in their dashboard.`, ok: true })
                            setAssignCourseId(''); setAssignCourseDept(''); setAssignCourseStaff(''); setAssignDueDate('')
                          } else {
                            setAssignMsg({ text: data.error ?? 'Assignment failed.', ok: false })
                          }
                        } finally { setAssigning(false) }
                      }}
                      style={{ padding: '11px 24px', borderRadius: '10px', border: 'none', background: assigning || !assignCourseId ? 'var(--border)' : 'var(--info)', color: assigning || !assignCourseId ? 'var(--ink3)' : 'var(--info-light)', fontSize: '13px', fontWeight: 800, cursor: assigning || !assignCourseId ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {assigning ? 'Assigning…' : 'Assign Course'}
                    </button>
                    {assignMsg && (
                      <div style={{ fontSize: '13px', color: assignMsg.ok ? 'var(--lime)' : 'var(--red)', fontWeight: 600 }}>{assignMsg.text}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Suggest a Course tab ── */}
        {tab === 'suggest' && (
          <div style={{ maxWidth: '720px' }}>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '6px' }}>Learning Lab</div>
              <h2 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>Build a Course</h2>
              <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: 0, lineHeight: 1.6 }}>Describe the gap you have spotted. Gemini will design a full course — overview, tasks, and 10 quiz questions — ready to review and publish. The person who suggested it gets credited on the course card and receives a notification on their dashboard when it goes live.</p>
            </div>

            {/* Input panel */}
            {(suggestState === 'idle' || suggestState === 'thinking') && (
              <div style={{ background: 'rgba(164,120,255,0.06)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '16px', padding: '28px' }}>
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Your Suggestion</label>
                  <textarea
                    value={suggestion}
                    onChange={e => setSuggestion(e.target.value)}
                    placeholder="e.g. Create a course for the Events team on using AI to build run-of-show documents and vendor briefing packs"
                    rows={4}
                    disabled={suggestState === 'thinking'}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(164,120,255,0.25)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', resize: 'vertical', opacity: suggestState === 'thinking' ? 0.6 : 1 }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Department</label>
                    <select value={suggestDept} onChange={e => setSuggestDept(e.target.value)} disabled={suggestState === 'thinking'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      {['Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations', 'IT', 'HR & Recruitment', 'Content & Design', 'Government Relations', 'DemandifyMedia', 'Leadership'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Tier Level</label>
                    <select value={suggestTier} onChange={e => setSuggestTier(e.target.value as 'foundation' | 'adoption' | 'advanced')} disabled={suggestState === 'thinking'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      <option value="foundation">Foundation — AI basics for this role</option>
                      <option value="adoption">Adoption — Intermediate workflows</option>
                      <option value="advanced">Advanced — Strategy and leadership</option>
                    </select>
                  </div>
                </div>
                {/* Credit to field */}
                <div style={{ marginBottom: '22px', background: 'rgba(164,120,255,0.05)', border: '1px solid rgba(164,120,255,0.15)', borderRadius: '12px', padding: '16px 18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '12px' }}>Course Credit</div>
                  <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 12px', lineHeight: 1.55 }}>
                    Who identified this gap and requested this course? They will be credited on the course card and notified on their dashboard when it goes live.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Full Name</label>
                      <input
                        value={creditName}
                        onChange={e => setCreditName(e.target.value)}
                        placeholder="e.g. Priya Menon"
                        disabled={suggestState === 'thinking'}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Role / Department</label>
                      <input
                        value={creditRole}
                        onChange={e => setCreditRole(e.target.value)}
                        placeholder="e.g. Head of Events"
                        disabled={suggestState === 'thinking'}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>

                <button onClick={submitSuggestion} disabled={!suggestion.trim() || suggestState === 'thinking'}
                  style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: suggestion.trim() && suggestState !== 'thinking' ? 'var(--purple)' : 'var(--border)', color: suggestion.trim() && suggestState !== 'thinking' ? 'var(--purple-light)' : 'var(--ink)', fontSize: '13px', fontWeight: 800, cursor: suggestion.trim() && suggestState !== 'thinking' ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                  <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                    I have received your suggestion for a <strong style={{ color: 'var(--ink)' }}>{suggestTier}</strong> course for the <strong style={{ color: 'var(--ink)' }}>{suggestDept}</strong> team. I am preparing a course just right — with full reading content, personalised tasks, and a 10-question bank. Sending it for your approval shortly...
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
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                      Your course is ready for review. I have built a complete <strong style={{ color: 'var(--ink)' }}>{suggestTier}</strong> course for <strong style={{ color: 'var(--ink)' }}>{suggestDept}</strong> with full reading content, 4 personalised task steps, and a 10-question bank. Review it below — edit anything you like — then approve to publish.
                    </div>
                  </div>
                </div>

                {/* Course preview */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>{(generatedCourse.tier_level as string)} · {suggestDept}</div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--ink)', marginBottom: '4px' }}>{generatedCourse.title as string}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{generatedCourse.subtitle as string}</div>
                  </div>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>Overview</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.7 }}>{generatedCourse.overview as string}</div>
                  </div>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>Task Steps ({(generatedCourse.task_steps as unknown[]).length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(generatedCourse.task_steps as Array<{step: number; instruction: string; tip: string}>).map((ts) => (
                        <div key={ts.step} style={{ padding: '12px 16px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF', marginBottom: '4px' }}>Step {ts.step}</div>
                          <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.55 }}>{ts.instruction}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: '20px 24px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                      Question Bank ({(generatedCourse.question_bank as unknown[]).length} questions · 5 served randomly per attempt)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(generatedCourse.question_bank as Array<{question: string; correct_index: number; options: string[]}>).map((q, i) => (
                        <div key={i} style={{ padding: '12px 16px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600, marginBottom: '4px' }}>Q{i + 1}: {q.question}</div>
                          <div style={{ fontSize: '13px', color: 'var(--teal)' }}>Correct: {q.options[q.correct_index]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Credit preview */}
                {creditName && (
                  <div style={{ padding: '12px 16px', background: 'rgba(164,120,255,0.07)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '10px', fontSize: '13px', color: 'var(--ink3)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(164,120,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF' }}>{creditName.charAt(0)}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink3)' }}>Suggested by </span>
                      <strong style={{ color: 'var(--ink)' }}>{creditName}</strong>
                      {creditRole && <span style={{ color: 'var(--ink3)' }}> · {creditRole}</span>}
                      <span style={{ color: 'var(--ink)', fontSize: '13px', display: 'block', marginTop: '1px' }}>Will be credited on the course card. Email notification sent on publish.</span>
                    </div>
                  </div>
                )}

                {publishMsg && (
                  <div style={{ padding: '12px 16px', background: publishMsg.includes('live') ? 'rgba(192,244,60,0.1)' : 'rgba(255,107,107,0.1)', border: `1px solid ${publishMsg.includes('live') ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: '10px', fontSize: '13px', color: publishMsg.includes('live') ? 'var(--lime)' : 'var(--red)', fontWeight: 700, marginBottom: '16px' }}>
                    {publishMsg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={submitForReview} disabled={suggestState === 'publishing'}
                    style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', opacity: suggestState === 'publishing' ? 0.7 : 1 }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                    {suggestState === 'publishing' ? 'Submitting...' : 'Submit for Review'}
                  </button>
                  <button onClick={() => { setSuggestState('idle'); setGeneratedCourse(null); setPublishMsg('') }}
                    style={{ padding: '13px 20px', borderRadius: '12px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Start Over
                  </button>
                </div>
              </div>
            )}

            {/* ── Dept Course Seeding ── */}
            <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid var(--surface)' }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '6px' }}>Dept Seeding</div>
                <h3 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>Seed Department Courses</h3>
                <p style={{ fontSize: '15px', color: 'var(--ink3)', margin: 0, lineHeight: 1.6 }}>Generate multiple draft courses for a specific department in one go. Pilot AI builds them from Trescon context — saved as drafts for your review before publishing.</p>
              </div>

              <div style={{ background: 'rgba(0,165,163,0.05)', border: '1px solid rgba(0,165,163,0.18)', borderRadius: '16px', padding: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '14px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Department</label>
                    <select value={deptSeedDept} onChange={e => setDeptSeedDept(e.target.value)} disabled={deptSeedState === 'generating'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      {['Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations', 'HR', 'Content & Design', 'Data & Intelligence', 'Leadership'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Tier Level</label>
                    <select value={deptSeedTier} onChange={e => setDeptSeedTier(e.target.value as 'foundation' | 'adoption' | 'advanced')} disabled={deptSeedState === 'generating'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      <option value="foundation">Foundation</option>
                      <option value="adoption">Adoption</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Count</label>
                    <select value={deptSeedCount} onChange={e => setDeptSeedCount(Number(e.target.value))} disabled={deptSeedState === 'generating'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </div>
                </div>

                <button
                  disabled={deptSeedState === 'generating'}
                  onClick={async () => {
                    setDeptSeedState('generating')
                    setDeptSeedResult(null)
                    try {
                      const res = await fetch('/api/generate-dept-courses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ department: deptSeedDept, tier_level: deptSeedTier, count: deptSeedCount }),
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
                      setDeptSeedResult({ courses: data.courses, errors: data.errors })
                      setDeptSeedState('done')
                    } catch (err) {
                      setDeptSeedResult({ courses: [], errors: [String(err)] })
                      setDeptSeedState('error')
                    }
                  }}
                  style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: deptSeedState === 'generating' ? 'var(--border)' : 'var(--teal-mid)', color: deptSeedState === 'generating' ? 'var(--ink3)' : 'var(--teal-light)', fontSize: '13px', fontWeight: 800, cursor: deptSeedState === 'generating' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {deptSeedState === 'generating' ? `Generating ${deptSeedCount} course${deptSeedCount > 1 ? 's' : ''}...` : `Generate ${deptSeedCount} Draft Course${deptSeedCount > 1 ? 's' : ''}`}
                </button>
              </div>

              {(deptSeedState === 'done' || deptSeedState === 'error') && deptSeedResult && (
                <div style={{ marginTop: '16px' }}>
                  {deptSeedResult.courses.length > 0 && (
                    <div style={{ background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.3)', borderRadius: '12px', padding: '16px 18px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--lime)', marginBottom: '10px' }}>{deptSeedResult.courses.length} draft course{deptSeedResult.courses.length > 1 ? 's' : ''} saved — ready for review in the Review Queue</div>
                      {deptSeedResult.courses.map(c => (
                        <div key={c.id} style={{ fontSize: '13px', color: 'var(--ink3)', padding: '6px 0', borderTop: '1px solid rgba(192,244,60,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal-mid)', flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{c.title}</span>
                          <span style={{ color: 'var(--ink4)' }}>·</span>
                          <span style={{ textTransform: 'capitalize' }}>{c.tier_level}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {deptSeedResult.errors && deptSeedResult.errors.length > 0 && (
                    <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '12px', padding: '14px 16px', fontSize: '13px', color: 'var(--red)' }}>
                      {deptSeedResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                  <button onClick={() => { setDeptSeedState('idle'); setDeptSeedResult(null) }}
                    style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Generate More
                  </button>
                </div>
              )}
            </div>
          </div>
        )}


        {/* ── Events tab ── */}
        {tab === 'events' && (() => {
          const TYPE_COLOR: Record<string,string> = { conference:'#12C9BD', summit:'#A78BFA', forum:'#5AA9F2', awards:'#F5B94D', workshop:'#34D399', flagship:'#F1667A', managed:'#8882DA', bespoke:'#E0670B', corporate:'#F2F6F8', others:'#6B8296', other:'#F2F6F8' }
          // Matches the Staff Portal's own Status field 1:1 (Planning /
          // Active / On Hold / Completed / Cancelled) — segregation below
          // is by this, never by event_date/end_date (2026-08-13, Madhu:
          // "it should not pick up any date from staff portal").
          const STATUS_CFG: Record<string,{color:string;bg:string}> = {
            planning:  { color:'#7E93A1',  bg: 'rgba(255,255,255,0.08)' },
            active:    { color:'var(--lime)',  bg: 'rgba(192,244,60,0.15)'  },
            on_hold:   { color:'#F5B94D',  bg: 'rgba(245,185,77,0.15)' },
            completed: { color:'#12C9BD',  bg: 'rgba(18,201,189,0.14)' },
            cancelled: { color:'#F1667A',  bg: 'rgba(241,102,122,0.14)' },
          }
          const IN_PROGRESS_ORDER = ['active', 'planning', 'on_hold'] as const
          const CLOSED_STATUSES = new Set(['completed', 'cancelled'])

          const fmt = (n: number, cur = 'USD') => {
            const abs = Math.abs(n)
            const str = abs >= 1000000 ? `${(abs/1000000).toFixed(1)}M` : abs >= 1000 ? `${(abs/1000).toFixed(0)}K` : `${abs.toLocaleString()}`
            return `${n < 0 ? '-' : ''}${cur === 'INR' ? '₹' : '$'}${str}`
          }

          // 2026-08-16: search by name/city/client, applied before the
          // in-progress/closed split so both view counts reflect it.
          const searchQ = eventSearch.trim().toLowerCase()
          const searchedEvents = !searchQ ? events : events.filter(e =>
            e.name.toLowerCase().includes(searchQ) ||
            (e.city ?? '').toLowerCase().includes(searchQ) ||
            (e.client_name ?? '').toLowerCase().includes(searchQ)
          )

          // "In progress" = anything not yet Completed/Cancelled (covers
          // Planning/Active/On Hold plus any other status value this
          // event happens to carry, e.g. the RACI phase-flow statuses).
          const inProgress = searchedEvents
            .filter(e => !CLOSED_STATUSES.has(e.status))
            .sort((a,b) => IN_PROGRESS_ORDER.indexOf(a.status as typeof IN_PROGRESS_ORDER[number]) - IN_PROGRESS_ORDER.indexOf(b.status as typeof IN_PROGRESS_ORDER[number]))
          const closed = searchedEvents
            .filter(e => CLOSED_STATUSES.has(e.status))
            .sort((a,b) => a.name.localeCompare(b.name))

          const totalStaff = events.reduce((s,e) => s + ((e.event_staff as {count:number}[]|null)?.[0]?.count ?? 0), 0)

          const createForm = (
            <div style={{ background: 'var(--card)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--teal-mid)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>New Event</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                {[
                  { label: 'Event Name', key: 'name', placeholder: 'World AI Show Dubai 2026', full: true },
                  { label: 'Client / Partner', key: 'client_name', placeholder: 'UAE Ministry of AI', full: false },
                  { label: 'City', key: 'city', placeholder: 'Dubai', full: false },
                  { label: 'Venue', key: 'venue', placeholder: 'Dubai World Trade Centre', full: false },
                ].map(f => (
                  <div key={f.key} style={f.full ? { gridColumn: '1/-1' } : {}}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>{f.label}</label>
                    <input value={eventForm[f.key as keyof typeof eventForm]} onChange={e => setEventForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Type</label>
                  <select value={eventForm.type} onChange={e => setEventForm(p => ({ ...p, type: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                    {['conference','summit','forum','awards','workshop','other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Start Date</label>
                  <input type="date" value={eventForm.event_date} onChange={e => setEventForm(p => ({ ...p, event_date: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>End Date</label>
                  <input type="date" value={eventForm.end_date} onChange={e => setEventForm(p => ({ ...p, end_date: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>
              <textarea value={eventForm.description} onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of this event…" rows={2}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'none', marginBottom: '12px' }} />
              {eventMsg && <div style={{ fontSize: '13px', color: eventMsg.includes('created') ? 'var(--lime)' : 'var(--red)', marginBottom: '10px' }}>{eventMsg}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={async () => { await createEvent(); if (events.length > 0) setShowCreateEvent(false) }} disabled={eventSaving}
                  style={{ padding: '10px 22px', borderRadius: '9px', border: 'none', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: eventSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: eventSaving ? 0.6 : 1 }}>
                  {eventSaving ? 'Creating…' : 'Create Event'}
                </button>
                {events.length > 0 && (
                  <button onClick={() => setShowCreateEvent(false)}
                    style={{ padding: '10px 18px', borderRadius: '9px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                )}
              </div>
            </div>
          )

          // ── Intelligence signals ────────────────────────────────────────────
          // Status-based only — no date math (see the note on EventRow above).
          // "Needs attention" replaces the old date-threshold version: an
          // Active event (Staff Portal already says it's underway) with no
          // staff or no checklist is the signal, no day-count needed.
          const needsAttnEvents = inProgress.filter(ev => {
            if (ev.status !== 'active') return false
            const staff = (ev.event_staff as {count:number}[]|null)?.[0]?.count ?? 0
            const tasks = (ev.event_checklist as {count:number}[]|null)?.[0]?.count ?? 0
            return staff === 0 || tasks === 0
          })
          const onHoldCount = inProgress.filter(ev => ev.status === 'on_hold').length
          const executionRate = events.length > 0 ? Math.round((closed.filter(e=>e.status==='completed').length / events.length) * 100) : 0

          return (
            <div>
              {/* ── Intelligence header ── */}
              {events.length > 0 && (
                <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                    <div style={{ background: needsAttnEvents.length > 0 ? 'rgba(217,119,6,0.05)' : 'rgba(61,107,0,0.05)', border: `1px solid ${needsAttnEvents.length > 0 ? 'rgba(217,119,6,0.3)' : 'rgba(61,107,0,0.2)'}`, borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: needsAttnEvents.length > 0 ? 'var(--amber)' : 'var(--lime)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Needs attention</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: needsAttnEvents.length > 0 ? '#F5B94D' : 'var(--lime)', lineHeight: 1 }}>{needsAttnEvents.length}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '4px' }}>{needsAttnEvents.length === 0 ? 'All active events staffed' : 'active events with gaps'}</div>
                    </div>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>On hold</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#F5B94D', lineHeight: 1 }}>{onHoldCount}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '4px' }}>paused per Staff Portal</div>
                    </div>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Staff deployed</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--ink)', lineHeight: 1 }}>{totalStaff}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '4px' }}>across active events</div>
                    </div>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Execution rate</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: executionRate < 30 ? 'var(--red)' : executionRate < 60 ? '#F5B94D' : 'var(--lime)', lineHeight: 1 }}>{executionRate}%</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '4px' }}>{closed.filter(e=>e.status==='completed').length} of {events.length} events completed</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading */}
              {eventsLoading && <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', fontSize: '13px' }}>Loading events…</div>}

              {/* Empty state */}
              {!eventsLoading && events.length === 0 && (
                <div style={{ maxWidth: '520px', margin: '0 auto' }}>{createForm}</div>
              )}

              {/* Populated */}
              {!eventsLoading && events.length > 0 && (
                <>
                  {/* ── View switcher + New Event ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    {(['inprogress','closed'] as const).map(v => (
                      <button key={v} onClick={() => {
                        setEventView(v)
                        if (v === 'closed' && Object.keys(eventSummaries).length === 0) fetchEventSummaries()
                      }}
                        style={{ padding: '8px 18px', borderRadius: '8px', border: `1px solid ${eventView===v ? 'var(--teal-mid)' : 'var(--border)'}`, background: eventView===v ? 'var(--teal-mid)' : 'var(--card)', color: eventView===v ? 'var(--teal-light)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {v === 'inprogress' ? `Planning, Active & On Hold (${inProgress.length})` : `Completed & Cancelled (${closed.length})`}
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <div style={{ position: 'relative' }}>
                      <svg width="12" height="12" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input value={eventSearch} onChange={e => setEventSearch(e.target.value)} placeholder="Search events…"
                        style={{ paddingLeft: '30px', paddingRight: eventSearch ? '28px' : '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', width: '220px' }} />
                      {eventSearch && (
                        <button onClick={() => setEventSearch('')} title="Clear search"
                          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                    <button onClick={() => setShowCreateEvent(s => !s)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: showCreateEvent ? 'var(--border)' : 'var(--teal-mid)', color: showCreateEvent ? 'var(--ink3)' : 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {showCreateEvent ? 'Cancel' : '+ New Event'}
                    </button>
                  </div>
                  {searchQ && inProgress.length === 0 && closed.length === 0 && (
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '24px 0', textAlign: 'center' }}>No events match &quot;{eventSearch}&quot;.</div>
                  )}

                  {showCreateEvent && <div style={{ marginBottom: '24px' }}>{createForm}</div>}

                  {/* ══ IN PROGRESS — GROUPED BY STAFF PORTAL STATUS ══ */}
                  {eventView === 'inprogress' && (() => {
                    // Compute per-event signals — status-based only, no date math.
                    const annotated = inProgress.map(ev => {
                      const staffCount = (ev.event_staff    as {count:number}[]|null)?.[0]?.count ?? 0
                      const taskCount  = (ev.event_checklist as {count:number}[]|null)?.[0]?.count ?? 0
                      const s          = eventSummaries[ev.id]
                      const taskDone   = s?.task_done ?? 0
                      const taskTotal  = s?.task_total ?? taskCount
                      const taskPct    = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0
                      // Only Active events get gap alerts — Planning/On Hold
                      // haven't necessarily started staffing/checklists yet.
                      const alerts: string[] = []
                      if (ev.status === 'active' && staffCount === 0) alerts.push('No staff assigned')
                      if (ev.status === 'active' && taskTotal === 0) alerts.push('No checklist yet')
                      return { ev, staffCount, taskTotal, taskDone, taskPct, alerts, s }
                    })

                    const STATUS_GROUP_LABEL: Record<string, string> = { active: 'Active', planning: 'Planning', on_hold: 'On Hold' }
                    const groups = [
                      ...IN_PROGRESS_ORDER.map(st => ({ key: st, label: STATUS_GROUP_LABEL[st], color: STATUS_CFG[st].color, items: annotated.filter(x => x.ev.status === st) })),
                      // Any other status value this event happens to carry (e.g. RACI phase-flow statuses) — shown rather than silently dropped.
                      { key: 'other', label: 'Other', color: '#7E93A1', items: annotated.filter(x => !IN_PROGRESS_ORDER.includes(x.ev.status as typeof IN_PROGRESS_ORDER[number])) },
                    ]

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        {inProgress.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>No events in Planning, Active, or On Hold.</div>}
                        {groups.map(grp => grp.items.length === 0 ? null : (
                          <div key={grp.key}>
                            {/* Group header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: grp.color, flexShrink: 0 }} />
                              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: grp.color }}>{grp.label}</div>
                              <div style={{ flex: 1, height: '1px', background: 'var(--surface)' }} />
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)' }}>{grp.items.length} event{grp.items.length !== 1 ? 's' : ''}</div>
                            </div>
                            {/* Cards grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
                              {grp.items.map(({ ev, staffCount, taskTotal, taskDone, taskPct, alerts, s }) => {
                                const sc = STATUS_CFG[ev.status] ?? STATUS_CFG.planning
                                const tc = TYPE_COLOR[ev.type]   ?? '#7E93A1'
                                const borderColor = alerts.length > 0 ? 'rgba(217,119,6,0.3)' : 'var(--border)'
                                return (
                                  <div key={ev.id} style={{ background: 'var(--card)', border: `1px solid ${borderColor}`, borderLeft: `4px solid ${sc.color}`, borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Alert pills */}
                                    {alerts.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {alerts.map((a, ai) => (
                                          <span key={ai} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid var(--amber-border)' }}>⚠ {a}</span>
                                        ))}
                                      </div>
                                    )}
                                    {/* Name + public dates, if set */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>{ev.name}</div>
                                      {ev.public_dates_display && (
                                        <div style={{ fontSize: '11px', color: 'var(--ink3)', whiteSpace: 'nowrap', flexShrink: 0, textAlign: 'right' }}>{ev.public_dates_display}</div>
                                      )}
                                    </div>
                                    {/* Meta row */}
                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: `${tc}18`, color: tc, textTransform: 'capitalize' }}>{ev.type}</span>
                                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>{ev.status.replace('_', ' ')}</span>
                                      {ev.city && <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>{ev.city}</span>}
                                      {ev.client_name && <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>· {ev.client_name}</span>}
                                    </div>
                                    {/* Staff + tasks */}
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }}>
                                        <svg width="12" height="12" fill="none" stroke={staffCount === 0 ? '#F5B94D' : 'var(--ink3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: staffCount === 0 ? '#F5B94D' : 'var(--ink2)' }}>{staffCount || '—'}</span>
                                        <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>staff</span>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        {taskTotal > 0 ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                            <div style={{ flex: 1, height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                                              <div style={{ height: '100%', width: `${taskPct}%`, background: taskPct >= 80 ? 'var(--lime)' : taskPct >= 40 ? '#F5B94D' : 'var(--red)', borderRadius: '3px' }} />
                                            </div>
                                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{taskDone}/{taskTotal}</span>
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>No checklist</span>
                                        )}
                                      </div>
                                    </div>
                                    {/* Revenue if available */}
                                    {s?.confirmed_revenue ? (
                                      <div style={{ fontSize: '11px', color: 'var(--lime)', fontWeight: 700 }}>{fmt(s.confirmed_revenue, s.currency)} confirmed revenue</div>
                                    ) : null}
                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '5px', paddingTop: '2px' }}>
                                      <Link href={`/admin/events/${ev.id}`} style={{ flex: 1, textAlign: 'center', padding: '7px 8px', borderRadius: '7px', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>Workspace</Link>
                                      <Link href={`/admin/events/${ev.id}/plan`} style={{ padding: '7px 9px', borderRadius: '7px', border: '1px solid rgba(192,244,60,0.5)', background: 'rgba(192,244,60,0.07)', color: 'var(--lime)', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>Plan</Link>
                                      <Link href={`/admin/events/${ev.id}/execution`} style={{ padding: '7px 9px', borderRadius: '7px', border: '1px solid var(--purple-border)', background: 'var(--purple-light)', color: 'var(--purple)', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>RACI</Link>
                                      <button onClick={() => { setSelectedEvent(ev === selectedEvent ? null : ev); if (ev !== selectedEvent) { fetchEventStaff(ev.id); fetchEventSummaries() } }}
                                        style={{ padding: '7px 9px', borderRadius: '7px', border: `1px solid ${selectedEvent?.id===ev.id ? 'rgba(0,165,163,0.4)' : 'var(--border)'}`, background: selectedEvent?.id===ev.id ? 'rgba(0,165,163,0.08)' : 'transparent', color: selectedEvent?.id===ev.id ? 'var(--teal)' : 'var(--ink3)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        Staff
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* ══ COMPLETED & CANCELLED — P&L VIEW ══ */}
                  {eventView === 'closed' && (
                    summariesLoading
                      ? <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', fontSize: '13px' }}>Loading P&L data…</div>
                      : (() => {
                          const pastGroups = [
                            { key: 'completed', label: 'Completed', color: 'var(--lime)', items: closed.filter(e => e.status === 'completed') },
                            { key: 'cancelled', label: 'Cancelled', color: 'var(--red)',  items: closed.filter(e => e.status === 'cancelled') },
                          ]
                          return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                          {closed.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink3)', fontSize: '13px' }}>No completed or cancelled events yet.</div>}
                          {pastGroups.map(grp => grp.items.length === 0 ? null : (
                            <div key={grp.key}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: grp.color, flexShrink: 0 }} />
                                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: grp.color }}>{grp.label}</div>
                                <div style={{ flex: 1, height: '1px', background: 'var(--surface)' }} />
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)' }}>{grp.items.length} event{grp.items.length !== 1 ? 's' : ''}</div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px' }}>
                          {grp.items.map(ev => {
                            const s          = eventSummaries[ev.id]
                            const netPnl     = s ? s.net_pnl : null
                            const missing: string[] = []
                            if (!s?.has_budget)   missing.push('approved budget')
                            if (!s?.has_revenue)  missing.push('deal revenue')
                            if (!s?.has_expenses) missing.push('expense records')
                            const hasAny = s && (s.has_budget || s.has_revenue || s.has_expenses)
                            return (
                              <div key={ev.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                                <div style={{ height: '3px', background: ev.status==='cancelled' ? 'var(--red)' : netPnl !== null && netPnl >= 0 ? 'var(--lime)' : netPnl !== null ? 'var(--red)' : 'var(--border)' }} />
                                <div style={{ padding: '16px 18px' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3, marginBottom: '3px' }}>{ev.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '14px' }}>
                                    {ev.public_dates_display ? `${ev.public_dates_display} · ` : ''}
                                    {ev.city ? `${ev.city} · ` : ''}
                                    <span style={{ textTransform: 'capitalize', color: ev.status==='completed' ? 'var(--teal-mid)' : 'var(--red)', fontWeight: 700 }}>{ev.status}</span>
                                  </div>

                                  {hasAny ? (
                                    <>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                        <div style={{ padding: '10px 12px', background: 'var(--border-light)', borderRadius: '8px' }}>
                                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Revenue</div>
                                          <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--lime)' }}>{s.has_revenue ? fmt(s.confirmed_revenue, s.currency) : <span style={{ color: 'var(--ink4)' }}>—</span>}</div>
                                          {s.pending_revenue > 0 && <div style={{ fontSize: '10px', color: 'var(--amber)', marginTop: '2px' }}>+{fmt(s.pending_revenue, s.currency)} pending</div>}
                                        </div>
                                        <div style={{ padding: '10px 12px', background: 'var(--border-light)', borderRadius: '8px' }}>
                                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Expenses</div>
                                          <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--ink)' }}>{s.has_expenses ? fmt(s.total_expenses, s.currency) : <span style={{ color: 'var(--ink4)' }}>—</span>}</div>
                                          {s.has_budget && <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '2px' }}>Budget: {fmt(s.approved_budget, s.currency)}</div>}
                                        </div>
                                      </div>
                                      {netPnl !== null && s.has_revenue && s.has_expenses && (
                                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: netPnl >= 0 ? 'rgba(61,107,0,0.07)' : 'rgba(255,107,107,0.07)', border: `1px solid ${netPnl >= 0 ? 'rgba(61,107,0,0.18)' : 'rgba(255,107,107,0.18)'}`, marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net P&L</span>
                                          <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '15px', fontWeight: 900, color: netPnl >= 0 ? 'var(--lime)' : 'var(--red)' }}>{netPnl >= 0 ? '+' : ''}{fmt(netPnl, s.currency)}</div>
                                            {s.margin_pct !== null && <div style={{ fontSize: '10px', fontWeight: 700, color: netPnl >= 0 ? 'var(--lime)' : 'var(--red)' }}>{s.margin_pct.toFixed(1)}% margin</div>}
                                          </div>
                                        </div>
                                      )}
                                      {missing.length > 0 && (
                                        <div style={{ fontSize: '11px', color: 'var(--amber)', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '7px', padding: '8px 10px', marginBottom: '10px', lineHeight: 1.5 }}>
                                          Partial P&L — missing {missing.join(', ')}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div style={{ padding: '13px 14px', background: 'var(--border-light)', borderRadius: '10px', border: '1px dashed var(--border)', marginBottom: '10px' }}>
                                      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>P&L unavailable</div>
                                      <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.5 }}>I can give you a complete overview once the budget, deal revenue, and expenses are added in the workspace.</div>
                                    </div>
                                  )}

                                  <Link href={`/admin/events/${ev.id}`} style={{ display: 'block', textAlign: 'center', padding: '7px', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--teal-mid)', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                                    Open Workspace
                                  </Link>
                                </div>
                              </div>
                            )
                          })}
                              </div>
                            </div>
                          ))}
                        </div>
                          )
                        })()
                  )}

                  {/* ── Staff assignment panel ── */}
                  {selectedEvent && (
                    <div style={{ marginTop: '20px', background: 'var(--card)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '20px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal-mid)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>Staff on {selectedEvent.name}</div>
                      {eventStaff.length === 0
                        ? <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '14px' }}>No staff assigned yet.</div>
                        : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '8px', marginBottom: '14px' }}>
                            {eventStaff.map(es => (
                              <div key={es.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{es.staff_members?.name}</div>
                                  <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{es.role || es.staff_members?.department}</div>
                                </div>
                                <button onClick={() => removeEventStaff(es.staff_members?.id)}
                                  style={{ fontSize: '12px', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>Remove</button>
                              </div>
                            ))}
                          </div>
                        )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select value={assignStaffId} onChange={e => setAssignStaffId(e.target.value)}
                          style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="">Select staff…</option>
                          {staffList.map(s => <option key={s.id} value={s.id}>{s.name} — {s.department}</option>)}
                        </select>
                        <input value={assignRole} onChange={e => setAssignRole(e.target.value)} placeholder="Role (optional)"
                          style={{ width: '130px', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }} />
                        <button onClick={assignStaff}
                          style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}

        {/* ── Review Queue tab (super admin only) ── */}
        {tab === 'review' && isSuperAdmin && (
          <div>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--red)', marginBottom: '6px' }}>Review Queue</div>
              <h2 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>Courses Pending Approval</h2>
              <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: 0, lineHeight: 1.6 }}>These courses were generated via Learning Lab and are waiting for your review. Approve to publish them to the library, or reject to remove them.</p>
            </div>

            {reviewMsg && (
              <div style={{ marginBottom: '20px', padding: '12px 16px', background: reviewMsg.includes('approved') ? 'rgba(192,244,60,0.08)' : 'rgba(0,165,163,0.08)', border: `1px solid ${reviewMsg.includes('approved') ? 'rgba(192,244,60,0.25)' : 'rgba(0,165,163,0.25)'}`, borderRadius: '10px', fontSize: '13px', color: reviewMsg.includes('approved') ? 'var(--lime)' : 'var(--teal-mid)', fontWeight: 600 }}>
                {reviewMsg}
              </div>
            )}

            {draftsLoading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink)', fontSize: '13px' }}>Loading drafts...</div>
            ) : draftCourses.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No courses pending review. When someone submits a course via Learning Lab it will appear here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {draftCourses.map(course => {
                  const TIER_COLOR: Record<string, string> = { foundation: '#0EA79D', adoption: '#C0F43C', advanced: '#A478FF' }
                  const tierColor = TIER_COLOR[course.tier_level] ?? '#0EA79D'
                  const isExpanded = expandedDraftId === course.id
                  return (
                    <div key={course.id} style={{ background: 'var(--card)', border: '1px solid rgba(255,107,107,0.15)', borderRadius: '16px', overflow: 'hidden' }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 20px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: tierColor, background: `${tierColor}15`, padding: '2px 8px', borderRadius: '5px', textTransform: 'capitalize' }}>{course.tier_level}</span>
                            {course.dept_tags?.map(d => (
                              <span key={d} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '5px' }}>{d}</span>
                            ))}
                            <span style={{ fontSize: '13px', color: 'rgba(255,107,107,0.8)', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>Pending Review</span>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>{course.title}</div>
                          <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>{course.subtitle}</div>
                          {course.suggested_by_name && (
                            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>Suggested by {course.suggested_by_name}{course.suggested_by_role ? ` · ${course.suggested_by_role}` : ''}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                          <button onClick={() => setExpandedDraftId(isExpanded ? null : course.id)}
                            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {isExpanded ? 'Collapse' : 'Preview'}
                          </button>
                          <button onClick={() => rejectCourse(course.id)}
                            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--red-border)', background: 'var(--red-light)', color: 'var(--red)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Reject
                          </button>
                          <button onClick={() => approveCourse(course.id)}
                            style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            Approve & Publish
                          </button>
                        </div>
                      </div>
                      {/* Expanded preview */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '20px', background: 'var(--card)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Overview</div>
                          <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.7, margin: 0 }}>{course.overview}</p>
                          <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--ink)' }}>{course.estimated_minutes} min · {course.is_mandatory ? 'Mandatory' : 'Optional'}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Security Tab (super admin only) ── */}
        {tab === 'security' && isSuperAdmin && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#6285EA', marginBottom: '4px' }}>Security</div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.4px' }}>Login Audit &amp; Access Control</div>
              </div>
              <button onClick={fetchSecurity} style={{ padding: '8px 18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: '#6285EA', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.82"/></svg>
                Refresh
              </button>
            </div>

            {securityLoading && (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink3)', fontSize: '13px' }}>Loading security data…</div>
            )}

            {!securityLoading && !securityData && (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink3)', fontSize: '13px' }}>Click Refresh to load security data.</div>
            )}

            {securityData && (
              <>
                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                  {[
                    { label: 'Logins Today',    value: securityData.today_logins,   color: '#34D399', bg: 'rgba(52,211,153,0.08)' },
                    { label: 'Failed Today',     value: securityData.today_failures, color: '#F1667A', bg: 'rgba(241,102,122,0.08)' },
                    { label: 'Locked Right Now', value: securityData.locked_now.length, color: '#F5B94D', bg: 'rgba(245,185,77,0.08)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: '14px', padding: '20px 24px' }}>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: s.color, letterSpacing: '-1px' }}>{s.value}</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: s.color, marginTop: '4px', opacity: 0.8 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Locked accounts */}
                {securityData.locked_now.length > 0 && (
                  <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '14px', padding: '20px 24px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--red)', marginBottom: '12px' }}>Locked Now (5+ failures in last 15 min)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {securityData.locked_now.map(email => (
                        <span key={email} style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '8px', padding: '4px 12px', fontSize: '13px', fontWeight: 700, color: 'var(--red)' }}>{email}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Login activity feed */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="14" height="14" fill="none" stroke="#6285EA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Recent Login Activity</div>
                    <span style={{ fontSize: '11px', color: 'var(--ink3)', marginLeft: 'auto' }}>Last {securityData.recent.length} attempts</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: 'var(--border-light)' }}>
                          {['Time', 'Email', 'IP Address', 'Result', 'Reason'].map(h => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {securityData.recent.map(row => {
                          const t = new Date(row.attempted_at)
                          const timeStr = t.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                          const REASON_LABEL: Record<string, string> = {
                            ok: 'Login OK', super_admin_ok: 'Admin Login', wrong_password: 'Wrong Password',
                            not_found: 'Email Not Found', account_disabled: 'Account Disabled',
                            rate_limited: 'Rate Limited', ip_blocked: 'IP Blocked',
                          }
                          return (
                            <tr key={row.id} style={{ borderBottom: '1px solid var(--surface)' }}>
                              <td style={{ padding: '10px 16px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{timeStr}</td>
                              <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email}</td>
                              <td style={{ padding: '10px 16px', color: 'var(--ink3)', fontFamily: 'monospace', fontSize: '12px' }}>{row.ip ?? '—'}</td>
                              <td style={{ padding: '10px 16px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: row.success ? 'var(--success-light)' : 'var(--red-light)', color: row.success ? 'var(--success)' : 'var(--red)' }}>
                                  {row.success ? 'Success' : 'Failed'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 16px', color: 'var(--ink3)' }}>{REASON_LABEL[row.reason ?? ''] ?? row.reason ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* IP Allowlist config note */}
                <div style={{ marginTop: '24px', background: 'rgba(29,78,216,0.04)', border: '1px solid rgba(29,78,216,0.15)', borderRadius: '14px', padding: '20px 24px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6285EA', marginBottom: '8px' }}>IP Allowlist</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.7 }}>
                    To restrict staff logins to office networks only, add the <strong>OFFICE_IPS</strong> environment variable in Vercel with a comma-separated list of your office public IPs.<br/>
                    Example: <span style={{ fontFamily: 'monospace', background: 'var(--surface)', padding: '1px 6px', borderRadius: '4px', fontSize: '12px' }}>203.0.113.10,198.51.100.42</span><br/>
                    Admins (dept_head and above) are always exempt from IP restrictions.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes demoGlow{0%{color:#F1667A}20%{color:#F1667A}40%{color:var(--lime)}60%{color:#12C9BD}80%{color:#F1667A}100%{color:#F5B94D}} @keyframes tourPop{0%{opacity:0;transform:scale(0.95) translateY(6px)}100%{opacity:1;transform:scale(1) translateY(0)}} @keyframes slideInRight{0%{transform:translateX(100%);opacity:0}100%{transform:translateX(0);opacity:1}} @keyframes ingestBarSlide{0%{left:-40%}100%{left:100%}}`}</style>

      {/* ── What's Next — Roadmap Panel ── */}
      {showRoadmap && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex' }}>
          {/* Backdrop */}
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowRoadmap(false)} />

          {/* Drawer */}
          <div style={{ width: '560px', background: 'var(--card)', borderLeft: '1px solid rgba(164,120,255,0.25)', height: '100%', overflowY: 'auto', animation: 'slideInRight 0.25s ease', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '4px' }}>Platform Roadmap</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.3px' }}>What&apos;s next for Event Pilot</div>
                </div>
                <button onClick={() => setShowRoadmap(false)} style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" fill="none" stroke="var(--ink3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

              {/* ── Build Log — live from GitHub commits ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <svg width="14" height="14" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--info)' }}>Build Log — what shipped &amp; when</div>
                  <div style={{ fontSize: '10px', color: 'var(--ink4)', fontWeight: 600 }}>live · auto-updates on every commit</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {buildLog.length === 0 && (
                    <div style={{ fontSize: '13px', color: 'var(--ink4)', padding: '8px 0' }}>Loading build log…</div>
                  )}
                  {buildLog.map((day, di) => {
                    const isMadhu     = day.author === 'Madhu'
                    const badgeColor  = isMadhu ? 'var(--teal)' : 'var(--info)'
                    const badgeBg     = isMadhu ? 'rgba(0,105,92,0.08)' : 'rgba(21,101,192,0.08)'
                    const badgeBorder = isMadhu ? 'rgba(0,105,92,0.2)'  : 'rgba(21,101,192,0.2)'
                    return (
                      <div key={di}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0 6px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: badgeColor, background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: '6px', padding: '2px 8px', whiteSpace: 'nowrap' as const }}>
                            {day.date}{day.time ? ` · ${day.time}` : ''} — {day.author}
                          </div>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '4px' }}>
                          {day.items.map((item, ii) => (
                            <div key={ii}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: isMadhu ? 'rgba(14,167,157,0.4)' : 'var(--info)', marginTop: '6px', flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600, lineHeight: 1.4 }}>{item.title}</span>
                              </div>
                              {item.bullets.length > 0 && (
                                <div style={{ paddingLeft: '13px', marginTop: '3px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {item.bullets.map((b, bi) => (
                                    <div key={bi} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                      <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--card-hi)', marginTop: '7px', flexShrink: 0 }} />
                                      <span style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.5 }}>{b}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── What's live ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--lime)' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--teal)' }}>Live now</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    'Staff Review System — floating "Report Issue" button on every page. Staff report bugs by tool, type, severity and can attach a screenshot. Admin triages at /admin/reviews with status tracking, notes, and screenshot preview',
                    'Auto Build Log — What\'s Next panel pulls live from GitHub commits. Zero manual updates. Every push by Durga or Madhu auto-appears, grouped by date and author',
                    'SSO-only login — Microsoft 365 is the only sign-in method. Email/password form removed. Access-pending gate for staff without access_enabled',
                    'Profile menu — unified nav bar component across all pages. Favicon, OG image, and page metadata set for correct link previews',
                    'Persistent sessions — SSO sessions persist 30 days. Microsoft handles re-auth silently',
                    'Course-focused dashboard — regular staff see Course Library + My HR only. Managers see full workspace plus a My Team Learning section with direct reports\' course progress',
                    'Microsoft 365 SSO — staff sign in with @tresconglobal.com credentials, no separate platform password needed',
                    'Access roles — 6-level role system (Standard → Super Admin) per staff member. Synced from HRMS, overridable by admin',
                    'Toolkit per-tool grants — each staff member sees only the tools they\'ve been explicitly granted. Inaccessible tools and sidebar categories hidden entirely',
                    'AIRS scoring — live AI readiness score for every staff member',
                    'Org Chart — Directory (dept-grouped table with tool dots) + Hierarchy (indented list). Click any person: full reporting chain + tool access toggles in a side panel',
                    'Tool Permissions — 8 platform modules grantable per staff member with inline dot badges, drawer UI, and Bulk Grant',
                    'Role-personalized dashboards — every staff member sees their own workspace with dept-specific quick links and live stats',
                    'Staff Directory — /hr/staff: full searchable/filterable staff list with level, office, manager, joined date, status',
                    'Staff Onboarding Wizard — 5-step HR form at /hr/staff/new: personal info, work details, reporting structure, platform access, review & create',
                    'Password management — forgot password email, token-based reset (1hr expiry), forced first-login change, self-service change from profile, admin force-reset',
                    'Transactional emails via Resend — password reset, welcome, credentials on new staff creation. FROM: noreply@eventpilot.tresconglobal.com',
                    'Personal dashboard with role-specific course recommendations and platform access tiles',
                    'Course Library — auto-filtered to staff department, assigned courses pinned at top',
                    'Weekly auto course generation — every Sunday Pilot AI builds 3 draft courses from org skill gaps + latest AI news. Super admin reviews and publishes from Review Queue',
                    'Engagement report — Learning tab shows participation rate per department and full Never Started list (staff with zero course activity)',
                    'AI-generated courses via Learning Lab — ready to publish in minutes',
                    'Pilot — internal AI assistant scoped to Event Pilot and your org',
                    'Admin dashboard with org-wide intelligence and tier breakdowns',
                    'Full HRMS — attendance, leave, recruitment pipeline, contracts, payroll grades, onboarding, offboarding',
                    'My HR portal — self-service leave, attendance, and event tasks for all staff',
                    'Events Hub — RACI governance, P&L, execution flow, checklist, deals, and team management',
                    'Brand Studio — full 9-section brand book builder with PDF import, AI extraction, and manual builder',
                    'Website Builder — event microsites with brand sync gate and one-click palette/font sync from Brand Studio',
                    'Knowledge Base — company documents with Gemini-powered text and scanned PDF processing',
                    'Smart Data (100%) — lead extraction, LinkedIn enrichment, email verification, contact DB, Pipeline Kanban, Email Guesser, Data Quality, Saved Audiences, Contact Scoring, Enrichment Audit',
                    'Content Hub — AI social campaigns with guided templates, approval flow, and calendar view',
                    'Team Dashboard — managers see their full team hierarchy, AIRS score per member, tier distribution, who hasn\'t started, and an AI-generated Team Health Brief',
                    'Course assignment — admin assigns any course to an individual, department, or all staff with optional due date. Staff notified instantly in-app',
                    'Completion certificates — auto-issued when a staff member passes a course for the first time. Stored on their profile',
                    'Brand asset generator — Imagen 3 AI generates event banners, social posts, LinkedIn banners, speaker cards, and sponsor cards from brand guidelines in Brand Studio',
                    'Department course seeding — admin generates 1–3 dept-specific AI courses in one click from Learning Lab. Saved as drafts for review before publishing',
                    'Weekly org pulse email — super admins receive a formatted report every Sunday: completions, participation rate, top dept, top skill gap, auto-generated course count',
                    'Brand PDF export — Brand Studio generates a polished self-contained HTML brand book. Export PDF button in Brand Studio nav, print dialog auto-triggers',
                    'Course Builder — /admin/courses: Review Queue, All Courses table, editor panel with 4 sub-tabs, New Course manual builder',
                    'Platform Menu — role-aware, each user sees only the tools they can access',
                    'Platform Docs — AIRS scoring guide, discovery questionnaire, AI readiness playbook',
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 14px', background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.18)', borderRadius: '10px' }}>

                      <svg width="13" height="13" style={{ flexShrink: 0, marginTop: '2px' }} fill="none" stroke="var(--lime)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Phase 2 — complete ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--lime)' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--lime)' }}>Phase 2 — Complete</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { title: 'Course assignment ✓', desc: 'Admin assigns any course to an individual, department, or all staff with optional due date. In-app notification sent instantly. Panel in Learning tab.' },
                    { title: 'Completion certificates ✓', desc: 'Auto-issued on first pass. Stored in training_certificates, visible on staff profile.' },
                    { title: 'Brand asset generator ✓', desc: 'Imagen 3 generates event banners, social posts, LinkedIn banners, speaker cards, sponsor cards from brand guidelines. Brand Studio → Asset Generator.' },
                    { title: 'Department course seeding ✓', desc: 'Admin generates 1–3 dept-specific AI courses in one click. Full courses with reading content, task steps, and 10-question bank. Saved as drafts for review.' },
                    { title: 'Weekly org pulse report ✓', desc: 'Every Sunday at 8 PM IST, super admins receive completions, participation rate, top dept, top skill gap, and auto-generated course count by email.' },
                    { title: 'Website builder template library ✓', desc: '5 curated event microsite templates live (Finance 2045, Vault 2047, World CX Summit, World AI Show, Big CIO Show). Brand palette auto-applies on selection.' },
                    { title: 'Brand PDF export ✓', desc: 'Brand Studio generates a self-contained HTML brand book: cover, identity, logo variants, color palette, typography, patterns, voice & tone, asset gallery. Export PDF button in Brand Studio nav.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'rgba(61,107,0,0.04)', border: '1px solid rgba(61,107,0,0.15)', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <svg width="13" height="13" style={{ flexShrink: 0, marginTop: '2px' }} fill="none" stroke="var(--lime)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--lime)', marginBottom: '3px' }}>{item.title}</div>
                        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Pre-Phase 3 Checklist ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--teal-mid)' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Pre-Phase 3 — Current Sprint</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { done: true,  title: 'Microsoft 365 SSO ✓',               desc: 'Staff log in with @tresconglobal.com Microsoft credentials. No platform password needed.' },
                    { done: true,  title: 'User Management + Access Roles ✓',   desc: 'Backend schema, HRMS sync, and admin UI all complete. 6-role system visible and editable in People tab.' },
                    { done: true,  title: 'Staff Review System ✓',              desc: 'Floating Report Issue button on every page. Staff report bugs by tool, type, severity. Admin triages at /admin/reviews.' },
                    { done: true,  title: 'Auto Build Log ✓',                   desc: 'What\'s Next panel now pulls live from GitHub commits. No manual updates needed. Both commit styles (Durga + Madhu) supported.' },
                    { done: true,  title: 'Smart Data — 100% complete ✓',         desc: 'Pipeline Kanban, Email Guesser API, Data Quality dashboard, Saved Audiences, Contact Scoring, Enrichment Audit, live credit bar — all live.' },
                    { done: false, title: 'Khalifa — Brand Book test',           desc: 'Khalifa (branding head) has Website Builder access. Needs to test brand book section under Website Builder for AI2047.' },
                    { done: false, title: 'Website Builder test — AI2047',       desc: 'Prashant + Khalifa to fully test the website builder for AI2047 event. Prashant has WB + Market Intel + Outreach access.' },
                    { done: false, title: 'Social publishing — Content Hub',     desc: 'Content Hub social publishing for AI2047. Approval workflow fully built. Needs Meta API tokens from Madhu to wire LinkedIn, Instagram, Facebook.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: item.done ? 'rgba(0,137,123,0.04)' : 'rgba(0,137,123,0.02)', border: `1px solid ${item.done ? 'rgba(0,137,123,0.2)' : 'var(--border)'}`, borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: item.done ? 'var(--teal-mid)' : 'var(--surface)', border: item.done ? 'none' : '2px solid var(--ink4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                        {item.done && <svg width="10" height="10" fill="none" stroke="var(--card)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: item.done ? 'var(--teal-mid)' : 'var(--ink)', marginBottom: '3px' }}>{item.title}{item.done ? ' ✓' : ''}</div>
                        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Blocked / Waiting ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F5B94D' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#F5B94D' }}>Blocked — waiting on external input</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { title: 'Content Hub social publishing', blocker: 'Waiting on Meta API tokens from Madhu', desc: 'Approval queue and campaign workflow are fully built. Once Meta tokens are provided, LinkedIn, Instagram, and Facebook publishing can be wired up in one session.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)' }}>{item.title}</div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#F5B94D', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: '20px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{item.blocker}</div>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Phase 3 ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#A478FF' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#A478FF' }}>Phase 3 — Intelligence deepens</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { title: 'Department deep-dives', desc: 'Per-department AI report: current tier split, top skill gaps, projected AIRS in 30 days, recommended courses to close each gap.' },
                    { title: 'Course effectiveness scoring', desc: 'AI tracks whether AIRS actually improves after each course. Courses that don\'t move the needle get flagged for revision or removal.' },
                    { title: 'Events Hub AI-first', desc: 'Upload an event brief — AI extracts structure, assigns staff by RACI, surfaces readiness gaps on the team before the event starts.' },
                    { title: 'Security hardening', desc: 'Brute force rate limiting, full audit log (who did what + when), signed sessions, idle session timeout, force password change on first login.' },
                    { title: 'Platform integrations', desc: 'Event Pilot org intelligence feeds into TAOS — capability data becomes a live business asset across the full Trescon platform.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'rgba(164,120,255,0.05)', border: '1px solid rgba(164,120,255,0.12)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF', marginBottom: '4px' }}>{item.title}</div>
                      <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Suggestion Box ── */}
              <div style={{ background: 'rgba(0,137,123,0.05)', border: '1px solid rgba(0,137,123,0.2)', borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '6px' }}>Suggest something</div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '16px' }}>
                  What should we build next? Flag a gap, request a feature, or share what&apos;s not working. Every submission is reviewed.
                </div>
                {suggSent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: 'rgba(0,137,123,0.08)', borderRadius: '10px', border: '1px solid rgba(0,137,123,0.2)' }}>
                    <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)' }}>Received — thank you. We&apos;ll review it before the next build cycle.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <textarea
                      value={suggText}
                      onChange={e => setSuggText(e.target.value)}
                      placeholder="Describe the feature, gap, or issue…"
                      rows={4}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <button
                      disabled={!suggText.trim() || suggSending}
                      onClick={async () => {
                        if (!suggText.trim()) return
                        setSuggSending(true)
                        try {
                          await fetch('/api/feedback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: 'Management', department: 'Admin', message: suggText.trim() }),
                          })
                          setSuggSent(true)
                          setSuggText('')
                        } finally {
                          setSuggSending(false)
                        }
                      }}
                      style={{ alignSelf: 'flex-end', padding: '10px 22px', borderRadius: '10px', border: 'none', background: suggText.trim() && !suggSending ? 'var(--teal-mid)' : 'var(--border)', color: suggText.trim() && !suggSending ? 'var(--teal-light)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: suggText.trim() && !suggSending ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'background 0.15s' }}>
                      {suggSending ? 'Sending…' : 'Submit suggestion'}
                    </button>
                  </div>
                )}
              </div>

              {/* ── Footer note ── */}
              <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.7, paddingBottom: '8px' }}>
                This roadmap updates as the platform learns.<br />Your suggestions shape every build decision.
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
              <div style={{ position: 'absolute', left: hl.left, top: hl.top, width: hl.width, height: hl.height, borderRadius: '12px', border: '2px solid var(--teal-mid)', boxShadow: '0 0 0 4px rgba(0,165,163,0.18), 0 0 28px rgba(0,165,163,0.25)' }} />
            </div>

            {/* Click absorber (keeps page non-interactive during tour) */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 1099, cursor: 'default' }} onClick={e => e.stopPropagation()} />

            {/* Tooltip card */}
            <div style={{ position: 'fixed', zIndex: 1110, left: tipLeft, top: tipTop, width: tipW, background: 'var(--card)', border: '1px solid rgba(0,165,163,0.4)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.65)', animation: 'tourPop 0.2s ease' }}>
              {/* Step indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {TOUR_STEPS.map((_, i) => (
                    <div key={i} style={{ width: i === tourStep ? '18px' : '6px', height: '6px', borderRadius: '3px', background: i === tourStep ? 'var(--teal-mid)' : 'var(--border)', transition: 'all 0.2s' }} />
                  ))}
                </div>
                <button onClick={endTour} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', padding: '0' }}>Skip tour</button>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '7px' }}>{step.title}</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.65, marginBottom: '18px' }}>{step.desc}</div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {tourStep > 0 && (
                  <button
                    onClick={() => setTourStep(s => s! - 1)}
                    style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >Back</button>
                )}
                <button
                  onClick={() => tourStep < TOUR_STEPS.length - 1 ? setTourStep(s => s! + 1) : endTour()}
                  style={{ flex: 1, padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #12C9BD, #0EA79D)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {tourStep < TOUR_STEPS.length - 1 ? 'Next →' : 'Done'}
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Login History Modal ── */}
      {loginHistoryStaff && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setLoginHistoryStaff(null)}>
          <div style={{ background: 'var(--card)', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{loginHistoryStaff.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{loginHistoryStaff.email} · Login history</div>
              </div>
              <button onClick={() => setLoginHistoryStaff(null)}
                style={{ width: '28px', height: '28px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" fill="none" stroke="var(--ink3)" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loginHistoryLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>Loading history…</div>
              ) : loginHistory.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>No login records found yet.</div>
              ) : (
                <>
                  {/* Stats bar */}
                  {(() => {
                    const successful = loginHistory.filter(r => r.success)
                    const failed     = loginHistory.filter(r => !r.success)
                    const lastOk     = successful[0]
                    return (
                      <div style={{ display: 'flex', gap: '20px', padding: '14px 24px', background: 'var(--border-light)', borderBottom: '1px solid var(--surface)' }}>
                        {[
                          { label: 'Total logins', value: successful.length, color: 'var(--teal-mid)' },
                          { label: 'Failed attempts', value: failed.length, color: failed.length > 0 ? 'var(--red)' : 'var(--ink4)' },
                          { label: 'Last seen', value: lastOk ? new Date(lastOk.attempted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' }) : '—', color: '#1296BA' },
                        ].map(s => (
                          <div key={s.label}>
                            <div style={{ fontSize: '18px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  {/* Table */}
                  <div style={{ padding: '0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr', padding: '8px 24px', background: 'var(--surface)' }}>
                      {['Result', 'Date & Time (Dubai)', 'IP'].map(h => (
                        <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
                      ))}
                    </div>
                    {loginHistory.map((row, idx) => {
                      const REASON_LABEL: Record<string, string> = {
                        ok: 'Signed in', super_admin_ok: 'Signed in', sso: 'SSO login',
                        wrong_password: 'Wrong password', not_found: 'Account not found',
                        account_disabled: 'Account disabled', rate_limited: 'Rate limited',
                        ip_blocked: 'IP blocked',
                      }
                      const label = REASON_LABEL[row.reason ?? ''] ?? (row.success ? 'Signed in' : 'Failed')
                      return (
                        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr', alignItems: 'center', padding: '9px 24px', borderBottom: idx < loginHistory.length - 1 ? '1px solid var(--surface)' : 'none' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: row.success ? 'var(--success)' : 'var(--red)', background: row.success ? 'var(--success-light)' : 'var(--red-light)', padding: '2px 8px', borderRadius: '5px' }}>
                              {label}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                            {new Date(row.attempted_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--ink3)', fontFamily: 'monospace' }}>{row.ip ?? '—'}</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Access Roles Modal ── */}
      {rolesOpen && rolesStaff && (() => {
        const off = OFFICES.find(o => o.id === rolesStaff.office_id)
        const ALL_ROLES = VALID_ACCESS_ROLES
        const toggle = (r: string) => {
          if (r === 'standard') return // always present, can't untick directly
          setRolesEdit(prev =>
            prev.includes(r)
              ? prev.filter(x => x !== r).length === 0 ? ['standard'] : prev.filter(x => x !== r)
              : [...prev.filter(x => x !== 'standard'), r]
          )
        }
        const save = async () => {
          setRolesSaving(true)
          const res = await fetch('/api/staff-roles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rolesStaff.id, roles: rolesEdit }) })
          const data = await res.json()
          if (res.ok) {
            setStaffList(prev => prev.map(s => s.id === rolesStaff.id ? { ...s, access_roles: data.access_roles } : s))
            setRolesOpen(false)
          }
          setRolesSaving(false)
        }
        return (
          <>
            <div onClick={() => setRolesOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.55)', zIndex: 1200, backdropFilter: 'blur(2px)' }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1300, background: 'var(--card)', borderRadius: '20px', padding: '32px', width: '420px', maxWidth: '90vw', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${off?.color ?? 'var(--teal-mid)'}18`, border: `1px solid ${off?.color ?? 'var(--teal-mid)'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: off?.color ?? 'var(--teal-mid)' }}>{rolesStaff.name.charAt(0)}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{rolesStaff.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{rolesStaff.email}</div>
                  </div>
                </div>
                <button onClick={() => setRolesOpen(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--ink3)', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit' }}>Close</button>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '12px' }}>Platform Access Roles</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {ALL_ROLES.map(r => {
                  const meta    = ROLE_META[r]
                  const checked = rolesEdit.includes(r) || (r === 'standard' && rolesEdit.length === 0)
                  const isOnly  = r === 'standard'
                  return (
                    <label key={r} onClick={() => !isOnly && toggle(r)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${checked ? meta.color + '50' : 'var(--border)'}`, background: checked ? meta.bg : 'var(--border-light)', cursor: isOnly ? 'default' : 'pointer', transition: 'all 0.15s' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${checked ? meta.color : 'var(--border)'}`, background: checked ? meta.color : 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                        {checked && <svg width="10" height="10" viewBox="0 0 12 12" fill="var(--surface)"><polyline points="2,6 5,9 10,3" strokeWidth="2" stroke="var(--surface)" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: checked ? meta.color : 'var(--ink)' }}>{meta.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '1px' }}>{meta.desc}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--surface)', borderRadius: '8px', fontSize: '11px', color: 'var(--ink3)', marginBottom: '20px', lineHeight: 1.5 }}>
                Changes override HRMS sync until the next full sync. HRMS roles will re-apply on next sync unless you want them locked.
              </div>
              <button onClick={save} disabled={rolesSaving} style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: rolesSaving ? 'var(--ink4)' : 'linear-gradient(135deg, var(--teal-mid) 0%, var(--teal) 100%)', color: rolesSaving ? 'var(--ink3)' : 'var(--teal-light)', fontSize: '14px', fontWeight: 800, cursor: rolesSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {rolesSaving ? 'Saving…' : 'Save Roles'}
              </button>
            </div>
          </>
        )
      })()}

      {/* ── Tool Permissions Drawer ── */}
      {permOpen && permStaff && (() => {
        const off          = OFFICES.find(o => o.id === permStaff.office_id)
        const isSuperAdmin = permStaff.job_level === 'super_admin'
        const LEVEL_COLOR_D: Record<string,string> = { super_admin:'#A78BFA', office_head:'#F1667A', dept_head:'#F5B94D', team_lead:'#5AA9F2', staff:'#7E93A1' }
        const LEVEL_LABEL_D: Record<string,string> = { super_admin:'Super Admin', office_head:'Office Head', dept_head:'Dept Head', team_lead:'Team Lead', staff:'Staff' }
        const bulkToolDef  = PLATFORM_TOOLS.find(t => t.key === bulkTool) ?? PLATFORM_TOOLS[0]
        const bulkFiltered = staffList.filter(s => {
          if (!bulkSearch) return true
          const q = bulkSearch.toLowerCase()
          return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.department ?? '').toLowerCase().includes(q)
        })
        const handleBulkGrant = async () => {
          if (bulkSel.size === 0) return
          setBulkSaving(true)
          setBulkDone(null)
          let granted = 0, errors = 0
          await Promise.all([...bulkSel].map(async id => {
            try {
              const res = await fetch('/api/admin/tool-permissions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, tool_key: bulkTool, value: true }),
              })
              if (res.ok) {
                granted++
                setStaffList(prev => prev.map(s => s.id === id
                  ? { ...s, tool_grants: { ...(s.tool_grants ?? {}), [bulkTool]: true }, ...(bulkTool === 'smart_data' ? { toolkit_access: true } : {}) }
                  : s
                ))
              } else { errors++ }
            } catch { errors++ }
          }))
          setBulkSaving(false)
          setBulkDone(`Granted ${bulkToolDef.label} access to ${granted} staff${errors > 0 ? ` · ${errors} failed` : ''}`)
          setBulkSel(new Set())
        }
        return (
          <>
            {/* Backdrop */}
            <div onClick={() => setPermOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.55)', zIndex: 1200, backdropFilter: 'blur(2px)' }} />
            {/* Drawer */}
            <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '520px', background: 'var(--card)', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', zIndex: 1201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '24px 24px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '4px' }}>Platform Access</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>Tool Permissions</div>
                  </div>
                  <button onClick={() => setPermOpen(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', alignItems: 'center' }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                {/* Person card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${off?.color ?? 'var(--teal-mid)'}18`, border: `1.5px solid ${off?.color ?? 'var(--teal-mid)'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: off?.color ?? 'var(--teal-mid)' }}>{permStaff.name.charAt(0)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{permStaff.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{permStaff.email}</div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: `${LEVEL_COLOR_D[permStaff.job_level] ?? '#7E93A1'}15`, color: LEVEL_COLOR_D[permStaff.job_level] ?? '#7E93A1', flexShrink: 0 }}>
                    {LEVEL_LABEL_D[permStaff.job_level] ?? permStaff.job_level}
                  </span>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['person', 'bulk'] as const).map(t => (
                    <button key={t} onClick={() => setPermTab(t)} style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: permTab === t ? '2px solid var(--teal-mid)' : '2px solid transparent', color: permTab === t ? 'var(--teal-mid)' : 'var(--ink3)', fontSize: '13px', fontWeight: permTab === t ? 800 : 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {t === 'person' ? 'This Person' : 'Bulk Grant'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                {/* ── This Person tab ── */}
                {permTab === 'person' && (
                  <>
                    {isSuperAdmin && (
                      <div style={{ marginBottom: '16px', background: 'var(--purple-light)', border: '1px solid var(--purple-border)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: 'var(--purple)', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Super Admins have unrestricted access to all platform tools.
                      </div>
                    )}
                    {/* 2-column tool card grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {PLATFORM_TOOLS.map(tool => {
                        const granted = isSuperAdmin || (permGrants[tool.key] ?? false)
                        const saving  = permSaving === tool.key
                        return (
                          <div key={tool.key}
                            onClick={() => {
                              if (isSuperAdmin || saving) return
                              const newVal = !permGrants[tool.key]
                              setPermGrants(prev => ({ ...prev, [tool.key]: newVal }))
                              setPermSaving(tool.key)
                              fetch('/api/admin/tool-permissions', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: permStaff.id, tool_key: tool.key, value: newVal }),
                              }).then(res => {
                                if (res.ok) {
                                  setStaffList(prev => prev.map(s => s.id === permStaff.id
                                    ? { ...s, tool_grants: { ...(s.tool_grants ?? {}), [tool.key]: newVal }, ...(tool.key === 'smart_data' ? { toolkit_access: newVal } : {}) }
                                    : s
                                  ))
                                } else {
                                  setPermGrants(prev => ({ ...prev, [tool.key]: !newVal }))
                                }
                              }).finally(() => setPermSaving(null))
                            }}
                            style={{ background: granted ? `${tool.color}07` : 'var(--border-light)', border: granted ? `1.5px solid ${tool.color}35` : '1.5px solid var(--surface)', borderRadius: '12px', padding: '14px', cursor: isSuperAdmin ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', opacity: saving ? 0.65 : 1, transition: 'all 0.15s' }}
                          >
                            {/* Icon + toggle row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: granted ? `${tool.color}18` : 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: granted ? tool.color : 'var(--ink4)', transition: 'all 0.15s' }}>
                                {tool.icon}
                              </div>
                              {/* Toggle */}
                              <div style={{ width: '34px', height: '19px', borderRadius: '10px', background: saving ? 'var(--border)' : (granted ? tool.color : 'var(--border)'), position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                                <div style={{ position: 'absolute', top: '2px', left: granted ? '17px' : '2px', width: '15px', height: '15px', borderRadius: '50%', background: saving ? 'var(--ink4)' : 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,0.18)', transition: 'left 0.15s' }} />
                              </div>
                            </div>
                            {/* Name */}
                            <div style={{ fontSize: '12px', fontWeight: 800, color: granted ? 'var(--ink)' : 'var(--ink3)', lineHeight: 1.2 }}>{tool.label}</div>
                            {/* Desc */}
                            <div style={{ fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.45 }}>{tool.desc}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--ink4)', fontWeight: 600, textAlign: 'center' }}>
                      {isSuperAdmin ? 'All tools — unrestricted' : `${Object.values(permGrants).filter(Boolean).length} of ${PLATFORM_TOOLS.length} tools granted`}
                    </div>
                  </>
                )}

                {/* ── Bulk Grant tab ── */}
                {permTab === 'bulk' && (
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '18px', lineHeight: 1.6 }}>
                      Pick a tool, select staff members, then grant access to all at once.
                    </div>

                    {/* Tool picker */}
                    <div style={{ marginBottom: '18px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '8px' }}>Tool to Grant</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {PLATFORM_TOOLS.map(tool => (
                          <button key={tool.key} onClick={() => { setBulkTool(tool.key); setBulkSel(new Set()); setBulkDone(null) }}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: bulkTool === tool.key ? `1.5px solid ${tool.color}` : '1.5px solid var(--border)', background: bulkTool === tool.key ? `${tool.color}10` : 'var(--card)', color: bulkTool === tool.key ? tool.color : 'var(--ink3)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: bulkTool === tool.key ? tool.color : 'var(--ink4)', flexShrink: 0 }} />
                            {tool.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Staff list header */}
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '8px' }}>Select Staff</div>
                    <div style={{ position: 'relative', marginBottom: '6px' }}>
                      <svg width="12" height="12" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)} placeholder="Search name, email, department…"
                        style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '30px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <button onClick={() => {
                        const noAccess = bulkFiltered.filter(s => !(s.tool_grants?.[bulkTool] ?? (bulkTool === 'smart_data' && (s.toolkit_access ?? false))))
                        setBulkSel(new Set(noAccess.map(s => s.id)))
                      }} style={{ background: 'none', border: 'none', color: 'var(--teal-mid)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                        Select without access
                      </button>
                      {bulkSel.size > 0 && (
                        <button onClick={() => setBulkSel(new Set())} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                          Clear ({bulkSel.size} selected)
                        </button>
                      )}
                    </div>

                    {/* Staff rows */}
                    <div style={{ background: 'var(--border-light)', border: '1px solid var(--surface)', borderRadius: '10px', overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' }}>
                      {bulkFiltered.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>No staff match your search.</div>
                      ) : bulkFiltered.map((s, idx) => {
                        const hasAccess = s.tool_grants?.[bulkTool] ?? (bulkTool === 'smart_data' && (s.toolkit_access ?? false))
                        const isSel     = bulkSel.has(s.id)
                        const offS      = OFFICES.find(o => o.id === s.office_id)
                        return (
                          <div key={s.id}
                            onClick={() => setBulkSel(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: idx < bulkFiltered.length - 1 ? '1px solid var(--surface)' : 'none', cursor: 'pointer', background: isSel ? 'rgba(0,137,123,0.05)' : 'transparent' }}
                          >
                            {/* Checkbox */}
                            <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${isSel ? 'var(--teal-mid)' : 'var(--border)'}`, background: isSel ? 'var(--teal-mid)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                              {isSel && <svg width="9" height="9" fill="none" stroke="var(--card)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                            {/* Avatar */}
                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${offS?.color ?? 'var(--teal-mid)'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: offS?.color ?? 'var(--teal-mid)' }}>{s.name.charAt(0)}</span>
                            </div>
                            {/* Name + dept */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.department ?? '—'}</div>
                            </div>
                            {/* Access status */}
                            {hasAccess ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: bulkToolDef.color }} />
                                <span style={{ fontSize: '10px', fontWeight: 700, color: bulkToolDef.color }}>Access</span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ink3)', flexShrink: 0 }}>No access</span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Success banner */}
                    {bulkDone && (
                      <div style={{ marginTop: '10px', background: 'var(--success-light)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: 'var(--success)', fontWeight: 600 }}>
                        {bulkDone}
                      </div>
                    )}

                    {/* Grant button */}
                    <button
                      disabled={bulkSel.size === 0 || bulkSaving}
                      onClick={handleBulkGrant}
                      style={{ marginTop: '12px', width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: bulkSel.size === 0 || bulkSaving ? 'var(--border)' : bulkToolDef.color, color: bulkSel.size === 0 || bulkSaving ? 'var(--ink4)' : 'var(--card)', fontSize: '14px', fontWeight: 800, cursor: bulkSel.size === 0 || bulkSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      {bulkSaving ? (
                        <>
                          <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--card)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          Granting…
                        </>
                      ) : bulkSel.size > 0 ? (
                        `Grant ${bulkToolDef.label} to ${bulkSel.size} ${bulkSel.size === 1 ? 'person' : 'people'}`
                      ) : (
                        'Select staff to grant'
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Footer — This Person tab only */}
              {permTab === 'person' && (
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                  <button onClick={() => setPermOpen(false)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Done
                  </button>
                </div>
              )}

            </div>
          </>
        )
      })()}

    </div>
  )
}

// useSearchParams() (added 2026-08-17 for sidebar tab deep-links) requires
// a Suspense boundary around any caller for static prerendering to succeed.
export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  )
}
