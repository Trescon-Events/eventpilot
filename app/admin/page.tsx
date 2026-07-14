'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'
import { buildQuestions, ALL_DEPARTMENTS } from '@/app/lib/questions'
import type { Question } from '@/app/lib/questions'
import { computeAIRS } from '@/app/lib/airs'
import { kbDownloadHref } from '@/app/lib/kb/download-href'
import type { Gap } from '@/app/lib/kb/gaps'
import { suggestDocType, KB_TYPE_META, type KbDocType } from '@/app/lib/kb/classify'

const INGEST_STAGES = ['Reading your document…', 'Organising the details…', 'Almost done…']

const ROLE_META: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  standard:        { label: 'Standard',        color: '#5B7080', bg: '#5B708015', desc: 'Default — basic platform access' },
  hr:              { label: 'HR',              color: '#92400E', bg: '#92400E15', desc: 'Access to HR portal and leave management' },
  project_manager: { label: 'Project Mgr',    color: '#1565C0', bg: '#1565C015', desc: 'Can create and manage events' },
  project_director:{ label: 'Project Dir',    color: '#6B21A8', bg: '#6B21A815', desc: 'Project oversight across events' },
  admin:           { label: 'Admin',           color: '#166534', bg: '#16653415', desc: 'Platform admin — People, Events, Knowledge' },
  super_admin:     { label: 'Super Admin',     color: '#00697B', bg: '#00697B15', desc: 'Full platform access, no restrictions' },
}

const PLATFORM_TOOLS = [
  { key: 'smart_data',      label: 'Smart Data',           desc: 'Apollo-style contact database, enrichment & bulk outreach',    color: '#0E7490',  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> },
  { key: 'hr_portal',       label: 'HR Portal',            desc: 'Full HR management — leave, contracts, payroll, onboarding',   color: '#7C3AED',  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { key: 'events',          label: 'Events',               desc: 'Event creation, team RACI, budgets & delegate management',     color: '#166534',  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { key: 'intelligence',    label: 'Market Intelligence',  desc: 'Market intelligence, AI research & account insights',          color: '#92400E',  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { key: 'brand_studio',    label: 'Brand Studio',         desc: 'AI image generation, brand templates & creative assets',      color: '#DC2626',  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.477-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg> },
  { key: 'website_builder', label: 'Website Builder',      desc: 'Event websites, landing pages & custom domain hosting',       color: '#D97706',  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
  { key: 'content',         label: 'Content Engine',       desc: 'Social media planning, AI content generation & approval flow', color: '#059669', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
  { key: 'commercial',      label: 'Commercial P&L',      desc: 'Event P&L, revenue pipeline, budgets & financial reporting',   color: '#00695C', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg> },
  { key: 'tresagent',       label: 'TresAgent',            desc: 'AI voice & WhatsApp outreach agent for delegate acquisition',  color: '#EC4899', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="19" cy="5" r="3"/></svg> },
  { key: 'bespoke',         label: 'Bespoke Tracker',      desc: 'End-to-end bespoke event lifecycle — client brief to invoice',   color: '#B45309', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg> },
  { key: 'timesheets',      label: 'Timesheets',           desc: 'Staff time logging per event/project with manager approvals',   color: '#0284C7', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { key: 'finance',         label: 'Finance Portal',       desc: 'Salary, expenses, vendor payments, payroll summary',              color: '#1565C0', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
  { key: 'smart_excel',     label: 'SmartExcel',           desc: 'Conversational AI spreadsheet & document-to-spreadsheet jobs', color: '#2E7D32', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg> },
  { key: 'smart_excel_admin', label: 'SmartExcel — Admin', desc: 'Admin-tier access within SmartExcel (manage users, roles, publish recipes)', color: '#1B5E20', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2 3 7v6c0 5 4 8.5 9 9 5-.5 9-4 9-9V7l-9-5z"/></svg> },
  { key: 'corporate_marketing', label: 'Corporate Marketing', desc: 'Corporate deck, testimonials, approved assets — single source for all corporate content', color: '#8B1A1A', icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
]

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

const PLAYBOOK_TIERS = [
  { tier: 'AI-Forward',  range: '75–100', color: '#166534', action: 'Assign as AI Pilot Leads. They run the first automation sprint for their department.', owner: 'AI Lead + Dept Head', by: 'This sprint' },
  { tier: 'AI-Ready',    range: '55–74',  color: '#0E7490', action: 'Pair with an AI-Forward colleague. Start a 30-day tool adoption plan with one specific workflow to automate.', owner: 'Event Pilot Training', by: '30 days' },
  { tier: 'AI-Aware',    range: '35–54',  color: '#92400E', action: 'Foundation workshop (half day). Pick one tool for their role and commit to using it daily for 2 weeks.', owner: 'Event Pilot Training + HR', by: '60 days' },
  { tier: 'AI-Curious',  range: '15–34',  color: '#C2410C', action: "Awareness session first — why AI matters for their specific role. Then intro to ChatGPT basics.", owner: 'HR + Event Pilot', by: '90 days' },
  { tier: 'AI-Unaware',  range: '0–14',   color: '#991B1B', action: 'Digital literacy assessment first. Build a personalised catch-up plan before any AI training.', owner: 'HR', by: '120 days' },
]

export default function AdminPage() {
  const [authed, setAuthed]   = useState(() => typeof window !== 'undefined' && sessionStorage.getItem('tai_admin_authed') === '1')
  const [adminStaffId, setAdminStaffId] = useState(() => typeof window !== 'undefined' ? sessionStorage.getItem('tai_admin_staff_id') ?? '' : '')
  const [isSuperAdmin, setIsSuperAdmin] = useState(() => typeof window !== 'undefined' && (sessionStorage.getItem('tai_admin_staff_id') === 'super-admin' || sessionStorage.getItem('tai_is_super_admin') === '1'))
  const [kbAccessTier, setKbAccessTier] = useState<'none' | 'user' | 'admin'>('none')
  useEffect(() => {
    fetch('/api/kb/access/me').then(r => r.json()).then(d => setKbAccessTier(d.tier ?? 'none')).catch(() => {})
  }, [])
  const [code, setCode]       = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [codeError, setCodeError] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks]     = useState<TaskProfile[]>([])
  type AdminTab = 'overview' | 'people' | 'intelligence' | 'learning' | 'suggest' | 'events' | 'commercial' | 'knowledge' | 'review' | 'toolkit' | 'security' | 'docuhub'
  const [tab, setTab]         = useState<AdminTab>(() => {
    if (typeof window === 'undefined') return 'overview'
    const t = new URLSearchParams(window.location.search).get('tab') as AdminTab | null
    return t ?? 'overview'
  })

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
  const [showMoreMenu,  setShowMoreMenu]  = useState(false)
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)
  const [staffName,     setStaffName]     = useState<string | null>(null)
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

  // Knowledge / Documents tab
  type DocRow = {
    id: string; title: string; type: string; visibility: string
    word_count: number; event_id: string | null; created_at: string
    events?: { name: string } | null
    layer: string; department: string; min_level: string
    pilot_use: boolean; confidence: number; flagged: boolean; status: string
    source_url: string | null; version: number; document_group_id: string | null
    superseded_by: string | null; workspace_id: string | null
    doc_category?: string
  }
  const [docs,          setDocs]          = useState<DocRow[]>([])
  const [docsLoading,   setDocsLoading]   = useState(false)
  const [docForm,       setDocForm]       = useState({ title: '', type: 'policy', visibility: 'all', event_id: '', source_url: '', workspace_id: '', doc_category: '' })
  const [docCategoryFilter, setDocCategoryFilter] = useState<'all'|'event_intelligence'|'business_development'|'project_management'|'marketing'|'company_knowledge'|'external'>('all')
  const [otherTypeLabel,setOtherTypeLabel]= useState('')
  const [saveAsNewType, setSaveAsNewType] = useState(false)
  const [customDocTypes,setCustomDocTypes]= useState<{ key: string; label: string }[]>([])
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [docFilter,       setDocFilter]       = useState<'all'|'knowledge_base'|'general'|'specific'|'flagged'>('all')

  // Knowledge — sub-tab, version control, BD Workspaces
  type DocSubTab = 'documents' | 'workspaces' | 'intelligence' | 'gaps' | 'admins'
  const [docSubTab,     setDocSubTab]     = useState<DocSubTab>(() => {
    if (typeof window === 'undefined') return 'documents'
    const s = new URLSearchParams(window.location.search).get('sub') as DocSubTab | null
    return s ?? 'documents'
  })
  // Keeps the URL in sync with the current tab/sub-tab (replaceState, not
  // pushState — tab switches shouldn't spam browser history) so a "back" link
  // from a tool page (e.g. /admin?tab=knowledge&sub=documents) lands the user
  // where they actually came from instead of always Overview.
  const syncAdminUrl = (t: string, sub?: string) => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    params.set('tab', t)
    if (sub) params.set('sub', sub); else params.delete('sub')
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }
  const [supersedesDoc, setSupersedesDoc] = useState<DocRow | null>(null)
  const [versionNote,   setVersionNote]   = useState('')

  // Knowledge — Press Intelligence
  type IntelSource = {
    id: string; name: string; source_type: string; category: string
    config: { url?: string; query?: string }; crawl_frequency: string; crawl_behaviour: string
    is_active: boolean; last_run_at: string | null; last_found_count: number
  }
  type IntelItem = {
    id: string; source_id: string | null; url: string; title: string | null
    published_date: string | null; gemini_score: number | null; gemini_reasoning: string | null
    gemini_summary: string | null; event_mentioned: string | null; article_type: string | null
    status: string; document_id: string | null; run_id: string | null; discovered_at: string
    kb_intel_sources?: { name: string; category: string } | null
  }
  type IntelRun = {
    id: string; started_at: string; completed_at: string | null; status: string
    sources_checked: number; urls_discovered: number; items_auto_published: number
    items_queued: number; items_skipped: number; error_message: string | null; triggered_by: string
  }
  type IntelConfig = {
    id: string; cron_schedule_display: string; is_enabled: boolean
    auto_publish_threshold: number; review_threshold: number
    event_registry_data: { name: string; status?: string; website?: string; description?: string }[] | null
    event_registry_source: string; event_registry_last_updated: string | null
  }
  const [intelSubTab,      setIntelSubTab]      = useState<'overview' | 'review' | 'sources' | 'items'>('overview')
  const [intelSources,     setIntelSources]     = useState<IntelSource[]>([])
  const [intelItems,       setIntelItems]       = useState<IntelItem[]>([])
  const [intelItemsTotal,  setIntelItemsTotal]  = useState(0)
  const [intelPendingItems,setIntelPendingItems]= useState<IntelItem[]>([])
  const [intelRuns,        setIntelRuns]        = useState<IntelRun[]>([])
  const [intelConfig,      setIntelConfig]      = useState<IntelConfig | null>(null)
  const [intelLoading,     setIntelLoading]     = useState(false)
  const [intelRunning,     setIntelRunning]     = useState(false)
  const [intelMsg,         setIntelMsg]         = useState('')
  const [intelThresholds,  setIntelThresholds]  = useState({ auto_publish_threshold: 75, review_threshold: 40 })
  const [expandedIntelItemId, setExpandedIntelItemId] = useState<string | null>(null)
  const [expandedIntelRunId,  setExpandedIntelRunId]  = useState<string | null>(null)
  const [intelItemsFilter, setIntelItemsFilter] = useState({ status: 'all', source_id: '', search: '' })
  const [intelItemsPage,   setIntelItemsPage]   = useState(0)
  const [showIntelSourceForm, setShowIntelSourceForm] = useState<false | 'owned_property' | 'partner_govt' | 'press_media'>(false)
  const [intelSourceForm,  setIntelSourceForm]  = useState({ name: '', url: '', query: '', crawl_behaviour: 'article_discovery', crawl_frequency: 'weekly' })
  const [intelSourceMsg,   setIntelSourceMsg]   = useState('')
  const [editingIntelSourceId, setEditingIntelSourceId] = useState<string | null>(null)
  const [collapsedIntelSections, setCollapsedIntelSections] = useState<Record<string, boolean>>({})

  type VersionRow = {
    id: string; title: string; version: number; version_note: string | null
    source_url: string | null; status: string; superseded_by: string | null
    created_at: string; staff_members: { name: string } | { name: string }[] | null
  }
  const [versionModalGroupId,   setVersionModalGroupId]   = useState<string | null>(null)
  const [versionHistory,        setVersionHistory]        = useState<VersionRow[]>([])
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false)

  type WorkspaceRow = {
    id: string; name: string; slug: string | null; client_name: string | null
    client_country: string | null; event_name: string | null; event_type: string | null
    status: string; created_at: string
    bd_workspace_members?: { count: number }[]; documents?: { count: number }[]
  }
  const [workspaces,        setWorkspaces]        = useState<WorkspaceRow[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [workspaceForm,     setWorkspaceForm]     = useState({ name: '', client_name: '', client_country: '', event_name: '', event_type: 'managed' })
  const [workspaceSaving,   setWorkspaceSaving]   = useState(false)
  const [workspaceMsg,      setWorkspaceMsg]      = useState('')
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)

  type WorkspaceMember = { id: string; role: string | null; added_at: string; staff_members: { id: string; name: string; email: string; department: string | null } }
  const [workspaceMembers,  setWorkspaceMembers]  = useState<WorkspaceMember[]>([])
  const [addMemberStaffId,  setAddMemberStaffId]  = useState('')

  // Knowledge — smart ingest (classify → process → publish)
  type PendingDoc = {
    id: string; title: string; type: string; layer: string; department: string; min_level: string
    pilot_use: boolean; status: string; source_url: string | null; word_count: number
    extracted_text: string; created_at: string
  }
  type GeneralDocAnalysis = { layer: string; department: string; min_level: string; pilot_use: boolean; ai_reasoning: string; confidence: number; flagged: boolean; suggested_type: string }
  type IngestResult = { success: boolean; detected_type: string; document: PendingDoc; summary?: string; gaps?: Gap[]; gap_session_id?: string | null; analysis?: GeneralDocAnalysis }
  const [showIngestForm, setShowIngestForm] = useState(false)
  const [ingestFile,     setIngestFile]     = useState<File | null>(null)
  // Top-level choice the uploader makes explicitly: summarise into a structured
  // KB entry (reviewed before publish) vs. keep the original wording as-is
  // (still reviewed before publish, just no restructuring/gap detection).
  const [ingestIntent,   setIngestIntent]   = useState<'summarise' | 'verbatim' | null>(null)
  // Only meaningful when intent is 'summarise' — which of the 4 structured
  // types to use, overriding the filename-based suggestion.
  const [ingestTypeChoice, setIngestTypeChoice] = useState<KbDocType | null>(null)
  const [ingesting,      setIngesting]      = useState(false)
  const [ingestStage,    setIngestStage]    = useState(0)
  const [ingestMsg,      setIngestMsg]      = useState('')
  const [ingestResult,   setIngestResult]   = useState<IngestResult | null>(null)
  const [pendingDocs,    setPendingDocs]    = useState<PendingDoc[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [reviewingId,    setReviewingId]    = useState<string | null>(null)
  const [expandedPendingId, setExpandedPendingId] = useState<string | null>(null)
  const [docActionMsg,   setDocActionMsg]   = useState('')
  const [deletingDoc,    setDeletingDoc]    = useState<DocRow | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting,       setDeleting]       = useState(false)

  // Knowledge — self-learning gap detection (KB Self-Learning PRD v3.0)
  type GapStatus = 'unresolved' | 'added' | 'skipped' | 'pending'
  type GapItem = Gap & { status: GapStatus; field_name?: string; field_category?: string; is_required?: boolean }
  type GapSession = {
    id: string; document_id: string; processor_type: string; gaps: GapItem[]; resolved: boolean
    documents?: { title: string; type: string } | null
  }
  type GapResolution = {
    gap_id: string; action: 'add_to_processor' | 'skip' | 'pending'
    field_name?: string; field_description?: string; field_category?: string; is_required?: boolean; example_value?: string
  }
  type GapWizardState = {
    mode: 'ingest' | 'review'
    documentId: string
    sessionId: string
    gapIds: string[]
    cursor: number
    step: 1 | 2 | 3
    selectedOption: string
    otherText: string
    importance: 'always' | 'optional' | 'no' | ''
    fieldChoice: 'suggested' | 'custom'
    customFieldName: string
    resolutions: GapResolution[]
    submitting: boolean
    msg: string
  }
  const [gapSessions,        setGapSessions]        = useState<Record<string, GapSession>>({})
  const [gapWizard,          setGapWizard]          = useState<GapWizardState | null>(null)
  const [pendingGapSessions, setPendingGapSessions] = useState<GapSession[]>([])
  const [pendingGapsLoading, setPendingGapsLoading] = useState(false)

  // Knowledge Base — module admins (module_access, module_key='kb')
  type ModuleGrant = { id: string; staff_id: string; tier: 'user' | 'admin'; granted_at: string; staff_members: { name: string; email: string } | null }
  const [kbAccessGrants,  setKbAccessGrants]  = useState<ModuleGrant[]>([])
  const [kbAccessLoading, setKbAccessLoading] = useState(false)
  const [kbGrantStaffId,  setKbGrantStaffId]  = useState('')
  const [kbGrantTier,     setKbGrantTier]     = useState<'user' | 'admin'>('admin')
  const [kbGrantMsg,      setKbGrantMsg]      = useState('')

  useEffect(() => {
    if (!ingesting) { setIngestStage(0); return }
    const id = setInterval(() => setIngestStage(s => (s + 1) % INGEST_STAGES.length), 2200)
    return () => clearInterval(id)
  }, [ingesting])

  async function fetchWorkspaces() {
    setWorkspacesLoading(true)
    const res  = await fetch('/api/bd-workspaces')
    const data = await res.json()
    setWorkspaces(Array.isArray(data) ? data : [])
    setWorkspacesLoading(false)
  }

  async function createWorkspace() {
    if (!workspaceForm.name.trim()) { setWorkspaceMsg('Workspace name is required.'); return }
    setWorkspaceSaving(true); setWorkspaceMsg('')
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const res = await fetch('/api/bd-workspaces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...workspaceForm, created_by: adminStaffId || undefined }),
    })
    if (res.ok) {
      setWorkspaceMsg('Workspace created.')
      setWorkspaceForm({ name: '', client_name: '', client_country: '', event_name: '', event_type: 'managed' })
      setShowWorkspaceForm(false)
      fetchWorkspaces()
    } else {
      setWorkspaceMsg('Failed to create workspace.')
    }
    setWorkspaceSaving(false)
  }

  async function fetchWorkspaceMembers(workspaceId: string) {
    const res  = await fetch(`/api/bd-workspaces/members?workspace_id=${workspaceId}`)
    const data = await res.json()
    setWorkspaceMembers(Array.isArray(data) ? data : [])
  }

  async function openWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId)
    fetchWorkspaceMembers(workspaceId)
    if (staffList.length === 0) fetchStaffList()
  }

  async function addWorkspaceMember() {
    if (!selectedWorkspaceId || !addMemberStaffId) return
    await fetch('/api/bd-workspaces/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: selectedWorkspaceId, staff_id: addMemberStaffId }),
    })
    setAddMemberStaffId('')
    fetchWorkspaceMembers(selectedWorkspaceId)
  }

  async function removeWorkspaceMember(staffId: string) {
    if (!selectedWorkspaceId) return
    await fetch(`/api/bd-workspaces/members?workspace_id=${selectedWorkspaceId}&staff_id=${staffId}`, { method: 'DELETE' })
    fetchWorkspaceMembers(selectedWorkspaceId)
  }

  async function openVersionHistory(groupId: string) {
    setVersionModalGroupId(groupId)
    setVersionHistoryLoading(true)
    const res  = await fetch(`/api/documents/versions?group_id=${groupId}`)
    const data = await res.json()
    setVersionHistory(Array.isArray(data) ? data : [])
    setVersionHistoryLoading(false)
  }

  async function fetchPendingDocs() {
    setPendingLoading(true)
    const res  = await fetch('/api/documents/list?pipeline=1')
    const data = await res.json()
    setPendingDocs(Array.isArray(data) ? data.filter((d: PendingDoc) => d.status === 'pending') : [])
    setPendingLoading(false)
  }

  // What the filename alone would suggest, before the uploader's explicit choice.
  function ingestSuggestedIntent(): 'summarise' | 'verbatim' {
    if (!ingestFile) return 'verbatim'
    return suggestDocType(ingestFile.name) === 'general' ? 'verbatim' : 'summarise'
  }

  function ingestEffectiveIntent(): 'summarise' | 'verbatim' {
    return ingestIntent ?? ingestSuggestedIntent()
  }

  function ingestEffectiveType(): KbDocType | 'general' {
    if (ingestEffectiveIntent() === 'verbatim') return 'general'
    if (ingestTypeChoice) return ingestTypeChoice
    const suggested = ingestFile ? suggestDocType(ingestFile.name) : 'general'
    // Chose "summarise" but the filename gave no structured signal — fall
    // back to Proposal rather than silently reverting to General.
    return suggested === 'general' ? 'proposal' : suggested
  }

  function resetGeneralDocForm() {
    setDocForm({ title: '', type: 'policy', visibility: 'all', event_id: '', source_url: '', workspace_id: '', doc_category: '' })
    setOtherTypeLabel('')
    setSaveAsNewType(false)
    setSupersedesDoc(null)
    setVersionNote('')
    setIngestTypeChoice(null)
    setIngestIntent(null)
  }

  async function ingestDocument() {
    if (!ingestFile) return
    const isGeneral = ingestEffectiveType() === 'general'

    if (isGeneral) {
      if (!docForm.title.trim()) { setIngestMsg('Title is required.'); return }
      if (docForm.type === 'other' && !otherTypeLabel.trim()) { setIngestMsg('Please specify what type this document is.'); return }
      if (!docForm.doc_category) { setIngestMsg('Please select a category.'); return }
    }

    setIngesting(true)
    setIngestMsg('')
    setIngestResult(null)

    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const form = new FormData()
    form.append('file', ingestFile)
    if (adminStaffId) form.append('uploaded_by', adminStaffId)
    form.append('doc_type_override', ingestEffectiveType())

    if (isGeneral) {
      const finalType = docForm.type === 'other'
        ? otherTypeLabel.trim().toLowerCase().replace(/\s+/g, '_')
        : docForm.type
      form.append('title', docForm.title)
      form.append('type', finalType)
      form.append('visibility', docForm.visibility)
      if (docForm.event_id) form.append('event_id', docForm.event_id)
      if (docForm.source_url.trim()) form.append('source_url', docForm.source_url.trim())
      form.append('doc_category', docForm.doc_category)
      if (docForm.workspace_id) form.append('workspace_id', docForm.workspace_id)
      if (supersedesDoc) form.append('supersedes_id', supersedesDoc.id)
      if (versionNote) form.append('version_note', versionNote)
    }

    try {
      const res  = await fetch('/api/kb/ingest', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setIngestMsg(data.error ?? 'Ingestion failed. Please try again.')
      } else {
        setIngestMsg('')
        setIngestResult(data)
        setIngestFile(null)
        if (data.gap_session_id && Array.isArray(data.gaps) && data.gaps.length > 0) {
          setGapSessions(prev => ({
            ...prev,
            [data.document.id]: {
              id: data.gap_session_id,
              document_id: data.document.id,
              processor_type: data.detected_type,
              gaps: data.gaps.map((g: Gap) => ({ ...g, status: 'unresolved' })),
              resolved: false,
            },
          }))
        }
        if (data.detected_type === 'general') {
          const wasSavingNewType = saveAsNewType
          resetGeneralDocForm()
          if (wasSavingNewType) fetchCustomDocTypes()
        } else {
          setIngestTypeChoice(null)
          setIngestIntent(null)
        }
        setShowIngestForm(false)
        fetchPendingDocs()
      }
    } catch {
      setIngestMsg('Could not reach the server. Check your connection and try again.')
    }
    setIngesting(false)
  }

  async function publishPendingDoc(documentId: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const title = ingestResult?.document.id === documentId ? ingestResult.document.title : pendingDocs.find(d => d.id === documentId)?.title
    setReviewingId(documentId)
    const res = await fetch('/api/documents/review', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId, reviewer_id: adminStaffId, action: 'approve' }),
    })
    if (ingestResult?.document.id === documentId) setIngestResult(null)
    setReviewingId(null)
    if (res.ok) {
      setDocActionMsg(`✓ Published${title ? ` "${title}"` : ''} to the Knowledge Base — it's now live.`)
      window.setTimeout(() => setDocActionMsg(''), 6000)
    }
    fetchPendingDocs()
    fetchDocs()
  }

  async function rejectPendingDoc(documentId: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const title = ingestResult?.document.id === documentId ? ingestResult.document.title : pendingDocs.find(d => d.id === documentId)?.title
    setReviewingId(documentId)
    const res = await fetch('/api/documents/review', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId, reviewer_id: adminStaffId, action: 'reject', note: 'Rejected from Knowledge Base ingestion review.' }),
    })
    if (ingestResult?.document.id === documentId) setIngestResult(null)
    setReviewingId(null)
    if (res.ok) {
      setDocActionMsg(`Rejected${title ? ` "${title}"` : ''} — it will not be published.`)
      window.setTimeout(() => setDocActionMsg(''), 6000)
    }
    fetchPendingDocs()
  }

  // ── Self-learning gap detection ─────────────────────────────────────────────
  async function fetchGapSession(documentId: string) {
    const res  = await fetch(`/api/kb/gaps?document_id=${documentId}`)
    const data = await res.json().catch(() => ({}))
    if (data?.session) setGapSessions(prev => ({ ...prev, [documentId]: data.session }))
  }

  async function fetchPendingGapSessions() {
    setPendingGapsLoading(true)
    const res  = await fetch('/api/kb/gaps?pending=1')
    const data = await res.json().catch(() => ({}))
    setPendingGapSessions(Array.isArray(data?.sessions) ? data.sessions : [])
    setPendingGapsLoading(false)
  }

  async function fetchKbAccess() {
    setKbAccessLoading(true)
    const res  = await fetch('/api/kb/access')
    const data = await res.json().catch(() => ([]))
    setKbAccessGrants(Array.isArray(data) ? data : [])
    setKbAccessLoading(false)
  }

  async function grantKbAccess() {
    if (!kbGrantStaffId) { setKbGrantMsg('Select a staff member first.'); return }
    setKbGrantMsg('')
    const res = await fetch('/api/kb/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: kbGrantStaffId, tier: kbGrantTier }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setKbGrantMsg(data.error ?? 'Could not grant access.'); return }
    setKbGrantStaffId('')
    fetchKbAccess()
  }

  async function revokeKbAccess(grantId: string) {
    await fetch(`/api/kb/access/${grantId}`, { method: 'DELETE' })
    fetchKbAccess()
  }

  function startGapWizard(mode: 'ingest' | 'review', documentId: string, sessionId: string, gapIds: string[]) {
    setGapWizard({
      mode, documentId, sessionId, gapIds, cursor: 0, step: 1,
      selectedOption: '', otherText: '', importance: '', fieldChoice: 'suggested', customFieldName: '',
      resolutions: [], submitting: false, msg: '',
    })
  }

  async function submitGapResolutions(sessionId: string, documentId: string, resolutions: GapResolution[], mode: 'ingest' | 'review') {
    setGapWizard(prev => prev ? { ...prev, submitting: true, msg: '' } : prev)
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    try {
      const res = await fetch('/api/kb/gaps/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, admin_staff_id: adminStaffId, resolutions }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setGapWizard(prev => prev ? { ...prev, submitting: false, msg: data.error ?? 'Could not save your answers. Please try again.' } : prev)
        return
      }
    } catch {
      setGapWizard(prev => prev ? { ...prev, submitting: false, msg: 'Could not reach the server. Please try again.' } : prev)
      return
    }
    setGapSessions(prev => { const next = { ...prev }; delete next[documentId]; return next })
    setGapWizard(null)
    if (mode === 'ingest') {
      await publishPendingDoc(documentId)
    } else {
      fetchPendingGapSessions()
    }
  }

  function gapWizardResetStep(w: GapWizardState): GapWizardState {
    return { ...w, step: 1, selectedOption: '', otherText: '', importance: '', fieldChoice: 'suggested', customFieldName: '' }
  }

  function finishCurrentGap(resolution: GapResolution) {
    if (!gapWizard) return
    const resolutions = [...gapWizard.resolutions, resolution]
    const cursor = gapWizard.cursor + 1
    setGapWizard(gapWizardResetStep({ ...gapWizard, resolutions, cursor }))
    if (gapWizard.mode === 'review' && cursor >= gapWizard.gapIds.length) {
      submitGapResolutions(gapWizard.sessionId, gapWizard.documentId, resolutions, 'review')
    }
  }

  function gapWizardChooseImportance(gap: GapItem, choice: 'always' | 'optional' | 'no') {
    if (!gapWizard) return
    if (choice === 'no') {
      finishCurrentGap({ gap_id: gap.id, action: 'skip' })
    } else {
      setGapWizard({ ...gapWizard, importance: choice, step: 3 })
    }
  }

  function gapWizardConfirmField(gap: GapItem) {
    if (!gapWizard) return
    const fieldName = gapWizard.fieldChoice === 'custom' && gapWizard.customFieldName.trim()
      ? gapWizard.customFieldName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      : gap.suggested_field_name
    const description = gapWizard.selectedOption === '__other__'
      ? (gapWizard.otherText.trim() || gap.description)
      : (gapWizard.selectedOption || gap.description)
    finishCurrentGap({
      gap_id: gap.id,
      action: 'add_to_processor',
      field_name: fieldName,
      field_description: description,
      field_category: gap.suggested_category,
      is_required: gapWizard.importance === 'always',
      example_value: gap.example_value,
    })
  }

  function gapWizardSkipGap(gap: GapItem) {
    finishCurrentGap({ gap_id: gap.id, action: 'pending' })
  }

  function gapWizardBack() {
    if (!gapWizard) return
    setGapWizard({ ...gapWizard, step: (Math.max(1, gapWizard.step - 1) as 1 | 2 | 3) })
  }

  function dismissPendingGap(session: GapSession, gap: GapItem) {
    submitGapResolutions(session.id, session.document_id, [{ gap_id: gap.id, action: 'skip' }], 'review')
  }

  // ── Press Intelligence ──────────────────────────────────────────────────────
  async function fetchIntelSources() {
    const res  = await fetch('/api/kb/intel/sources')
    const data = await res.json()
    setIntelSources(Array.isArray(data) ? data : [])
  }

  async function fetchIntelPending() {
    const res  = await fetch('/api/kb/intel/items?status=pending&limit=100')
    const data = await res.json()
    setIntelPendingItems(data.items ?? [])
  }

  async function fetchIntelItems(pageOverride?: number) {
    const page = pageOverride ?? intelItemsPage
    const params = new URLSearchParams()
    if (intelItemsFilter.status !== 'all') params.set('status', intelItemsFilter.status)
    if (intelItemsFilter.source_id) params.set('source_id', intelItemsFilter.source_id)
    if (intelItemsFilter.search) params.set('search', intelItemsFilter.search)
    params.set('limit', '20')
    params.set('offset', String(page * 20))
    const res  = await fetch(`/api/kb/intel/items?${params}`)
    const data = await res.json()
    setIntelItems(data.items ?? [])
    setIntelItemsTotal(data.total ?? 0)
    setIntelItemsPage(page)
  }

  async function fetchIntelRuns() {
    const res  = await fetch('/api/kb/intel/runs')
    const data = await res.json()
    setIntelRuns(Array.isArray(data) ? data : [])
  }

  async function fetchIntelConfig() {
    const res  = await fetch('/api/kb/intel/config')
    const data = await res.json()
    if (!data?.error) {
      setIntelConfig(data)
      setIntelThresholds({ auto_publish_threshold: data.auto_publish_threshold ?? 75, review_threshold: data.review_threshold ?? 40 })
    }
  }

  async function fetchIntelAll() {
    setIntelLoading(true)
    await Promise.all([fetchIntelSources(), fetchIntelPending(), fetchIntelRuns(), fetchIntelConfig()])
    setIntelLoading(false)
  }

  async function runIntelNow() {
    setIntelRunning(true); setIntelMsg('')
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    try {
      const res  = await fetch('/api/kb/intel/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_staff_id: adminStaffId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setIntelMsg(data.error ?? 'Run failed.'); setIntelRunning(false); return }
      // The pipeline runs in the background (a full run can take several minutes) —
      // poll run history until this run leaves 'running' instead of waiting on the request.
      setIntelMsg('Run started — this can take a few minutes for all sources. Refreshing status…')
      const runId = data.run_id
      let attempts = 0
      const poll = async () => {
        attempts++
        await fetchIntelRuns()
        await fetchIntelPending()
        const latest = (await (await fetch('/api/kb/intel/runs')).json())?.find((r: { id: string }) => r.id === runId)
        if (latest && latest.status !== 'running') {
          setIntelMsg(`Done. ${latest.items_auto_published} auto-published, ${latest.items_queued} queued for review, ${latest.items_skipped} skipped.`)
          setIntelRunning(false)
        } else if (attempts >= 40) {
          setIntelMsg('Still running — check Run History below for progress.')
          setIntelRunning(false)
        } else {
          setTimeout(poll, 8000)
        }
      }
      setTimeout(poll, 8000)
    } catch {
      setIntelMsg('Could not reach the server.')
      setIntelRunning(false)
    }
  }

  async function approveIntelItem(id: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const res = await fetch(`/api/kb/intel/items/${id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId }),
    })
    if (res.ok) { setIntelPendingItems(p => p.filter(i => i.id !== id)); fetchIntelItems() }
  }

  async function rejectIntelItem(id: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const res = await fetch(`/api/kb/intel/items/${id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId }),
    })
    if (res.ok) { setIntelPendingItems(p => p.filter(i => i.id !== id)); fetchIntelItems() }
  }

  async function saveIntelThresholds() {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    await fetch('/api/kb/intel/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId, ...intelThresholds }),
    })
    fetchIntelConfig()
  }

  async function toggleIntelEnabled() {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    await fetch('/api/kb/intel/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId, is_enabled: !intelConfig?.is_enabled }),
    })
    fetchIntelConfig()
  }

  async function saveIntelSource() {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const category   = showIntelSourceForm
    const sourceType = category === 'press_media' ? 'search_query' : 'direct_url'
    if (!category) return
    if (!intelSourceForm.name.trim() || (sourceType === 'search_query' ? !intelSourceForm.query.trim() : !intelSourceForm.url.trim())) {
      setIntelSourceMsg(`Name and ${sourceType === 'search_query' ? 'search query' : 'URL'} are required.`); return
    }
    const config = sourceType === 'search_query' ? { query: intelSourceForm.query.trim() } : { url: intelSourceForm.url.trim() }
    const res = editingIntelSourceId
      ? await fetch(`/api/kb/intel/sources/${editingIntelSourceId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_staff_id: adminStaffId, name: intelSourceForm.name.trim(), config,
            crawl_frequency: intelSourceForm.crawl_frequency, crawl_behaviour: intelSourceForm.crawl_behaviour,
          }),
        })
      : await fetch('/api/kb/intel/sources', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_staff_id: adminStaffId, name: intelSourceForm.name.trim(), source_type: sourceType, category, config,
            crawl_frequency: intelSourceForm.crawl_frequency, crawl_behaviour: intelSourceForm.crawl_behaviour,
          }),
        })
    if (res.ok) {
      setShowIntelSourceForm(false)
      setEditingIntelSourceId(null)
      setIntelSourceForm({ name: '', url: '', query: '', crawl_behaviour: 'article_discovery', crawl_frequency: 'weekly' })
      setIntelSourceMsg('')
      fetchIntelSources()
    } else {
      const data = await res.json().catch(() => ({}))
      setIntelSourceMsg(data.error ?? 'Could not save source.')
    }
  }

  function startEditIntelSource(source: IntelSource) {
    setEditingIntelSourceId(source.id)
    setIntelSourceForm({
      name: source.name, url: source.config.url ?? '', query: source.config.query ?? '',
      crawl_behaviour: source.crawl_behaviour, crawl_frequency: source.crawl_frequency,
    })
    setIntelSourceMsg('')
    setShowIntelSourceForm(source.category as 'owned_property' | 'partner_govt' | 'press_media')
  }

  async function toggleIntelSourceActive(source: IntelSource) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    await fetch(`/api/kb/intel/sources/${source.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId, is_active: !source.is_active }),
    })
    fetchIntelSources()
  }

  async function deleteIntelSource(id: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    await fetch(`/api/kb/intel/sources/${id}?admin_staff_id=${adminStaffId}`, { method: 'DELETE' })
    fetchIntelSources()
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

  async function confirmDeleteDoc() {
    if (!deletingDoc || deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    const res = await fetch(`/api/documents/list?id=${deletingDoc.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      setDocActionMsg(`✓ Removed "${deletingDoc.title}" from the Knowledge Base.`)
      window.setTimeout(() => setDocActionMsg(''), 6000)
      setDeletingDoc(null)
      setDeleteConfirmText('')
      fetchDocs()
    } else {
      setDocActionMsg('Could not remove the document. Please try again.')
    }
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
          if (session.sid !== 'super-admin') {
            fetch(`/api/hr/staff?id=${session.sid}`).then(r => r.json()).then(s => { if (s?.name) setStaffName(s.name) }).catch(() => {})
          } else { setStaffName('Super Admin') }
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

  // AIRS calculation per entity (dept/office/person)
  function calcAIRS(params: {
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

  // AIRS tier label + color
  function airsTier(score: number) {
    if (score >= 75) return { label: 'AI-Forward',  color: '#166534', desc: 'Deploy automations now' }
    if (score >= 55) return { label: 'AI-Ready',    color: '#0E7490', desc: 'Train + deploy in parallel' }
    if (score >= 35) return { label: 'AI-Aware',    color: '#92400E', desc: '90-day foundation plan' }
    if (score >= 15) return { label: 'AI-Curious',  color: '#C2410C', desc: 'Awareness + pilot needed' }
    return               { label: 'AI-Unaware',   color: '#991B1B', desc: 'Start from literacy basics' }
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
  const orgScore = allAssessedScores.length > 0
    ? Math.round(allAssessedScores.reduce((a, b) => a + b, 0) / allAssessedScores.length)
    : 0
  const orgTier = airsTier(orgScore)

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

  // Legacy compat for existing readiness dist block
  const deptScores   = sortedDeptAirs.map(d => ({ dept: d.dept, avg: d.score / 20, count: d.interviewed }))
  const officeScores = officeAirs.map(o => ({ ...o, avg: o.score / 20 }))

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
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ width: '56px', height: '56px', background: '#00A5A320', border: '2px solid #00A5A3', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', marginBottom: '8px' }}>Admin Access</h1>
          <p style={{ fontSize: '13px', color: '#5B7080', marginBottom: '32px' }}>Event Pilot — Leadership Dashboard</p>
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
                  <div style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.4px', lineHeight: 1.1 }}>Welcome to Event Pilot</div>
                </div>
              </div>

              <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.75, margin: '0 0 28px' }}>
                Event Pilot is Trescon&apos;s internal AI readiness platform — measuring where every employee stands today and moving them forward through structured, role-specific learning.
              </p>

              {/* Feature tiles — 3 column grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '28px' }}>
                {[
                  {
                    color: '#00897B',
                    bg: 'rgba(0,165,163,0.1)',
                    border: 'rgba(0,165,163,0.25)',
                    icon: <svg width="18" height="18" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
                    title: 'AI Readiness Score',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
          {loading && <span style={{ fontSize: '12px', color: '#00897B', whiteSpace: 'nowrap' }}>Updating...</span>}
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00897B', animation: 'pulse 2s infinite', marginRight: '4px' }} title="Live — updates in real time" />
          <Link href={adminStaffId ? `/dashboard?id=${adminStaffId}` : '/dashboard'} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '12px', fontWeight: 700, padding: '7px 11px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            My Dashboard
          </Link>
          <Link href="/admin/toolkit" style={{ background: '#00897B', border: '1px solid #00897B', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, padding: '7px 11px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            Toolkit
          </Link>
          <Link href="/hr" style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '12px', fontWeight: 700, padding: '7px 11px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            HR
          </Link>
          <Link href="/finance" style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '12px', fontWeight: 700, padding: '7px 11px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Finance
          </Link>
          <Link href="/timesheets" style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '12px', fontWeight: 700, padding: '7px 11px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Timesheets
          </Link>
          <Link href="/admin/org-chart" style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', color: '#374151', fontSize: '12px', fontWeight: 700, padding: '7px 11px', borderRadius: '10px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="4" rx="1"/><rect x="1" y="14" width="6" height="4" rx="1"/><rect x="9" y="14" width="6" height="4" rx="1"/><rect x="17" y="14" width="6" height="4" rx="1"/><line x1="4" y1="14" x2="4" y2="11"/><line x1="12" y1="14" x2="12" y2="6"/><line x1="20" y1="14" x2="20" y2="11"/><line x1="4" y1="11" x2="20" y2="11"/></svg>
            Org Chart
          </Link>
          <div style={{ width: '1px', height: '20px', background: '#DDE8EE', margin: '0 2px' }} />
          {/* Help dropdown — platform support items */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMoreMenu(!showMoreMenu)}
              style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Help & Support">
              <svg width="16" height="16" fill="none" stroke="#5B7080" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>
            {showMoreMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowMoreMenu(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '6px', zIndex: 999, minWidth: 200 }}>
                  <div style={{ padding: '6px 12px 4px', fontSize: '10px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Support</div>
                  <Link href="/admin/reviews" onClick={() => setShowMoreMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', textDecoration: 'none', color: '#374151', fontSize: '13px', fontWeight: 600 }}>
                    <svg width="14" height="14" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Platform Feedback
                  </Link>
                  <button onClick={() => { setShowMoreMenu(false); setShowRoadmap(true); setSuggSent(false); setSuggText(''); fetch('/api/build-log').then(r => r.json()).then(data => { if (Array.isArray(data)) setBuildLog(data) }).catch(() => {}) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
                    <svg width="14" height="14" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    Platform Updates
                  </button>
                  <Link href="/docs" onClick={() => setShowMoreMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', textDecoration: 'none', color: '#374151', fontSize: '13px', fontWeight: 600 }}>
                    <svg width="14" height="14" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    Docs
                  </Link>
                </div>
              </>
            )}
          </div>
          {/* Avatar dropdown — account actions */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowAvatarMenu(!showAvatarMenu)}
              style={{ width: '34px', height: '34px', borderRadius: '50%', border: '2px solid #00897B', background: '#00897B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, fontFamily: 'inherit' }}
              title="Account">
              {(staffName ?? 'A').charAt(0).toUpperCase()}
            </button>
            {showAvatarMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowAvatarMenu(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '6px', zIndex: 999, minWidth: 180 }}>
                  <div style={{ padding: '8px 12px 6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{staffName ?? 'Admin'}</div>
                    <div style={{ fontSize: '11px', color: '#5B7080', marginTop: '2px' }}>Super Admin</div>
                  </div>
                  <div style={{ height: '1px', background: '#DDE8EE', margin: '4px 8px' }} />
                  <button onClick={async () => { try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* ignore */ }; localStorage.removeItem('eventpilot_staff_id'); localStorage.removeItem('tai_staff_id'); sessionStorage.removeItem('tai_admin_authed'); sessionStorage.removeItem('tai_admin_staff_id'); window.location.href = '/login' }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#FF6B6B', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
                    <svg width="14" height="14" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
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
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#0F1923', margin: 0 }}>Admin Dashboard</h1>
            <p style={{ fontSize: '13px', color: '#5B7080', margin: '6px 0 0' }}>
              Live org intelligence — AI readiness, learning progress, and staff development across all offices.
            </p>
          </div>
          <div />
        </div>

        {/* ── Tabs ── */}
        {(() => {
          const TAB_ACCENT: Record<string, string> = {
            overview:     '#00897B',
            people:       '#0E7490',
            intelligence: '#A478FF',
            learning:     '#00897B',
            suggest:      '#A478FF',
            events:       '#00897B',
            knowledge:    '#166534',
            review:       '#991B1B',
            security:     '#1D4ED8',
            toolkit:      '#00695C',
            docuhub:      '#7C3AED',
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
                ['knowledge',    'Knowledge Base'],
                ['docuhub',      'DocuHub'],
                ...(isSuperAdmin ? [['review', 'Review Queue']] : []),
                ...(isSuperAdmin ? [['security', 'Security']] : []),
              ] as [typeof tab, string][]).map(([t, label]) => {
                const accent  = TAB_ACCENT[t] ?? '#00897B'
                const active  = tab === t
                return (
                  <button key={t}
                    id={t === 'intelligence' ? 'tour-intelligence-tab' : t === 'suggest' ? 'tour-studio-tab' : undefined}
                    onClick={() => { if (t === 'toolkit') { window.location.href = '/admin/toolkit'; return; } if (t === 'docuhub') { window.location.href = '/docuhub'; return; } setTab(t as typeof tab); syncAdminUrl(t, t === 'knowledge' ? docSubTab : undefined); if (t === 'learning') fetchLearning(); if (t === 'people') { fetchStaffList(); markProgress('staff') } if (t === 'events') { fetchEvents(); fetchEventSummaries(); } if (t === 'knowledge') { fetchDocs(); fetchCustomDocTypes(); fetchWorkspaces(); fetchPendingDocs(); if (staffList.length === 0) fetchStaffList(); fetchIntelAll(); fetchPendingGapSessions(); } if (t === 'review') fetchDrafts(); if (t === 'suggest') markProgress('course'); if (t === 'security') fetchSecurity() }}
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
                { key: 'course', label: 'Build your first course in Learning Lab', action: () => { setTab('suggest'); markProgress('course') }, tab: 'Learning Lab' },
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
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderTop: `4px solid ${assessedAvg > 0 ? assessedTier.color : '#5B7080'}`, borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>AI Readiness Score</div>
              <Link href="/docs" style={{ fontSize: '11px', color: '#00897B', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                How it works
                <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: assessedAvg > 0 ? assessedTier.color : '#B8CDD8', lineHeight: 1 }}>{assessedAvg > 0 ? assessedAvg : '—'}</span>
              {assessedAvg > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: assessedTier.color, lineHeight: 1.2 }}>{assessedTier.label}</div>
                  <div style={{ fontSize: '12px', color: '#2D3E50', fontWeight: 600, marginTop: '4px' }}>{assessedTier.desc}</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#5B7080', fontWeight: 600, marginBottom: '6px' }}>
              {assessedAvg > 0 ? `Avg of ${profilesComplete} assessed · Target 60+ · out of 100` : 'No assessments completed yet'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ flex: 1, height: '5px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${participationPct}%`, background: participationPct >= 50 ? '#00897B' : participationPct >= 20 ? '#D97706' : '#DC2626', borderRadius: '3px', transition: 'width 0.6s' }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: participationPct >= 50 ? '#00897B' : participationPct >= 20 ? '#D97706' : '#DC2626', whiteSpace: 'nowrap' }}>{participationPct}% assessed</span>
            </div>
          </div>
        </div>




        {/* ══ AIRS — Org Score ══ */}
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
                tierCounts[airsTier(score).label] = (tierCounts[airsTier(score).label] ?? 0) + 1
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
                  <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                    {/* Header + filters */}
                    <div style={{ padding: '18px 20px', borderBottom: '1px solid #DDE8EE' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>Department Readiness</div>
                          <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '2px' }}>
                            {visibleDepts.length} of {sortedDeptAirs.length} departments
                            {deptTierFilter !== 'all' && <span style={{ color: '#5B7080' }}> · filtered by <strong style={{ color: '#0F1923' }}>{deptTierFilter}</strong></span>}
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
                              style={{ padding: '4px 10px', borderRadius: '16px', border: `1px solid ${active ? f.color : '#DDE8EE'}`, background: active ? `${f.color}18` : 'transparent', color: active ? f.color : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                              {f.label}
                              {f.id !== 'all' && count > 0 && <span style={{ fontSize: '9px', opacity: 0.7 }}>{count}</span>}
                            </button>
                          )
                        })}
                        <div style={{ width: '1px', background: '#DDE8EE', margin: '0 2px' }} />
                        {PRIORITY_FILTERS.map(f => {
                          const active = deptTierFilter === f.id
                          const count  = sortedDeptAirs.filter(d => d.impact.priority === f.id).length
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
                          const tier        = airsTier(d.score)
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
                    const oData  = officeAirs.find(x => x.id === o.id)
                    const joined = officeMap[o.id]?.count ?? 0
                    const tier   = oData ? airsTier(oData.score) : null
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: tier.color }}>AIRS {oData.score}</span>
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
                        const tier = airsTier(person.toars)
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

        {/* ── Toolkit Banner (overview only) ── */}
        {tab === 'overview' && (
          <div style={{ marginBottom: '28px' }}>
            <Link href="/admin/toolkit"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0F1923', borderRadius: '16px', padding: '22px 28px', textDecoration: 'none', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(192,244,60,0.12)', border: '1px solid rgba(192,244,60,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" fill="none" stroke="#C0F43C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#C0F43C', marginBottom: '4px' }}>Internal Tools</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#FFFFFF' }}>The Toolkit</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>Website Builder · DRT · Outreach · Smart Data — authorised team members only</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#C0F43C', fontSize: '13px', fontWeight: 800, flexShrink: 0 }}>
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
          const LEVEL_COLOR: Record<string,string> = { super_admin:'#166534', office_head:'#0E7490', dept_head:'#7C3AED', team_lead:'#92400E', staff:'#5B7080' }

          const allPeople = staffList.map(s => {
            const member  = memberById[s.id]
            const tData   = memberTairs[s.id]
            const score   = tData?.score ?? null
            const tTier   = score !== null ? airsTier(score) : null
            const tColor  = tTier ? { color: tTier.color, bg: `${tTier.color}15` } : null
            return { ...s, access_enabled: (s as {access_enabled?:boolean}).access_enabled ?? false, profile_complete: member?.profile_complete ?? false, joined_at: member?.joined_at ?? null, airs_score: score, tier_label: tTier?.label ?? null, tier_color: tColor }
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
                  <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1fr 1.2fr 1.1fr 180px', padding: '10px 20px', background: '#E8EEF4', borderBottom: '1px solid #DDE8EE' }}>
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
                      <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1fr 1.2fr 1.1fr 180px', alignItems: 'center', padding: '12px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid #E8EEF4' : 'none' }}>
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
                        {/* Platform Status + Access Roles */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor, background: statusBg, padding: '3px 8px', borderRadius: '6px', width: 'fit-content' }}>{statusLabel}</span>
                          {p.joined_at && <div style={{ fontSize: '10px', color: '#B8CDD8', fontWeight: 600 }}>Joined {new Date(p.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '1px' }}>
                            {(p.access_roles ?? ['standard']).map(r => {
                              const rc = ROLE_META[r] ?? ROLE_META.standard
                              return <span key={r} style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: rc.bg, color: rc.color, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{rc.label}</span>
                            })}
                          </div>
                        </div>
                        {/* AI Score */}
                        <div>
                          {p.airs_score !== null && p.tier_color ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '18px', fontWeight: 900, color: p.tier_color.color, lineHeight: 1 }}>{p.airs_score}</span>
                              <span style={{ fontSize: '9px', fontWeight: 700, color: p.tier_color.color, background: p.tier_color.bg, padding: '2px 5px', borderRadius: '4px' }}>{p.tier_label}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#B8CDD8' }}>—</span>
                          )}
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button onClick={async () => {
                            await fetch('/api/staff-access', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, enabled: !p.access_enabled }) })
                            fetchStaffList()
                          }} style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${p.access_enabled ? '#DDE8EE' : 'rgba(22,101,52,0.3)'}`, background: p.access_enabled ? '#FFFFFF' : 'rgba(22,101,52,0.07)', color: p.access_enabled ? '#5B7080' : '#166534', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            {p.access_enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => {
                            setRolesStaff(p)
                            setRolesEdit(p.access_roles ?? ['standard'])
                            setRolesOpen(true)
                          }} title="Edit access roles" style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
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
                          }} title="Manage tool permissions" style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: 'pointer' }}>
                            {PLATFORM_TOOLS.map(tool => {
                              const g: Record<string,boolean> = { ...(p.tool_grants ?? {}), smart_data: p.toolkit_access ?? false }
                              const granted = p.job_level === 'super_admin' || (g[tool.key] ?? false)
                              return <div key={tool.key} style={{ width: '7px', height: '7px', borderRadius: '50%', background: granted ? tool.color : '#E2E8F0', flexShrink: 0 }} />
                            })}
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

              {/* ── Live Now strip ───────────────────────────────────────── */}
              {activeUsers.length > 0 && (
                <div style={{ marginTop: '24px', background: 'linear-gradient(135deg, rgba(0,137,123,0.06) 0%, rgba(14,116,144,0.06) 100%)', border: '1px solid rgba(0,137,123,0.2)', borderRadius: '14px', padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00897B', boxShadow: '0 0 0 3px rgba(0,137,123,0.25)', animation: 'pulse 2s ease-in-out infinite' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#00697B', textTransform: 'uppercase', letterSpacing: '1px' }}>Live Now — {activeUsers.length} {activeUsers.length === 1 ? 'person' : 'people'} on the platform</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {activeUsers.map(u => {
                      const m   = u.staff_members
                      const off = getOffice(m.office_id ?? '')
                      const mins = Math.floor((Date.now() - new Date(u.last_seen_at).getTime()) / 60000)
                      return (
                        <div key={u.staff_id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px 6px 8px', borderRadius: '20px', background: '#FFFFFF', border: '1px solid rgba(0,137,123,0.25)' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: `${off?.color ?? '#00897B'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: off?.color ?? '#00897B' }}>{m.name.charAt(0)}</span>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F1923', lineHeight: 1.2 }}>{m.name}</div>
                            <div style={{ fontSize: '10px', color: '#5B7080' }}>{mins === 0 ? 'just now' : `${mins}m ago`}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Login Activity ───────────────────────────────────────── */}
              <div style={{ marginTop: '24px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(14,116,144,0.08)', border: '1px solid rgba(14,116,144,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" fill="none" stroke="#0E7490" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Login Activity</div>
                      <div style={{ fontSize: '11px', color: '#5B7080' }}>
                        {(() => {
                          const enabled   = allPeople.filter(p => p.access_enabled)
                          const loggedIn  = enabled.filter(p => p.last_login_at)
                          const neverIn   = enabled.filter(p => !p.last_login_at)
                          return `${loggedIn.length} of ${enabled.length} enabled staff have logged in · ${neverIn.length} never logged in`
                        })()}
                      </div>
                    </div>
                  </div>
                  <button onClick={fetchActiveUsers} style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Refresh
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1.4fr 90px 80px', padding: '8px 20px', background: '#E8EEF4', borderBottom: '1px solid #DDE8EE' }}>
                  {['Name', 'Department / Role', 'Office', 'Last Login (Dubai)', 'Sessions', ''].map(h => (
                    <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>{h}</div>
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
                          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.8fr 1fr 1.4fr 90px 80px', alignItems: 'center', padding: '10px 20px', borderBottom: idx < showRows.length - 1 ? '1px solid #E8EEF4' : 'none', background: isLive ? 'rgba(0,137,123,0.03)' : !loginAt ? 'rgba(220,38,38,0.02)' : 'transparent' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                              <div style={{ position: 'relative' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${off?.color ?? '#00897B'}18`, border: `1px solid ${off?.color ?? '#00897B'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: off?.color ?? '#00897B' }}>{p.name.charAt(0)}</span>
                                </div>
                                {isLive && <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: '#00897B', border: '1.5px solid #FFFFFF' }} />}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                                <div style={{ fontSize: '11px', color: '#5B7080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                              </div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.department ?? '—'}</div>
                              <div style={{ fontSize: '11px', color: '#5B7080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.role ?? '—'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: off?.color ?? '#B8CDD8', flexShrink: 0 }} />
                              <span style={{ fontSize: '12px', fontWeight: 700, color: off?.color ?? '#5B7080' }}>{off?.label ?? '—'}</span>
                            </div>
                            <div>
                              {isLive ? (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#00697B', background: 'rgba(0,137,123,0.1)', padding: '2px 8px', borderRadius: '5px' }}>Live now</span>
                              ) : loginStr ? (
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#0E7490' }}>{loginStr}</span>
                              ) : (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', padding: '2px 8px', borderRadius: '5px' }}>Never</span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: count > 0 ? 700 : 400, color: count > 0 ? '#0F1923' : '#B8CDD8' }}>
                              {count > 0 ? `${count}×` : '—'}
                            </div>
                            <div>
                              <button onClick={() => openLoginHistory({ id: p.id, name: p.name, email: p.email })}
                                style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                History
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {loginRows.length > 50 && (
                        <div style={{ padding: '10px 20px', borderTop: '1px solid #E8EEF4', fontSize: '12px', color: '#5B7080', textAlign: 'center' }}>
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

                        {/* Col 3: AIRS individual score */}
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
                              const hasContent = t.task_description || t.ai_proof || ((t.tools_used?.length ?? 0) > 0)
                              if (!hasContent) return null
                              const detection = t.task_description ? detectAIWriting(t.task_description) : { score: 0, flags: [], verdict: '' }
                              const flagColor = detection.score >= 65 ? '#FF6B6B' : detection.score >= 45 ? '#8B1A1A' : detection.score >= 25 ? '#8B1A1A' : '#00897B'
                              return (
                                <div key={ti} style={{ background: '#F8FAFB', border: '1px solid #DDE8EE', borderRadius: '10px', padding: '16px' }}>
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
                                    <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: (t.ai_proof || (t.tools_used?.length ?? 0) > 0) ? '12px' : '0' }}>
                                      {t.task_description}
                                    </div>
                                  )}

                                  {/* AI Proof */}
                                  {t.ai_proof && (
                                    <div style={{ background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.18)', borderRadius: '8px', padding: '12px 14px', marginBottom: (t.tools_used?.length ?? 0) > 0 ? '10px' : '0' }}>
                                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#00695C', marginBottom: '6px' }}>Advanced Track — Workflow Proof</div>
                                      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.ai_proof}</div>
                                    </div>
                                  )}

                                  {/* Tools */}
                                  {(t.tools_used?.length ?? 0) > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: t.task_description || t.ai_proof ? '10px' : '0' }}>
                                      {(t.tools_used ?? []).map((tool, j) => (
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

              {/* Live Department Action Matrix */}
              <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #DDE8EE' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '3px' }}>Department Action Matrix — Live</div>
                  <div style={{ fontSize: '13px', color: '#5B7080' }}>Each department mapped to its current tier and the recommended action to take now. Updates as more staff complete interviews.</div>
                </div>
                {sortedDeptAirs.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', fontSize: '13px', color: '#5B7080' }}>No interview data yet. Seed demo data or wait for staff to complete interviews.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#FFFFFF' }}>
                          {['Department', 'AIRS', 'Tier', 'People', 'Coverage', 'AI Priority', 'AI Action', 'Owner', 'By'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5B7080', borderBottom: '1px solid #DDE8EE', whiteSpace: 'nowrap' }}>{h}</th>
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
                            <tr key={d.dept} style={{ borderBottom: i < sortedDeptAirs.length - 1 ? '1px solid #E8EEF4' : 'none', background: i === 0 ? `${tier.color}04` : 'transparent' }}>
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
              <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '16px 22px', display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
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

              {/* ── Participation section ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

                {/* Department participation rates */}
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #DDE8EE' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>Participation by Department</div>
                    <div style={{ fontSize: '13px', color: '#0F1923', marginTop: '2px' }}>% of staff who have attempted at least one course</div>
                  </div>
                  {(participation_by_dept ?? []).length === 0 ? (
                    <div style={{ padding: '28px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>No data yet</div>
                  ) : (
                    (participation_by_dept ?? []).map((d, i) => {
                      const rate = d.total > 0 ? Math.round((d.active / d.total) * 100) : 0
                      return (
                        <div key={d.dept} style={{ padding: '12px 20px', borderBottom: i < (participation_by_dept ?? []).length - 1 ? '1px solid #E8EEF4' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>{d.dept}</div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: rate >= 70 ? '#3D6B00' : rate >= 40 ? '#D97706' : '#DC2626' }}>{rate}% <span style={{ fontWeight: 400, color: '#5B7080' }}>({d.active}/{d.total})</span></div>
                          </div>
                          <div style={{ height: '5px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${rate}%`, background: rate >= 70 ? '#7DC520' : rate >= 40 ? '#F59E0B' : '#EF4444', borderRadius: '3px', transition: 'width 0.5s' }} />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Never-started summary */}
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #DDE8EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>Never Started</div>
                      <div style={{ fontSize: '13px', color: '#0F1923', marginTop: '2px' }}>Staff who have not attempted any course</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: (never_started ?? []).length > 0 ? '#DC2626' : '#3D6B00' }}>{(never_started ?? []).length}</div>
                  </div>
                  {(never_started ?? []).length === 0 ? (
                    <div style={{ padding: '28px', textAlign: 'center', color: '#3D6B00', fontSize: '13px', fontWeight: 600 }}>All active staff have started at least one course.</div>
                  ) : (
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {(never_started ?? []).slice(0, 25).map((s, i) => (
                        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: i < Math.min((never_started ?? []).length, 25) - 1 ? '1px solid #E8EEF4' : 'none' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>{s.name}</div>
                            <div style={{ fontSize: '12px', color: '#5B7080' }}>{s.role ?? '—'} · {s.department ?? '—'}</div>
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8B6914', background: '#FEF3C7', padding: '3px 8px', borderRadius: '5px', whiteSpace: 'nowrap' }}>{s.office_id}</div>
                        </div>
                      ))}
                      {(never_started ?? []).length > 25 && (
                        <div style={{ padding: '10px 20px', fontSize: '12px', color: '#5B7080', textAlign: 'center' }}>+{(never_started ?? []).length - 25} more staff not shown</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Assign a Course ── */}
              <div style={{ marginTop: '16px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#1565C0', marginBottom: '4px' }}>Course Assignment</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Assign a course to staff</div>
                  </div>
                  <svg width="18" height="18" fill="none" stroke="#1565C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </div>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Course</label>
                    <select value={assignCourseId} onChange={e => setAssignCourseId(e.target.value)}
                      style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FAFBFC', fontSize: '13px', color: '#0F1923', fontFamily: 'inherit', outline: 'none' }}>
                      <option value="">Select a course…</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.title} ({c.tier_level})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Assign to</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['dept', 'individual', 'all'] as const).map(t => (
                        <button key={t} onClick={() => setAssignTarget(t)}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${assignTarget === t ? '#1565C0' : '#DDE8EE'}`, background: assignTarget === t ? 'rgba(21,101,192,0.08)' : '#FAFBFC', color: assignTarget === t ? '#1565C0' : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {t === 'dept' ? 'Department' : t === 'individual' ? 'Individual' : 'All Staff'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {assignTarget === 'dept' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Department</label>
                      <select value={assignCourseDept} onChange={e => setAssignCourseDept(e.target.value)}
                        style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FAFBFC', fontSize: '13px', color: '#0F1923', fontFamily: 'inherit', outline: 'none' }}>
                        <option value="">Select department…</option>
                        {Array.from(new Set(ldStaff.map(s => s.department).filter(Boolean))).sort().map(d => (
                          <option key={d} value={d!}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {assignTarget === 'individual' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Staff Member</label>
                      <select value={assignCourseStaff} onChange={e => setAssignCourseStaff(e.target.value)}
                        style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FAFBFC', fontSize: '13px', color: '#0F1923', fontFamily: 'inherit', outline: 'none' }}>
                        <option value="">Select staff member…</option>
                        {ldStaff.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                          <option key={s.id} value={s.id}>{s.name} — {s.department ?? '—'} ({s.role})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {assignTarget === 'all' && (
                    <div style={{ padding: '12px 16px', background: 'rgba(21,101,192,0.05)', border: '1px solid rgba(21,101,192,0.15)', borderRadius: '10px', fontSize: '13px', color: '#1565C0' }}>
                      This will assign the course to all {ldStaff.length} active staff members.
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Due Date (optional)</label>
                    <input type="date" value={assignDueDate} onChange={e => setAssignDueDate(e.target.value)}
                      style={{ padding: '10px 13px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FAFBFC', fontSize: '13px', color: '#0F1923', fontFamily: 'inherit', outline: 'none' }} />
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
                      style={{ padding: '11px 24px', borderRadius: '10px', border: 'none', background: assigning || !assignCourseId ? '#DDE8EE' : '#1565C0', color: assigning || !assignCourseId ? '#5B7080' : '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: assigning || !assignCourseId ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {assigning ? 'Assigning…' : 'Assign Course'}
                    </button>
                    {assignMsg && (
                      <div style={{ fontSize: '13px', color: assignMsg.ok ? '#3D6B00' : '#DC2626', fontWeight: 600 }}>{assignMsg.text}</div>
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

            {/* ── Dept Course Seeding ── */}
            <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid #E8EEF4' }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '6px' }}>Dept Seeding</div>
                <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#0F1923', margin: '0 0 6px' }}>Seed Department Courses</h3>
                <p style={{ fontSize: '15px', color: '#5B7080', margin: 0, lineHeight: 1.6 }}>Generate multiple draft courses for a specific department in one go. Pilot AI builds them from Trescon context — saved as drafts for your review before publishing.</p>
              </div>

              <div style={{ background: 'rgba(0,165,163,0.05)', border: '1px solid rgba(0,165,163,0.18)', borderRadius: '16px', padding: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '14px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Department</label>
                    <select value={deptSeedDept} onChange={e => setDeptSeedDept(e.target.value)} disabled={deptSeedState === 'generating'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      {['Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations', 'HR', 'Content & Design', 'Data & Intelligence', 'Leadership'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Tier Level</label>
                    <select value={deptSeedTier} onChange={e => setDeptSeedTier(e.target.value as 'foundation' | 'adoption' | 'advanced')} disabled={deptSeedState === 'generating'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      <option value="foundation">Foundation</option>
                      <option value="adoption">Adoption</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Count</label>
                    <select value={deptSeedCount} onChange={e => setDeptSeedCount(Number(e.target.value))} disabled={deptSeedState === 'generating'}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
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
                  style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: deptSeedState === 'generating' ? '#DDE8EE' : '#00A5A3', color: deptSeedState === 'generating' ? '#5B7080' : '#ffffff', fontSize: '13px', fontWeight: 800, cursor: deptSeedState === 'generating' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {deptSeedState === 'generating' ? `Generating ${deptSeedCount} course${deptSeedCount > 1 ? 's' : ''}...` : `Generate ${deptSeedCount} Draft Course${deptSeedCount > 1 ? 's' : ''}`}
                </button>
              </div>

              {(deptSeedState === 'done' || deptSeedState === 'error') && deptSeedResult && (
                <div style={{ marginTop: '16px' }}>
                  {deptSeedResult.courses.length > 0 && (
                    <div style={{ background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.3)', borderRadius: '12px', padding: '16px 18px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#3D6B00', marginBottom: '10px' }}>{deptSeedResult.courses.length} draft course{deptSeedResult.courses.length > 1 ? 's' : ''} saved — ready for review in the Review Queue</div>
                      {deptSeedResult.courses.map(c => (
                        <div key={c.id} style={{ fontSize: '13px', color: '#5B7080', padding: '6px 0', borderTop: '1px solid rgba(192,244,60,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00A5A3', flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ color: '#0F1923', fontWeight: 700 }}>{c.title}</span>
                          <span style={{ color: '#B8CDD8' }}>·</span>
                          <span style={{ textTransform: 'capitalize' }}>{c.tier_level}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {deptSeedResult.errors && deptSeedResult.errors.length > 0 && (
                    <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '12px', padding: '14px 16px', fontSize: '13px', color: '#B91C1C' }}>
                      {deptSeedResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                  <button onClick={() => { setDeptSeedState('idle'); setDeptSeedResult(null) }}
                    style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Generate More
                  </button>
                </div>
              )}
            </div>
          </div>
        )}


        {/* ── Events tab ── */}
        {tab === 'events' && (() => {
          const TYPE_COLOR: Record<string,string> = { conference:'#00897B', summit:'#A78BFA', forum:'#60A5FA', awards:'#F59E0B', workshop:'#34D399', flagship:'#8B1A1A', managed:'#3730A3', bespoke:'#B45309', corporate:'#0F1923', others:'#B8CDD8', other:'#0F1923' }
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

          const todayStr = new Date().toISOString().slice(0, 10)
          const upcoming = events
            .filter(e => {
              if (e.status === 'completed' || e.status === 'cancelled') return false
              if (!e.event_date) return true                          // no date yet → treat as upcoming
              if (e.event_date >= todayStr) return true              // starts today or later
              if (e.end_date && e.end_date >= todayStr) return true  // multi-day, still running
              return false
            })
            .sort((a,b) => (a.event_date ?? '9999').localeCompare(b.event_date ?? '9999'))
          // Past = anything whose date has passed (incl. active events that were never delivered)
          const past = events
            .filter(e => !upcoming.includes(e))
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
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Start Date</label>
                  <input type="date" value={eventForm.event_date} onChange={e => setEventForm(p => ({ ...p, event_date: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>End Date</label>
                  <input type="date" value={eventForm.end_date} onChange={e => setEventForm(p => ({ ...p, end_date: e.target.value }))}
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

          // ── Intelligence signals ────────────────────────────────────────────
          const executionGap = upcoming.filter(ev => {
            const d = daysUntil(ev.event_date)
            const tasks = (ev.event_checklist as {count:number}[]|null)?.[0]?.count ?? 0
            const s = eventSummaries[ev.id]
            const taskDone = s?.task_done ?? 0
            // Past their date, never completed, and zero task activity
            return d !== null && d < 0 && ev.status !== 'completed' && ev.status !== 'cancelled' && tasks === 0 && taskDone === 0
          })
          const needsAttnEvents = upcoming.filter(ev => {
            const d = daysUntil(ev.event_date)
            if (d === null || d < 0) return false   // only upcoming
            const staff = (ev.event_staff as {count:number}[]|null)?.[0]?.count ?? 0
            const tasks = (ev.event_checklist as {count:number}[]|null)?.[0]?.count ?? 0
            return (d <= 45 && staff === 0) || (d <= 30 && tasks === 0)
          })
          const next30Count = upcoming.filter(ev => { const d = daysUntil(ev.event_date); return d !== null && d >= 0 && d <= 30 }).length
          const totalPlanned = upcoming.length + past.length
          const executionRate = totalPlanned > 0 ? Math.round((past.filter(e=>e.status==='completed').length / totalPlanned) * 100) : 0

          return (
            <div>
              {/* ── Intelligence header ── */}
              {events.length > 0 && (
                <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Execution gap callout */}
                  {executionGap.length > 0 && (
                    <div style={{ background: 'rgba(139,26,26,0.04)', border: '1px solid rgba(139,26,26,0.2)', borderLeft: '4px solid #8B1A1A', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ flexShrink: 0 }}>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#8B1A1A', lineHeight: 1 }}>{executionGap.length}</div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B1A1A', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>Never executed</div>
                      </div>
                      <div style={{ width: '1px', height: '40px', background: 'rgba(139,26,26,0.15)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#8B1A1A', marginBottom: '3px' }}>Planning without execution</div>
                        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.5 }}>
                          {executionGap.length} event{executionGap.length !== 1 ? 's were' : ' was'} planned and dated, but no task was ever started. Execution rate across all events: <strong style={{ color: executionRate < 30 ? '#8B1A1A' : '#D97706' }}>{executionRate}%</strong>. Planning is not delivery.
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                    <div style={{ background: needsAttnEvents.length > 0 ? 'rgba(217,119,6,0.05)' : 'rgba(61,107,0,0.05)', border: `1px solid ${needsAttnEvents.length > 0 ? 'rgba(217,119,6,0.3)' : 'rgba(61,107,0,0.2)'}`, borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: needsAttnEvents.length > 0 ? '#92400E' : '#3D6B00', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Upcoming gaps</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: needsAttnEvents.length > 0 ? '#D97706' : '#3D6B00', lineHeight: 1 }}>{needsAttnEvents.length}</div>
                      <div style={{ fontSize: '11px', color: '#8A9BAB', marginTop: '4px' }}>{needsAttnEvents.length === 0 ? 'All upcoming events staffed' : 'upcoming events with gaps'}</div>
                    </div>
                    <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#8A9BAB', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Next 30 days</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#3730A3', lineHeight: 1 }}>{next30Count}</div>
                      <div style={{ fontSize: '11px', color: '#8A9BAB', marginTop: '4px' }}>events coming up</div>
                    </div>
                    <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#8A9BAB', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Staff deployed</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F1923', lineHeight: 1 }}>{totalStaff}</div>
                      <div style={{ fontSize: '11px', color: '#8A9BAB', marginTop: '4px' }}>across active events</div>
                    </div>
                    <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#8A9BAB', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Execution rate</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: executionRate < 30 ? '#8B1A1A' : executionRate < 60 ? '#D97706' : '#3D6B00', lineHeight: 1 }}>{executionRate}%</div>
                      <div style={{ fontSize: '11px', color: '#8A9BAB', marginTop: '4px' }}>{past.filter(e=>e.status==='completed').length} of {totalPlanned} events completed</div>
                    </div>
                  </div>
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
                        {v === 'upcoming' ? `Active & Upcoming (${upcoming.length})` : `Past Events (${past.length})`}
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setShowCreateEvent(s => !s)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: showCreateEvent ? '#DDE8EE' : '#00897B', color: showCreateEvent ? '#5B7080' : '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {showCreateEvent ? 'Cancel' : '+ New Event'}
                    </button>
                  </div>

                  {showCreateEvent && <div style={{ marginBottom: '24px' }}>{createForm}</div>}

                  {/* ══ UPCOMING — GROUPED INTELLIGENCE CARDS ══ */}
                  {eventView === 'upcoming' && (() => {
                    // Compute per-event signals
                    const annotated = upcoming.map(ev => {
                      const days       = daysUntil(ev.event_date)
                      const staffCount = (ev.event_staff    as {count:number}[]|null)?.[0]?.count ?? 0
                      const taskCount  = (ev.event_checklist as {count:number}[]|null)?.[0]?.count ?? 0
                      const s          = eventSummaries[ev.id]
                      const taskDone   = s?.task_done ?? 0
                      const taskTotal  = s?.task_total ?? taskCount
                      const taskPct    = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0
                      // Only flag gaps for truly upcoming events — past-date events are post-mortem territory
                      const isUpcoming = days !== null && days >= 0
                      const alerts: string[] = []
                      if (isUpcoming && staffCount === 0) alerts.push('No staff assigned')
                      if (isUpcoming && taskTotal === 0) alerts.push('No checklist yet')
                      else if (isUpcoming && days !== null && days <= 30 && taskPct < 15 && taskDone === 0) alerts.push('Tasks not started')
                      const isUrgent = (isUpcoming && days !== null && days <= 45 && staffCount === 0) ||
                                       (isUpcoming && days !== null && days <= 30 && taskTotal === 0)
                      return { ev, days, staffCount, taskTotal, taskDone, taskPct, alerts, isUrgent, s }
                    })

                    const groups = [
                      // Upcoming events with critical gaps (within 45d no staff, within 30d no checklist)
                      { key: 'attn',  label: 'Needs attention', color: '#D97706', items: annotated.filter(x => x.isUrgent) },
                      // Next 30 days, no critical gap
                      { key: 'month', label: 'Next 30 days',    color: '#3730A3', items: annotated.filter(x => !x.isUrgent && x.days !== null && x.days >= 0 && x.days <= 30) },
                      // 31–90 days out
                      { key: 'soon',  label: 'Coming up',       color: '#1565C0', items: annotated.filter(x => !x.isUrgent && x.days !== null && x.days > 30 && x.days <= 90) },
                      // No date or 90+ days
                      { key: 'later', label: 'Later',           color: '#3D6B00', items: annotated.filter(x => !x.isUrgent && (x.days === null || x.days > 90)) },
                    ]

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        {upcoming.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#8A9BAB', fontSize: '13px' }}>No upcoming or active events.</div>}
                        {groups.map(grp => grp.items.length === 0 ? null : (
                          <div key={grp.key}>
                            {/* Group header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: grp.color, flexShrink: 0 }} />
                              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: grp.color }}>{grp.label}</div>
                              <div style={{ flex: 1, height: '1px', background: '#E8EEF4' }} />
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#8A9BAB' }}>{grp.items.length} event{grp.items.length !== 1 ? 's' : ''}</div>
                            </div>
                            {/* Cards grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
                              {grp.items.map(({ ev, days, staffCount, taskTotal, taskDone, taskPct, alerts, s }) => {
                                const sc = STATUS_CFG[ev.status] ?? STATUS_CFG.planning
                                const tc = TYPE_COLOR[ev.type]   ?? '#5B7080'
                                const urgencyColor  = days === null ? '#8A9BAB' : days < 0 ? '#8B1A1A' : days <= 14 ? '#D97706' : days <= 30 ? '#3730A3' : days <= 90 ? '#1565C0' : '#3D6B00'
                                const borderColor   = days === null ? '#DDE8EE' : days < 0 ? 'rgba(139,26,26,0.2)' : days <= 14 ? 'rgba(217,119,6,0.3)' : days <= 30 ? 'rgba(55,48,163,0.2)' : '#DDE8EE'
                                // Date display — always include year; range if end_date set
                                const fmtFull  = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                const fmtShort = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                const hasEnd = ev.end_date && ev.end_date !== ev.event_date
                                const dateLabel = !ev.event_date ? 'No date set' : hasEnd
                                  ? (() => {
                                      const s = new Date(ev.event_date + 'T00:00:00')
                                      const e = new Date(ev.end_date! + 'T00:00:00')
                                      return s.getMonth() === e.getMonth()
                                        ? `${s.getDate()}–${e.getDate()} ${s.toLocaleDateString('en-GB',{month:'short'})} ${s.getFullYear()}`
                                        : `${fmtShort(ev.event_date)} – ${fmtFull(ev.end_date!)}`
                                    })()
                                  : fmtFull(ev.event_date)
                                // Upcoming: countdown is primary, date is secondary
                                // In-progress: date is primary, no countdown
                                const isPast         = days !== null && days < 0
                                const primaryLabel   = isPast ? dateLabel : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days !== null ? `In ${days}d` : dateLabel
                                const secondaryLabel = isPast ? '' : (days === 0 || days === 1) ? dateLabel : days !== null ? dateLabel : ''
                                return (
                                  <div key={ev.id} style={{ background: '#FFFFFF', border: `1px solid ${borderColor}`, borderLeft: `4px solid ${urgencyColor}`, borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Alert pills */}
                                    {alerts.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {alerts.map((a, ai) => (
                                          <span key={ai} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: 'rgba(217,119,6,0.1)', color: '#92400E', border: '1px solid rgba(217,119,6,0.2)' }}>⚠ {a}</span>
                                        ))}
                                      </div>
                                    )}
                                    {/* Name + date */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', lineHeight: 1.3 }}>{ev.name}</div>
                                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 900, color: urgencyColor, whiteSpace: 'nowrap' }}>{primaryLabel}</div>
                                        {secondaryLabel && <div style={{ fontSize: '11px', color: '#8A9BAB', whiteSpace: 'nowrap', marginTop: '2px' }}>{secondaryLabel}</div>}
                                      </div>
                                    </div>
                                    {/* Meta row */}
                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: `${tc}18`, color: tc, textTransform: 'capitalize' }}>{ev.type}</span>
                                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>{ev.status}</span>
                                      {ev.city && <span style={{ fontSize: '11px', color: '#8A9BAB' }}>{ev.city}</span>}
                                      {ev.client_name && <span style={{ fontSize: '11px', color: '#8A9BAB' }}>· {ev.client_name}</span>}
                                    </div>
                                    {/* Staff + tasks */}
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }}>
                                        <svg width="12" height="12" fill="none" stroke={staffCount === 0 ? '#D97706' : '#8A9BAB'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: staffCount === 0 ? '#D97706' : '#2D3E50' }}>{staffCount || '—'}</span>
                                        <span style={{ fontSize: '11px', color: '#8A9BAB' }}>staff</span>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        {taskTotal > 0 ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                            <div style={{ flex: 1, height: '5px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
                                              <div style={{ height: '100%', width: `${taskPct}%`, background: taskPct >= 80 ? '#3D6B00' : taskPct >= 40 ? '#D97706' : '#8B1A1A', borderRadius: '3px' }} />
                                            </div>
                                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#8A9BAB', whiteSpace: 'nowrap' }}>{taskDone}/{taskTotal}</span>
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: '11px', color: '#C0C8D0' }}>No checklist</span>
                                        )}
                                      </div>
                                    </div>
                                    {/* Revenue if available */}
                                    {s?.confirmed_revenue ? (
                                      <div style={{ fontSize: '11px', color: '#3D6B00', fontWeight: 700 }}>{fmt(s.confirmed_revenue, s.currency)} confirmed revenue</div>
                                    ) : null}
                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '5px', paddingTop: '2px' }}>
                                      <Link href={`/admin/events/${ev.id}`} style={{ flex: 1, textAlign: 'center', padding: '7px 8px', borderRadius: '7px', background: '#00897B', color: '#FFFFFF', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>Workspace</Link>
                                      <Link href={`/admin/events/${ev.id}/plan`} style={{ padding: '7px 9px', borderRadius: '7px', border: '1px solid rgba(192,244,60,0.5)', background: 'rgba(192,244,60,0.07)', color: '#3D6B00', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>Plan</Link>
                                      <Link href={`/admin/events/${ev.id}/execution`} style={{ padding: '7px 9px', borderRadius: '7px', border: '1px solid rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.07)', color: '#7C3AED', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>RACI</Link>
                                      <button onClick={() => { setSelectedEvent(ev === selectedEvent ? null : ev); if (ev !== selectedEvent) { fetchEventStaff(ev.id); fetchEventSummaries() } }}
                                        style={{ padding: '7px 9px', borderRadius: '7px', border: `1px solid ${selectedEvent?.id===ev.id ? 'rgba(0,165,163,0.4)' : '#DDE8EE'}`, background: selectedEvent?.id===ev.id ? 'rgba(0,165,163,0.08)' : 'transparent', color: selectedEvent?.id===ev.id ? '#00695C' : '#5B7080', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
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

                  {/* ══ PAST EVENTS P&L VIEW ══ */}
                  {eventView === 'past' && (
                    summariesLoading
                      ? <div style={{ textAlign: 'center', padding: '60px 0', color: '#5B7080', fontSize: '13px' }}>Loading P&L data…</div>
                      : (() => {
                          const gapEvents       = past.filter(e => e.status !== 'completed' && e.status !== 'cancelled')
                          const deliveredEvents = past.filter(e => e.status === 'completed' || e.status === 'cancelled')
                          const pastGroups = [
                            { key: 'gap',       label: 'Execution gap — dated & active, never marked complete', color: '#8B1A1A', items: gapEvents },
                            { key: 'delivered', label: 'Delivered',                                             color: '#3D6B00', items: deliveredEvents },
                          ]
                          return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                          {past.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#8A9BAB', fontSize: '13px' }}>No past events yet.</div>}
                          {pastGroups.map(grp => grp.items.length === 0 ? null : (
                            <div key={grp.key}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: grp.color, flexShrink: 0 }} />
                                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: grp.color }}>{grp.label}</div>
                                <div style={{ flex: 1, height: '1px', background: '#E8EEF4' }} />
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#8A9BAB' }}>{grp.items.length} event{grp.items.length !== 1 ? 's' : ''}</div>
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
                            </div>
                          ))}
                        </div>
                          )
                        })()
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
          const matchesCategoryFilter = (d: DocRow) => {
            if (docCategoryFilter === 'all')      return true
            if (docCategoryFilter === 'external')  return (d.doc_category ?? '').startsWith('external_')
            return d.doc_category === docCategoryFilter
          }
          const filteredDocs = docs.filter(d => {
            if (!matchesCategoryFilter(d)) return false
            if (docFilter === 'flagged')        return d.flagged
            if (docFilter === 'knowledge_base') return d.layer === 'knowledge_base'
            if (docFilter === 'general')        return d.layer === 'general'
            if (docFilter === 'specific')       return d.layer === 'specific'
            return true
          })
          const flaggedCount = docs.filter(d => d.flagged).length
          const categoryCount = (key: typeof docCategoryFilter) =>
            key === 'all' ? docs.length : key === 'external' ? docs.filter(d => (d.doc_category ?? '').startsWith('external_')).length : docs.filter(d => d.doc_category === key).length

          // General-document fields — shown inline in the Ingest form when the
          // resolved type is 'general' (not one of the 4 structured KB types).
          // Relocated from the retired standalone "Upload Document" form; same
          // fields, same state (docForm/otherTypeLabel/saveAsNewType/
          // supersedesDoc/versionNote), just no longer a separate card with
          // its own file picker/submit button — those are unified into the
          // single Ingest form now.
          const generalDocFields = (
            <div style={{ marginBottom: '14px', paddingTop: '4px', borderTop: '1px solid #E8EEF4' }}>
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
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Category</label>
                <select value={docForm.doc_category} onChange={e => setDocForm(p => ({ ...p, doc_category: e.target.value }))}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                  <option value="">Select category…</option>
                  <option value="event_intelligence">Event Intelligence</option>
                  <option value="business_development">Business Development</option>
                  <option value="project_management">Project Management</option>
                  <option value="marketing">Marketing</option>
                  <option value="company_knowledge">Company Knowledge</option>
                </select>
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
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>External Link <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional — leave blank to store the original automatically)</span></label>
                <input value={docForm.source_url} onChange={e => setDocForm(p => ({ ...p, source_url: e.target.value }))} placeholder="Only needed if the original lives elsewhere — SharePoint, Drive…"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              {(docForm.type === 'proposal' || docForm.type === 'tender') && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>BD Workspace <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</span></label>
                  <select value={docForm.workspace_id} onChange={e => setDocForm(p => ({ ...p, workspace_id: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="">Not linked to a workspace</option>
                    {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                  </select>
                </div>
              )}
              {supersedesDoc && (
                <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '9px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#1D4ED8' }}>Uploading a new version of &ldquo;{supersedesDoc.title}&rdquo; (v{supersedesDoc.version} → v{supersedesDoc.version + 1})</span>
                    <button onClick={() => { setSupersedesDoc(null); setVersionNote('') }}
                      style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                  <input value={versionNote} onChange={e => setVersionNote(e.target.value)} placeholder="What changed in this version? (optional)"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>
          )

          function renderGapWizard(session: GapSession) {
            if (!gapWizard || gapWizard.sessionId !== session.id) return null
            const total = gapWizard.gapIds.length
            const isXlsx = session.processor_type === 'attendee_data'
            const typeName = typeLabel(session.processor_type)

            if (gapWizard.cursor >= total) {
              if (gapWizard.mode === 'review') {
                // Review mode auto-submits as soon as the (single) gap is actioned — this state is
                // only visible for the instant between that submit firing and the session closing.
                return (
                  <div style={{ background: '#F0FAFA', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '14px', fontSize: '13px', color: '#5B7080' }}>
                    Saving…
                  </div>
                )
              }
              // Summary screen (ingest mode)
              const added = gapWizard.resolutions.filter(r => r.action === 'add_to_processor')
              const other = gapWizard.resolutions.filter(r => r.action !== 'add_to_processor')
              return (
                <div style={{ background: '#F0FAFA', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '10px', padding: '18px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#00695C', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>All gaps resolved</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>What I learned from this document</div>
                  {added.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '4px' }}>Added to {typeName} processor:</div>
                      {added.map(r => (
                        <div key={r.gap_id} style={{ fontSize: '13px', color: '#3D6B00', fontWeight: 700 }}>✓ {typeLabel(r.field_name ?? '')}{r.is_required ? '' : ' (optional)'}</div>
                      ))}
                    </div>
                  )}
                  {other.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '4px' }}>{gapWizard.mode === 'ingest' ? 'Skipped:' : 'Deferred:'}</div>
                      {other.map(r => {
                        const gap = session.gaps.find(g => g.id === r.gap_id)
                        return <div key={r.gap_id} style={{ fontSize: '13px', color: '#5B7080', fontWeight: 700 }}>✗ {gap ? typeLabel(gap.suggested_field_name || gap.description) : r.gap_id}</div>
                      })}
                    </div>
                  )}
                  {added.length > 0 && (
                    <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, margin: '0 0 14px' }}>
                      These new fields will be captured automatically in all future {typeName.toLowerCase()} uploads.
                    </p>
                  )}
                  {gapWizard.msg && (
                    <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', color: '#FF6B6B', marginBottom: '10px' }}>
                      {gapWizard.msg}
                    </div>
                  )}
                  <button onClick={() => submitGapResolutions(session.id, session.document_id, gapWizard.resolutions, gapWizard.mode)} disabled={gapWizard.submitting}
                    style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: gapWizard.submitting ? '#DDE8EE' : '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: gapWizard.submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {gapWizard.submitting ? 'Publishing…' : 'Publish to Knowledge Base →'}
                  </button>
                </div>
              )
            }

            const gap = session.gaps.find(g => g.id === gapWizard.gapIds[gapWizard.cursor])
            if (!gap) return null

            const step = gapWizard.step
            const gapNum = gapWizard.cursor + 1
            const step1Ready = !!gapWizard.selectedOption && (gapWizard.selectedOption !== '__other__' || !!gapWizard.otherText.trim())
            const step3Ready = gapWizard.fieldChoice === 'suggested' || !!gapWizard.customFieldName.trim()
            const radioStyle = (active: boolean) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '9px', border: `1px solid ${active ? '#00A5A3' : '#DDE8EE'}`, background: active ? 'rgba(0,165,163,0.08)' : '#FFFFFF', cursor: 'pointer', fontSize: '13px', color: '#0F1923' } as const)
            const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const }

            return (
              <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Gap {gapNum} of {total}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3].map(n => <span key={n} style={{ width: '8px', height: '8px', borderRadius: '50%', background: n <= step ? '#00A5A3' : '#DDE8EE' }} />)}
                  </div>
                </div>

                <div style={{ background: '#F0FAFA', border: '1px solid rgba(0,165,163,0.15)', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', color: '#0F1923', fontWeight: 700, marginBottom: '4px' }}>I found:</div>
                  <div style={{ fontSize: '13px', color: '#2D3E50' }}>{gap.description}</div>
                  {gap.location && <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '4px' }}>Location: {gap.location}</div>}
                </div>

                <div style={{ fontSize: '11px', fontWeight: 800, color: '#00695C', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Step {step} of 3</div>

                {step === 1 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '10px' }}>
                      {isXlsx ? `What does column "${gap.example_value}" contain?` : 'What type of information is this?'}
                    </div>
                    {gap.suggested_options.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                        {gap.suggested_options.filter(o => !/^something else/i.test(o)).map(opt => (
                          <label key={opt} style={radioStyle(gapWizard.selectedOption === opt)}>
                            <input type="radio" checked={gapWizard.selectedOption === opt} onChange={() => setGapWizard({ ...gapWizard, selectedOption: opt })} />
                            {opt}
                          </label>
                        ))}
                        <label style={radioStyle(gapWizard.selectedOption === '__other__')}>
                          <input type="radio" checked={gapWizard.selectedOption === '__other__'} onChange={() => setGapWizard({ ...gapWizard, selectedOption: '__other__' })} />
                          Something else — let me describe it
                        </label>
                      </div>
                    )}
                    {(gap.suggested_options.length === 0 || gapWizard.selectedOption === '__other__') && (
                      <input value={gapWizard.otherText} onChange={e => setGapWizard({ ...gapWizard, otherText: e.target.value, selectedOption: '__other__' })}
                        placeholder={isXlsx ? 'e.g. registration source, ticket tier, payment method' : 'Describe what this is'}
                        style={inputStyle} />
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '10px' }}>
                      Should I capture this for all future {typeName.toLowerCase()}s?
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {([
                        { key: 'always', label: 'Yes — always look for this and extract it' },
                        { key: 'optional', label: "Only when present — it's optional, not every document will have one" },
                        { key: 'no', label: "No — this was specific to this document, don't capture it again" },
                      ] as { key: 'always' | 'optional' | 'no'; label: string }[]).map(o => (
                        <label key={o.key} style={radioStyle(gapWizard.importance === o.key)}>
                          <input type="radio" checked={gapWizard.importance === o.key} onChange={() => gapWizardChooseImportance(gap, o.key)} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '10px' }}>
                      {isXlsx ? 'What should I map this column to?' : 'What should I call this field in the knowledge base?'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      <label style={radioStyle(gapWizard.fieldChoice === 'suggested')}>
                        <input type="radio" checked={gapWizard.fieldChoice === 'suggested'} onChange={() => setGapWizard({ ...gapWizard, fieldChoice: 'suggested' })} />
                        {typeLabel(gap.suggested_field_name)}
                      </label>
                      <label style={radioStyle(gapWizard.fieldChoice === 'custom')}>
                        <input type="radio" checked={gapWizard.fieldChoice === 'custom'} onChange={() => setGapWizard({ ...gapWizard, fieldChoice: 'custom' })} />
                        Use my own label
                      </label>
                    </div>
                    {gapWizard.fieldChoice === 'custom' && (
                      <input value={gapWizard.customFieldName} onChange={e => setGapWizard({ ...gapWizard, customFieldName: e.target.value })}
                        placeholder="e.g. sustainability_metric" style={inputStyle} />
                    )}
                  </div>
                )}

                {gapWizard.msg && (
                  <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', color: '#FF6B6B', marginBottom: '10px' }}>
                    {gapWizard.msg}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={gapWizardBack} disabled={step === 1}
                      style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: step === 1 ? '#B8CDD8' : '#5B7080', fontSize: '13px', fontWeight: 600, cursor: step === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      ← Back
                    </button>
                    {step === 1 && (
                      <button onClick={() => setGapWizard({ ...gapWizard, step: 2 })} disabled={!step1Ready}
                        style={{ padding: '9px 16px', borderRadius: '9px', border: 'none', background: step1Ready ? '#00A5A3' : '#DDE8EE', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: step1Ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                        Next →
                      </button>
                    )}
                    {step === 3 && (
                      <button onClick={() => gapWizardConfirmField(gap)} disabled={!step3Ready}
                        style={{ padding: '9px 16px', borderRadius: '9px', border: 'none', background: step3Ready ? '#00A5A3' : '#DDE8EE', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: step3Ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                        Confirm
                      </button>
                    )}
                  </div>
                  <button onClick={() => gapWizardSkipGap(gap)}
                    style={{ fontSize: '13px', color: '#5B7080', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Skip this gap ›
                  </button>
                </div>
              </div>
            )
          }

          function renderReviewCard(doc: PendingDoc, summary: string, detectedType?: string) {
            const isReviewing = reviewingId === doc.id
            const session = gapSessions[doc.id]
            const unresolvedGaps = session ? session.gaps.filter(g => g.status === 'unresolved') : []
            const hasUnresolvedGaps = unresolvedGaps.length > 0
            const wizardActive = !!gapWizard && gapWizard.sessionId === session?.id

            return (
              <div key={doc.id} style={{ background: '#FFFFFF', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: 'rgba(124,58,237,0.12)', color: '#7C3AED' }}>
                      {typeLabel(detectedType ?? doc.type)}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{doc.title}</span>
                  </div>
                  <span style={{ fontSize: '13px', color: '#5B7080' }}>{doc.word_count?.toLocaleString()} words</span>
                </div>
                <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '14px', background: '#E8EEF4', borderRadius: '10px', marginBottom: '14px', fontSize: '13px', color: '#2D3E50', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {summary}
                </div>

                {hasUnresolvedGaps && !wizardActive && session && (
                  <div style={{ background: '#F0FAFA', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#00695C', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Before you publish</div>
                    <p style={{ fontSize: '13px', color: '#2D3E50', margin: '0 0 10px', lineHeight: 1.6 }}>
                      I found {unresolvedGaps.length} piece{unresolvedGaps.length === 1 ? '' : 's'} of new information in this document that I haven&apos;t seen before. Help me understand {unresolvedGaps.length === 1 ? 'it' : 'them'} so I can learn from this.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <button onClick={() => startGapWizard('ingest', doc.id, session.id, unresolvedGaps.map(g => g.id))} disabled={isReviewing}
                        style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: '#00A5A3', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: isReviewing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        Review {unresolvedGaps.length} gap{unresolvedGaps.length === 1 ? '' : 's'} →
                      </button>
                      <button onClick={() => rejectPendingDoc(doc.id)} disabled={isReviewing}
                        style={{ fontSize: '13px', color: '#5B7080', background: 'none', border: 'none', cursor: isReviewing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                        Discard this job
                      </button>
                    </div>
                  </div>
                )}

                {wizardActive && session && renderGapWizard(session)}

                {!hasUnresolvedGaps && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => publishPendingDoc(doc.id)} disabled={isReviewing}
                      style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: isReviewing ? '#DDE8EE' : '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: isReviewing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {isReviewing ? 'Working…' : 'Publish to KB'}
                    </button>
                    <button onClick={() => rejectPendingDoc(doc.id)} disabled={isReviewing}
                      style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: '#FF6B6B', fontSize: '13px', fontWeight: 700, cursor: isReviewing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          }

          const adminStaffIdForRoles = typeof window !== 'undefined' ? sessionStorage.getItem('tai_admin_staff_id') : null
          const isKbAdmin = isSuperAdmin || kbAccessTier === 'admin' || (staffList.find(s => s.id === adminStaffIdForRoles)?.access_roles ?? []).includes('kb_admin')

          return (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00695C', marginBottom: '6px' }}>Knowledge Base</div>
                  <h2 style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', margin: 0 }}>Documents</h2>
                </div>
                {docSubTab === 'documents' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Link href="/admin/tools/per-creator"
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(96,165,250,0.08)', color: '#1D4ED8', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      PER Creator
                    </Link>
                    <Link href="/knowledge/assistant"
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(0,165,163,0.35)', background: 'rgba(0,165,163,0.08)', color: '#00695C', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                      Knowledge Assistant
                    </Link>
                    {!showIngestForm && (
                      <button onClick={() => setShowIngestForm(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(164,120,255,0.35)', background: 'rgba(164,120,255,0.08)', color: '#7C3AED', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        Ingest Document
                      </button>
                    )}
                  </div>
                )}
                {docSubTab === 'workspaces' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Link href="/admin/tools/proposal-creator"
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.08)', color: '#7C3AED', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      Proposal Creator
                    </Link>
                    {!showWorkspaceForm && (
                      <button onClick={() => setShowWorkspaceForm(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        New Workspace
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Sub-tab pills */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', alignItems: 'center' }}>
                {([
                  { key: 'documents', label: 'Documents' },
                  { key: 'workspaces', label: 'BD Workspaces' },
                  ...(isKbAdmin ? [{ key: 'intelligence', label: 'Intelligence' }] : []),
                  ...(isKbAdmin ? [{ key: 'gaps', label: `Pending Gaps (${pendingGapSessions.length})` }] : []),
                ] as { key: typeof docSubTab; label: string }[]).map(s => (
                  <button key={s.key} onClick={() => { setDocSubTab(s.key); syncAdminUrl('knowledge', s.key) }}
                    style={{ padding: '8px 18px', borderRadius: '10px', border: `1px solid ${docSubTab === s.key ? 'rgba(0,165,163,0.4)' : '#DDE8EE'}`, background: docSubTab === s.key ? 'rgba(0,165,163,0.08)' : '#FFFFFF', color: docSubTab === s.key ? '#00695C' : '#5B7080', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {s.label}
                  </button>
                ))}
                {isKbAdmin && (
                  <Link href="/knowledge/settings" style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: '#00897B', textDecoration: 'none' }}>
                    Manage KB access →
                  </Link>
                )}
              </div>

              {docSubTab === 'documents' && docActionMsg && (() => {
                const isSuccess = docActionMsg.startsWith('✓')
                return (
                  <div style={{ fontSize: '13px', fontWeight: 700, padding: '11px 16px', borderRadius: '10px', background: isSuccess ? 'rgba(192,244,60,0.1)' : 'rgba(255,107,107,0.08)', border: `1px solid ${isSuccess ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.25)'}`, color: isSuccess ? '#3D6B00' : '#8B1A1A', marginBottom: '16px' }}>
                    {docActionMsg}
                  </div>
                )
              })()}

              {docSubTab === 'documents' && showIngestForm && (() => {
                const effectiveIntent = ingestEffectiveIntent()
                const isGeneral = effectiveIntent === 'verbatim'
                const effectiveType = ingestEffectiveType()
                const generalReady = docForm.title.trim() && docForm.doc_category && (docForm.type !== 'other' || otherTypeLabel.trim())
                const canSubmit = !!ingestFile && (!isGeneral || generalReady)
                const STRUCTURED_TYPE_OPTIONS: { key: KbDocType; label: string }[] = [
                  { key: 'proposal', label: 'Proposal' },
                  { key: 'post_event_report', label: 'Post-Event Report' },
                  { key: 'attendee_data', label: 'Attendee Data' },
                  { key: 'corporate_doc', label: 'Corporate Doc' },
                ]
                const INTENT_OPTIONS: { key: 'summarise' | 'verbatim'; title: string; desc: string }[] = [
                  { key: 'summarise', title: 'Summarise into the Knowledge Base', desc: 'AI restructures the content into a searchable KB entry. You review the summary — and resolve any new fields it found — before it goes live.' },
                  { key: 'verbatim', title: 'Upload as-is', desc: 'Original wording is kept exactly as uploaded, no rewriting. You still review the AI\'s access-level decision before it goes live.' },
                ]
                return (
                  <div style={{ background: '#FFFFFF', border: '1px solid rgba(164,120,255,0.25)', borderRadius: '16px', padding: '24px', marginBottom: '20px', maxWidth: '560px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#7C3AED', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>Ingest Document</div>

                    {ingesting ? (
                      <div style={{ padding: '10px 0 4px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '18px' }}>{ingestFile?.name}</div>
                        <div style={{ position: 'relative', height: '8px', borderRadius: '999px', background: '#EDE9FE', overflow: 'hidden', marginBottom: '14px' }}>
                          <div style={{ position: 'absolute', left: '-40%', top: 0, bottom: 0, width: '40%', borderRadius: '999px', background: 'linear-gradient(90deg, #A478FF, #7C3AED)', animation: 'ingestBarSlide 1.3s ease-in-out infinite' }} />
                        </div>
                        <div key={ingestStage} style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED', animation: 'tourPop 0.3s ease' }}>
                          {INGEST_STAGES[ingestStage]}
                        </div>
                        <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '4px' }}>Large files can take a little longer.</div>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: '13px', color: '#5B7080', margin: '0 0 16px', lineHeight: 1.6 }}>
                          Upload a file, choose how it should be processed, then review before it publishes.
                        </p>
                        <label style={{ display: 'block', padding: '18px', border: `1.5px dashed ${ingestFile ? 'rgba(124,58,237,0.4)' : '#DDE8EE'}`, borderRadius: '10px', textAlign: 'center', cursor: 'pointer', background: ingestFile ? 'rgba(124,58,237,0.04)' : 'transparent', marginBottom: '14px' }}>
                          <input type="file" accept=".pdf,.xlsx,.xls,.txt,.md" style={{ display: 'none' }} onChange={e => { setIngestFile(e.target.files?.[0] ?? null); setIngestTypeChoice(null); setIngestIntent(null) }} />
                          {ingestFile ? (
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED' }}>{ingestFile.name}</div>
                          ) : (
                            <div style={{ fontSize: '13px', color: '#0F1923' }}>Click to select a file — PDF, XLSX, TXT, or MD (max 100 MB)</div>
                          )}
                        </label>

                        {ingestFile && (
                          <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                              What should happen with this document?
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {INTENT_OPTIONS.map(opt => {
                                const active = effectiveIntent === opt.key
                                return (
                                  <button key={opt.key} onClick={() => { setIngestIntent(opt.key); setIngestTypeChoice(null) }}
                                    style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${active ? 'rgba(124,58,237,0.4)' : '#DDE8EE'}`, background: active ? 'rgba(124,58,237,0.06)' : '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: active ? '#7C3AED' : '#0F1923', marginBottom: '3px' }}>{opt.title}</div>
                                    <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.5 }}>{opt.desc}</div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {ingestFile && !isGeneral && (
                          <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                              {ingestTypeChoice ? 'Type' : 'Detected type'}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {STRUCTURED_TYPE_OPTIONS.map(opt => (
                                <button key={opt.key} onClick={() => setIngestTypeChoice(opt.key)}
                                  style={{ padding: '6px 12px', borderRadius: '16px', border: `1px solid ${effectiveType === opt.key ? 'rgba(124,58,237,0.4)' : '#DDE8EE'}`, background: effectiveType === opt.key ? 'rgba(124,58,237,0.08)' : '#FFFFFF', color: effectiveType === opt.key ? '#7C3AED' : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {isGeneral && generalDocFields}

                        {ingestMsg && (
                          <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', color: '#FF6B6B', marginBottom: '10px', lineHeight: 1.5 }}>
                            {ingestMsg}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={ingestDocument} disabled={!canSubmit}
                            style={{ flex: 1, padding: '11px', borderRadius: '9px', border: 'none', background: !canSubmit ? '#DDE8EE' : '#7C3AED', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: !canSubmit ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            Start Ingestion
                          </button>
                          <button onClick={() => { setShowIngestForm(false); setIngestFile(null); setIngestMsg(''); resetGeneralDocForm() }}
                            style={{ padding: '11px 16px', borderRadius: '9px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}

              {docSubTab === 'documents' && ingestResult && ingestResult.detected_type === 'general' && ingestResult.analysis && (
                <div style={{ background: '#FFFFFF', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{ingestResult.document.title}</span>
                    <span style={{ fontSize: '13px', color: '#5B7080' }}>{ingestResult.document.word_count?.toLocaleString()} words</span>
                  </div>
                  <div style={{ padding: '14px', background: ingestResult.analysis.flagged ? 'rgba(139,26,26,0.06)' : 'rgba(0,165,163,0.06)', border: `1px solid ${ingestResult.analysis.flagged ? 'rgba(139,26,26,0.2)' : 'rgba(0,165,163,0.2)'}`, borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: ingestResult.analysis.flagged ? '#8B1A1A' : '#00897B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{ingestResult.analysis.flagged ? 'Low Confidence — Needs Review' : 'Ready to Publish'}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 800, color: ingestResult.analysis.confidence >= 75 ? '#3D6B00' : '#8B1A1A' }}>{ingestResult.analysis.confidence}%</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                      {[{ l: 'Layer', v: ingestResult.analysis.layer.replace('_', ' ') }, { l: 'Department', v: ingestResult.analysis.department }, { l: 'Min Level', v: ingestResult.analysis.min_level }].map(({ l, v }) => (
                        <div key={l} style={{ background: '#FFFFFF', borderRadius: '7px', padding: '7px 9px' }}>
                          <div style={{ fontSize: '9px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>{l}</div>
                          <div style={{ fontSize: '13px', color: '#0F1923', fontWeight: 700, textTransform: 'capitalize' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: ingestResult.analysis.pilot_use ? '#3D6B00' : '#DDE8EE', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: ingestResult.analysis.pilot_use ? '#3D6B00' : '#0F1923', fontWeight: 600 }}>{ingestResult.analysis.pilot_use ? 'Pilot will use this document' : 'Not indexed by Pilot'}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, margin: 0 }}>{ingestResult.analysis.ai_reasoning}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                    <button onClick={() => publishPendingDoc(ingestResult.document.id)} disabled={reviewingId === ingestResult.document.id}
                      style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: reviewingId === ingestResult.document.id ? '#DDE8EE' : '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: reviewingId === ingestResult.document.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {reviewingId === ingestResult.document.id ? 'Working…' : 'Publish to KB'}
                    </button>
                    <button onClick={() => rejectPendingDoc(ingestResult.document.id)} disabled={reviewingId === ingestResult.document.id}
                      style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: '#FF6B6B', fontSize: '13px', fontWeight: 700, cursor: reviewingId === ingestResult.document.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {docSubTab === 'documents' && ingestResult && ingestResult.detected_type !== 'general' && renderReviewCard(ingestResult.document, ingestResult.summary ?? '', ingestResult.detected_type)}

              {docSubTab === 'documents' && (() => {
                const others = pendingDocs.filter(d => d.id !== ingestResult?.document.id)
                if (pendingLoading || others.length === 0) return null
                return (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>
                      Pending Review ({others.length})
                    </div>
                    {others.map(d => expandedPendingId === d.id
                      ? renderReviewCard(d, d.extracted_text)
                      : (
                        <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{d.title}</span>
                            <span style={{ fontSize: '13px', color: '#5B7080', marginLeft: '8px' }}>{typeLabel(d.type)}</span>
                          </div>
                          <button onClick={() => { setExpandedPendingId(d.id); if (!gapSessions[d.id]) fetchGapSession(d.id) }}
                            style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Review →
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )
              })()}

              {docSubTab === 'workspaces' ? (
                <div>
                  {showWorkspaceForm && (
                    <div style={{ background: '#FFFFFF', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '24px', maxWidth: '520px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#00695C', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>New BD Workspace</div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Workspace Name</label>
                        <input value={workspaceForm.name} onChange={e => setWorkspaceForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. DLD LivingSphere Summit"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Client Name</label>
                          <input value={workspaceForm.client_name} onChange={e => setWorkspaceForm(p => ({ ...p, client_name: e.target.value }))} placeholder="e.g. Dubai Land Department"
                            style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Client Country</label>
                          <input value={workspaceForm.client_country} onChange={e => setWorkspaceForm(p => ({ ...p, client_country: e.target.value }))} placeholder="e.g. UAE"
                            style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Event Name</label>
                          <input value={workspaceForm.event_name} onChange={e => setWorkspaceForm(p => ({ ...p, event_name: e.target.value }))} placeholder="e.g. LivingSphere Summit"
                            style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Event Type</label>
                          <select value={workspaceForm.event_type} onChange={e => setWorkspaceForm(p => ({ ...p, event_type: e.target.value }))}
                            style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                            <option value="managed">Managed</option>
                            <option value="bespoke">Bespoke</option>
                            <option value="tender">Tender</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>
                      {workspaceMsg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: workspaceMsg.includes('created') ? 'rgba(192,244,60,0.07)' : 'rgba(255,107,107,0.07)', border: `1px solid ${workspaceMsg.includes('created') ? 'rgba(192,244,60,0.2)' : 'rgba(255,107,107,0.2)'}`, color: workspaceMsg.includes('created') ? '#3D6B00' : '#FF6B6B', marginBottom: '10px' }}>{workspaceMsg}</div>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={createWorkspace} disabled={workspaceSaving}
                          style={{ flex: 1, padding: '11px', borderRadius: '9px', border: 'none', background: workspaceSaving ? '#DDE8EE' : '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: workspaceSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          {workspaceSaving ? 'Creating…' : 'Create Workspace'}
                        </button>
                        <button onClick={() => setShowWorkspaceForm(false)}
                          style={{ padding: '11px 16px', borderRadius: '9px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {workspacesLoading && <div style={{ color: '#0F1923', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading workspaces…</div>}

                  {!workspacesLoading && workspaces.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#0F1923', fontSize: '13px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px' }}>
                      No BD workspaces yet. Create one to track a proposal or bid, its team, and its linked documents together.
                    </div>
                  )}

                  {!workspacesLoading && workspaces.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                      {workspaces.map(ws => {
                        const memberCount = ws.bd_workspace_members?.[0]?.count ?? 0
                        const docCount    = ws.documents?.[0]?.count ?? 0
                        const STATUS_CFG: Record<string, { color: string; bg: string }> = {
                          active:    { color: '#00897B', bg: 'rgba(0,165,163,0.12)' },
                          won:       { color: '#3D6B00', bg: 'rgba(192,244,60,0.12)' },
                          lost:      { color: '#8B1A1A', bg: 'rgba(139,26,26,0.1)' },
                          pending:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
                          withdrawn: { color: '#5B7080', bg: '#E8EEF4' },
                        }
                        const sc = STATUS_CFG[ws.status] ?? STATUS_CFG.active
                        return (
                          <button key={ws.id} onClick={() => openWorkspace(ws.id)}
                            style={{ textAlign: 'left', background: '#FFFFFF', border: `1px solid ${selectedWorkspaceId === ws.id ? 'rgba(0,165,163,0.4)' : '#DDE8EE'}`, borderRadius: '14px', padding: '16px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>{ws.status}</span>
                              {ws.event_type && <span style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', textTransform: 'capitalize' }}>{ws.event_type}</span>}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{ws.name}</div>
                            {(ws.client_name || ws.client_country) && (
                              <div style={{ fontSize: '13px', color: '#5B7080' }}>{[ws.client_name, ws.client_country].filter(Boolean).join(' · ')}</div>
                            )}
                            <div style={{ display: 'flex', gap: '14px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923' }}>
                              <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                              <span>{docCount} document{docCount !== 1 ? 's' : ''}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {selectedWorkspaceId && (() => {
                    const ws = workspaces.find(w => w.id === selectedWorkspaceId)
                    if (!ws) return null
                    const wsDocs = docs.filter(d => d.workspace_id === selectedWorkspaceId)
                    const memberIds = new Set(workspaceMembers.map(m => m.staff_members.id))
                    return (
                      <div style={{ marginTop: '20px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{ws.name} — Team</div>
                          <button onClick={() => setSelectedWorkspaceId(null)}
                            style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                          {workspaceMembers.map(m => (
                            <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, padding: '4px 6px 4px 10px', borderRadius: '16px', background: '#E8EEF4', color: '#0F1923' }}>
                              {m.staff_members.name}
                              <button onClick={() => removeWorkspaceMember(m.staff_members.id)}
                                style={{ width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: 'rgba(255,107,107,0.15)', color: '#FF6B6B', cursor: 'pointer', fontSize: '13px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                            </span>
                          ))}
                          {workspaceMembers.length === 0 && <span style={{ fontSize: '13px', color: '#5B7080' }}>No members yet.</span>}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                          <select value={addMemberStaffId} onChange={e => setAddMemberStaffId(e.target.value)}
                            style={{ flex: 1, padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                            <option value="">Add a team member…</option>
                            {staffList.filter(s => !memberIds.has(s.id)).map(s => <option key={s.id} value={s.id}>{s.name} — {s.department}</option>)}
                          </select>
                          <button onClick={addWorkspaceMember} disabled={!addMemberStaffId}
                            style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: addMemberStaffId ? '#C0F43C' : '#DDE8EE', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: addMemberStaffId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Add</button>
                        </div>

                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '10px' }}>Linked Documents ({wsDocs.length})</div>
                        {wsDocs.length === 0 ? (
                          <div style={{ fontSize: '13px', color: '#5B7080' }}>No documents linked yet. Set &ldquo;BD Workspace&rdquo; when uploading a proposal or tender document to link it here.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {wsDocs.map(d => (
                              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#E8EEF4', borderRadius: '9px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{d.title}</span>
                                {kbDownloadHref(d.source_url, d.id) && <a href={kbDownloadHref(d.source_url, d.id)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 700, color: '#00897B', textDecoration: 'none' }}>Download</a>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : docSubTab === 'intelligence' ? (() => {
                function scoreBadge(score: number | null) {
                  if (score == null) return { color: '#5B7080', background: '#5B708015' }
                  if (score >= 75) return { color: '#3D6B00', background: 'rgba(61,107,0,0.1)' }
                  if (score >= 40) return { color: '#92400E', background: 'rgba(139,26,26,0.1)' }
                  return { color: '#5B7080', background: '#5B708015' }
                }

                function renderIntelReviewCard(item: IntelItem) {
                  const badge = scoreBadge(item.gemini_score)
                  const isExpanded = expandedIntelItemId === item.id
                  return (
                    <div key={item.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080' }}>{item.kb_intel_sources?.name ?? 'Unknown source'}</span>
                        <span style={{ fontSize: '13px', color: '#5B7080' }}>·</span>
                        <span style={{ fontSize: '13px', color: '#5B7080' }}>{new Date(item.discovered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 800, padding: '2px 10px', borderRadius: '10px', color: badge.color, background: badge.background }}>Score: {item.gemini_score ?? '—'}</span>
                      </div>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
                        {item.title ?? item.url}
                      </a>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {item.event_mentioned && <span style={{ fontSize: '13px', fontWeight: 700, color: '#00695C', background: 'rgba(0,165,163,0.1)', padding: '2px 8px', borderRadius: '10px' }}>{item.event_mentioned}</span>}
                        {item.article_type && <span style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', background: '#E8EEF4', padding: '2px 8px', borderRadius: '10px', textTransform: 'capitalize' }}>{item.article_type.replace(/_/g, ' ')}</span>}
                      </div>
                      {item.gemini_reasoning && <p style={{ fontSize: '13px', color: '#5B7080', fontStyle: 'italic', margin: '0 0 10px', lineHeight: 1.6 }}>{item.gemini_reasoning}</p>}
                      {item.gemini_summary && (
                        <div style={{ marginBottom: '10px' }}>
                          <button onClick={() => setExpandedIntelItemId(isExpanded ? null : item.id)}
                            style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                            {isExpanded ? 'Hide Summary ▲' : 'Preview Summary ▼'}
                          </button>
                          {isExpanded && (
                            <div style={{ marginTop: '8px', padding: '14px', background: '#E8EEF4', borderRadius: '10px', fontSize: '13px', color: '#2D3E50', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '320px', overflowY: 'auto' }}>
                              {item.gemini_summary}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => approveIntelItem(item.id)}
                          style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Add to KB ✓
                        </button>
                        <button onClick={() => rejectIntelItem(item.id)}
                          style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: '#FF6B6B', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Reject ✗
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                <div>
                  {/* Internal tab bar */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    {([
                      { key: 'overview', label: 'Overview' },
                      { key: 'review',   label: `Review Queue${intelPendingItems.length ? ` (${intelPendingItems.length})` : ''}` },
                      { key: 'sources',  label: 'Sources' },
                      { key: 'items',    label: 'All Items' },
                    ] as { key: typeof intelSubTab; label: string }[]).map(s => (
                      <button key={s.key} onClick={() => { setIntelSubTab(s.key); if (s.key === 'items') fetchIntelItems(0) }}
                        style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${intelSubTab === s.key ? 'rgba(124,58,237,0.4)' : '#DDE8EE'}`, background: intelSubTab === s.key ? 'rgba(124,58,237,0.08)' : '#FFFFFF', color: intelSubTab === s.key ? '#7C3AED' : '#5B7080', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {intelLoading && <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '16px' }}>Loading…</div>}

                  {intelSubTab === 'overview' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Press Intelligence</div>
                        <button onClick={runIntelNow} disabled={intelRunning}
                          style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: intelRunning ? '#DDE8EE' : '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: intelRunning ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          {intelRunning ? 'Running…' : 'Run Now ▶'}
                        </button>
                      </div>

                      {intelMsg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', color: '#00695C', marginBottom: '16px' }}>{intelMsg}</div>}

                      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '13px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>Last Run</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>
                            {intelRuns[0] ? new Date(intelRuns[0].started_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never run'}
                          </div>
                        </div>
                        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '13px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>Next Run</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{intelConfig?.cron_schedule_display ?? '—'}</div>
                        </div>
                        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '13px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>Pipeline</div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: intelConfig?.is_enabled ? '#3D6B00' : '#8B1A1A' }}>{intelConfig?.is_enabled ? 'Enabled' : 'Disabled'}</div>
                          </div>
                          <button onClick={toggleIntelEnabled}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {intelConfig?.is_enabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                        {[
                          { label: 'Auto-Published', value: intelRuns[0]?.items_auto_published ?? 0, color: '#3D6B00' },
                          { label: 'Needs Review',   value: intelRuns[0]?.items_queued ?? 0,          color: '#92400E' },
                          { label: 'Skipped',        value: intelRuns[0]?.items_skipped ?? 0,         color: '#5B7080' },
                        ].map(stat => (
                          <div key={stat.label} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '16px' }}>
                            <div style={{ fontSize: '13px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>{stat.label}</div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Event Registry — Powers Relevance Scoring</div>
                          <span style={{ fontSize: '13px', color: '#5B7080' }}>Source: {intelConfig?.event_registry_source === 'eventpilot_internal' ? 'EventPilot Internal' : 'tresconglobal.com'}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '12px' }}>
                          Last refreshed: {intelConfig?.event_registry_last_updated ? new Date(intelConfig.event_registry_last_updated).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'} · {intelConfig?.event_registry_data?.length ?? 0} events found
                        </div>
                        {(intelConfig?.event_registry_data?.length ?? 0) > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {intelConfig!.event_registry_data!.map((ev, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#E8EEF4', borderRadius: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', flex: 1 }}>{ev.name}</span>
                                {ev.status && <span style={{ fontSize: '13px', color: '#5B7080' }}>{ev.status}</span>}
                                {ev.website && <a href={ev.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#00897B', textDecoration: 'none' }}>Visit ↗</a>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '12px' }}>Run History</div>
                        {intelRuns.length === 0 ? (
                          <div style={{ fontSize: '13px', color: '#5B7080' }}>No runs yet.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {intelRuns.map(run => {
                              const isExp = expandedIntelRunId === run.id
                              return (
                                <div key={run.id}>
                                  <button onClick={() => setExpandedIntelRunId(isExp ? null : run.id)}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#E8EEF4', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{new Date(run.started_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    <span style={{ fontSize: '13px', color: '#5B7080', textTransform: 'capitalize' }}>{run.triggered_by}</span>
                                    <span style={{ fontSize: '13px', color: '#5B7080' }}>{run.sources_checked} sources</span>
                                    <span style={{ fontSize: '13px', color: '#5B7080' }}>{run.urls_discovered} found</span>
                                    <span style={{ fontSize: '13px', color: '#3D6B00' }}>{run.items_auto_published} published</span>
                                    <span style={{ fontSize: '13px', color: '#92400E' }}>{run.items_queued} queued</span>
                                    <span style={{ fontSize: '13px', color: '#5B7080' }}>{run.items_skipped} skipped</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', color: run.status === 'completed' ? '#3D6B00' : run.status === 'failed' ? '#8B1A1A' : '#5B7080', background: run.status === 'completed' ? 'rgba(61,107,0,0.1)' : run.status === 'failed' ? 'rgba(139,26,26,0.1)' : '#5B708015' }}>{run.status}</span>
                                  </button>
                                  {isExp && run.error_message && (
                                    <div style={{ padding: '10px 12px', fontSize: '13px', color: '#8B1A1A', background: 'rgba(255,107,107,0.06)', borderRadius: '8px', marginTop: '4px' }}>{run.error_message}</div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '12px' }}>Thresholds</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                          <div>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Auto-Publish Threshold</label>
                            <input type="number" min={0} max={100} value={intelThresholds.auto_publish_threshold}
                              onChange={e => setIntelThresholds(p => ({ ...p, auto_publish_threshold: Number(e.target.value) }))}
                              style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                            <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '4px' }}>Articles scoring above this are published automatically</div>
                          </div>
                          <div>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Review Threshold</label>
                            <input type="number" min={0} max={100} value={intelThresholds.review_threshold}
                              onChange={e => setIntelThresholds(p => ({ ...p, review_threshold: Number(e.target.value) }))}
                              style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                            <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '4px' }}>Articles scoring above this but below auto-publish appear in the Review Queue</div>
                          </div>
                        </div>
                        <button onClick={saveIntelThresholds}
                          style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}

                  {intelSubTab === 'review' && (
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '16px' }}>Needs Review ({intelPendingItems.length})</div>
                      {intelPendingItems.length === 0 ? (
                        <div style={{ fontSize: '13px', color: '#5B7080' }}>No items awaiting review.</div>
                      ) : (
                        intelPendingItems.map(item => renderIntelReviewCard(item))
                      )}
                    </div>
                  )}

                  {intelSubTab === 'sources' && (
                    <div>
                      <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '4px' }}>Event Registry (special — not editable)</div>
                        <div style={{ fontSize: '13px', color: '#5B7080' }}>tresconglobal.com/events · weekly · event_extraction</div>
                      </div>

                      {([
                        { category: 'owned_property', label: 'Owned Properties' },
                        { category: 'partner_govt',   label: 'Partner & Government' },
                        { category: 'press_media',    label: 'Press & Media' },
                      ] as { category: 'owned_property' | 'partner_govt' | 'press_media'; label: string }[]).map(section => {
                        const sectionSources = intelSources.filter(s => s.category === section.category)
                        const isCollapsed = collapsedIntelSections[section.category] ?? false
                        return (
                          <div key={section.category} style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <button onClick={() => setCollapsedIntelSections(p => ({ ...p, [section.category]: !isCollapsed }))}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                                <span style={{ fontSize: '11px', color: '#5B7080', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{section.label} ({sectionSources.length})</span>
                              </button>
                              <button onClick={() => { setEditingIntelSourceId(null); setShowIntelSourceForm(section.category); setIntelSourceForm({ name: '', url: '', query: '', crawl_behaviour: 'article_discovery', crawl_frequency: 'weekly' }); setIntelSourceMsg('') }}
                                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(0,165,163,0.35)', background: 'rgba(0,165,163,0.08)', color: '#00695C', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                + Add {section.category === 'press_media' ? 'Search Query' : 'Source'}
                              </button>
                            </div>

                            {!isCollapsed && showIntelSourceForm === section.category && (
                              <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,165,163,0.25)', borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#00695C', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{editingIntelSourceId ? 'Edit Source' : 'New Source'}</div>
                                <div style={{ marginBottom: '10px' }}>
                                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Name</label>
                                  <input value={intelSourceForm.name} onChange={e => setIntelSourceForm(p => ({ ...p, name: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                </div>
                                {section.category === 'press_media' ? (
                                  <div style={{ marginBottom: '10px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Search Query</label>
                                    <input value={intelSourceForm.query} onChange={e => setIntelSourceForm(p => ({ ...p, query: e.target.value }))} placeholder="e.g. Trescon site:arabianbusiness.com"
                                      style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                    <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '4px' }}>Google search query. Use site: to restrict to a domain.</div>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ marginBottom: '10px' }}>
                                      <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>URL</label>
                                      <input value={intelSourceForm.url} onChange={e => setIntelSourceForm(p => ({ ...p, url: e.target.value }))} placeholder="https://difc.ae/newsroom"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ marginBottom: '10px' }}>
                                      <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Crawl Behaviour</label>
                                      <div style={{ display: 'flex', gap: '14px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923', cursor: 'pointer' }}>
                                          <input type="radio" checked={intelSourceForm.crawl_behaviour === 'article_discovery'} onChange={() => setIntelSourceForm(p => ({ ...p, crawl_behaviour: 'article_discovery' }))} />
                                          Article Discovery
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923', cursor: 'pointer' }}>
                                          <input type="radio" checked={intelSourceForm.crawl_behaviour === 'fact_extraction'} onChange={() => setIntelSourceForm(p => ({ ...p, crawl_behaviour: 'fact_extraction' }))} />
                                          Fact Extraction
                                        </label>
                                      </div>
                                    </div>
                                  </>
                                )}
                                <div style={{ marginBottom: '10px' }}>
                                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Frequency</label>
                                  <div style={{ display: 'flex', gap: '14px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923', cursor: 'pointer' }}>
                                      <input type="radio" checked={intelSourceForm.crawl_frequency === 'weekly'} onChange={() => setIntelSourceForm(p => ({ ...p, crawl_frequency: 'weekly' }))} />
                                      Weekly
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923', cursor: 'pointer' }}>
                                      <input type="radio" checked={intelSourceForm.crawl_frequency === 'monthly'} onChange={() => setIntelSourceForm(p => ({ ...p, crawl_frequency: 'monthly' }))} />
                                      Monthly
                                    </label>
                                  </div>
                                </div>
                                {intelSourceMsg && <div style={{ fontSize: '13px', color: '#FF6B6B', marginBottom: '10px' }}>{intelSourceMsg}</div>}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={saveIntelSource}
                                    style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Save Source
                                  </button>
                                  <button onClick={() => { setShowIntelSourceForm(false); setEditingIntelSourceId(null); setIntelSourceMsg('') }}
                                    style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {!isCollapsed && (sectionSources.length === 0 ? (
                              <div style={{ fontSize: '13px', color: '#5B7080' }}>No sources yet.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {sectionSources.map(source => (
                                  <div key={source.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '10px' }}>
                                    <button onClick={() => toggleIntelSourceActive(source)} title={source.is_active ? 'Active — click to pause' : 'Paused — click to activate'}
                                      style={{ width: '10px', height: '10px', borderRadius: '50%', border: 'none', background: source.is_active ? '#3D6B00' : '#DDE8EE', cursor: 'pointer', flexShrink: 0, padding: 0 }} />
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{source.name}</span>
                                    <span style={{ fontSize: '13px', color: '#5B7080', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.config.url ?? source.config.query}</span>
                                    <span style={{ fontSize: '13px', color: '#5B7080', textTransform: 'capitalize' }}>{source.crawl_frequency}</span>
                                    <span style={{ fontSize: '13px', color: '#5B7080' }}>Last found: {source.last_found_count}</span>
                                    <button onClick={() => startEditIntelSource(source)}
                                      style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Edit
                                    </button>
                                    <button onClick={() => deleteIntelSource(source.id)}
                                      style={{ fontSize: '13px', fontWeight: 700, color: '#FF6B6B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Delete
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {intelSubTab === 'items' && (
                    <div>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input value={intelItemsFilter.search} onChange={e => setIntelItemsFilter(p => ({ ...p, search: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') fetchIntelItems(0) }}
                          placeholder="Search title or URL…"
                          style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', minWidth: '220px' }} />
                        <select value={intelItemsFilter.status} onChange={e => setIntelItemsFilter(p => ({ ...p, status: e.target.value }))}
                          style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="all">All Statuses</option>
                          <option value="auto_published">Auto-published</option>
                          <option value="pending">Needs review</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                          <option value="skipped">Skipped</option>
                        </select>
                        <select value={intelItemsFilter.source_id} onChange={e => setIntelItemsFilter(p => ({ ...p, source_id: e.target.value }))}
                          style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="">All Sources</option>
                          {intelSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button onClick={() => fetchIntelItems(0)}
                          style={{ padding: '8px 16px', borderRadius: '9px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Apply
                        </button>
                      </div>

                      {intelItems.length === 0 ? (
                        <div style={{ fontSize: '13px', color: '#5B7080' }}>No items match these filters.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {intelItems.map(item => {
                            const isExp = expandedIntelItemId === item.id
                            const badge = scoreBadge(item.gemini_score)
                            return (
                              <div key={item.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '10px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  <button onClick={() => setExpandedIntelItemId(isExp ? null : item.id)}
                                    style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flex: 1 }}>
                                    {item.title ?? item.url}
                                  </button>
                                  <span style={{ fontSize: '13px', color: '#5B7080' }}>{item.kb_intel_sources?.name ?? '—'}</span>
                                  <span style={{ fontSize: '13px', color: '#5B7080' }}>{new Date(item.discovered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                  <span style={{ fontSize: '13px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', color: badge.color, background: badge.background }}>{item.gemini_score ?? '—'}</span>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', textTransform: 'capitalize' }}>{item.status.replace(/_/g, ' ')}</span>
                                  <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#00897B', textDecoration: 'none' }}>View original ↗</a>
                                  {item.document_id && <Link href="/knowledge" style={{ fontSize: '13px', color: '#7C3AED', textDecoration: 'none' }}>View in KB</Link>}
                                </div>
                                {isExp && (
                                  <div style={{ marginTop: '10px', padding: '12px', background: '#E8EEF4', borderRadius: '8px' }}>
                                    {item.gemini_reasoning && <p style={{ fontSize: '13px', color: '#5B7080', fontStyle: 'italic', margin: '0 0 8px' }}>{item.gemini_reasoning}</p>}
                                    {item.gemini_summary && <div style={{ fontSize: '13px', color: '#2D3E50', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '260px', overflowY: 'auto' }}>{item.gemini_summary}</div>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
                        <button onClick={() => fetchIntelItems(Math.max(0, intelItemsPage - 1))} disabled={intelItemsPage === 0}
                          style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: intelItemsPage === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          ← Previous
                        </button>
                        <span style={{ fontSize: '13px', color: '#5B7080' }}>Page {intelItemsPage + 1} of {Math.max(1, Math.ceil(intelItemsTotal / 20))}</span>
                        <button onClick={() => fetchIntelItems(intelItemsPage + 1)} disabled={(intelItemsPage + 1) * 20 >= intelItemsTotal}
                          style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: (intelItemsPage + 1) * 20 >= intelItemsTotal ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )
              })() : docSubTab === 'gaps' ? (() => {
                const actionable = (s: GapSession) => s.gaps.filter(g => g.status === 'pending' || g.status === 'unresolved')
                return (
                  <div>
                    <p style={{ fontSize: '13px', color: '#5B7080', margin: '0 0 16px', lineHeight: 1.6 }}>
                      Gaps an uploader deferred with &quot;Skip this gap&quot;, or left unresolved. Action each one using the same 3-step flow they saw at ingest.
                    </p>
                    {pendingGapsLoading && (
                      <div style={{ color: '#5B7080', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
                    )}
                    {!pendingGapsLoading && pendingGapSessions.every(s => actionable(s).length === 0) && (
                      <div style={{ color: '#5B7080', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>No pending gaps — every uploader has fully resolved their documents.</div>
                    )}
                    {!pendingGapsLoading && pendingGapSessions.map(session => {
                      const gaps = actionable(session)
                      if (gaps.length === 0) return null
                      const wizardActive = gapWizard?.sessionId === session.id
                      return (
                        <div key={session.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: 'rgba(124,58,237,0.12)', color: '#7C3AED' }}>
                              {typeLabel(session.processor_type)}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{session.documents?.title ?? session.document_id}</span>
                          </div>

                          {wizardActive ? renderGapWizard(session) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {gaps.map(gap => (
                                <div key={gap.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', background: '#F0FAFA', border: '1px solid rgba(0,165,163,0.15)', borderRadius: '10px' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', color: '#0F1923' }}>{gap.description}</div>
                                    {gap.location && <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '2px' }}>Location: {gap.location}</div>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    <button onClick={() => startGapWizard('review', session.document_id, session.id, [gap.id])}
                                      style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#00A5A3', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Resolve ✓
                                    </button>
                                    <button onClick={() => dismissPendingGap(session, gap)}
                                      style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: '#FF6B6B', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Dismiss ✗
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })() : docSubTab === 'admins' ? (() => {
                return (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', marginBottom: '8px' }}>KB access management has moved</div>
                    <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '16px' }}>It now lives in the Knowledge Base module&apos;s own Settings page.</div>
                    <Link href="/knowledge/settings" className="tbtn tbtn-teal" style={{ display: 'inline-flex' }}>Open Knowledge Base Settings</Link>
                  </div>
                )
              })() : (
              <>
              {/* EMPTY STATE */}
              {!docsLoading && docs.length === 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '32px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    {[
                      { n:'1', label:'Upload a document', sub:'PDF or text — policy, brief, report, anything' },
                      { n:'2', label:'AI classifies it', sub:'Decides who sees it, what it is for, confidence score' },
                      { n:'3', label:'Goes live or flagged', sub:'High confidence = auto-live. Low = you review first' },
                      { n:'4', label:'Pilot answers from it', sub:'Staff ask questions — Pilot reads docs to reply' },
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
                  <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
                    <button onClick={() => setShowIngestForm(true)}
                      style={{ padding: '11px 24px', borderRadius: '9px', border: 'none', background: '#7C3AED', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Ingest Document
                    </button>
                  </div>
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
                        { n:'4', label:'Pilot answers from it', sub:'Staff questions answered from your docs' },
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

                  {/* Category filter pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    {([
                      { key:'all',                    label:`All (${categoryCount('all')})` },
                      { key:'event_intelligence',     label:`Event Intelligence (${categoryCount('event_intelligence')})` },
                      { key:'business_development',   label:`Business Development (${categoryCount('business_development')})` },
                      { key:'project_management',     label:`Project Management (${categoryCount('project_management')})` },
                      { key:'marketing',               label:`Marketing (${categoryCount('marketing')})` },
                      { key:'company_knowledge',       label:`Company Knowledge (${categoryCount('company_knowledge')})` },
                      { key:'external',                label:`External (${categoryCount('external')})` },
                    ] as {key:typeof docCategoryFilter;label:string}[]).map(f => (
                      <button key={f.key} onClick={() => setDocCategoryFilter(f.key)}
                        style={{ padding: '6px 14px', borderRadius: '16px', border: `1px solid ${docCategoryFilter === f.key ? 'rgba(0,165,163,0.4)' : '#DDE8EE'}`, background: docCategoryFilter === f.key ? 'rgba(0,165,163,0.08)' : 'transparent', color: docCategoryFilter === f.key ? '#00695C' : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>

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
                                {doc.version > 1 && (
                                  <button onClick={() => openVersionHistory(doc.document_group_id ?? doc.id)}
                                    style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: 'rgba(96,165,250,0.12)', color: '#1D4ED8', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    v{doc.version} · History
                                  </button>
                                )}
                              </div>

                              {/* Title */}
                              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', lineHeight: 1.4 }}>{doc.title}</div>

                              {/* Source link + workspace tag */}
                              {(doc.source_url || doc.workspace_id) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  {kbDownloadHref(doc.source_url, doc.id) && (
                                    <a href={kbDownloadHref(doc.source_url, doc.id)!} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: '13px', fontWeight: 700, color: '#00897B', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                      Download original
                                    </a>
                                  )}
                                  {doc.workspace_id && (
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080' }}>
                                      {workspaces.find(w => w.id === doc.workspace_id)?.name ?? 'BD Workspace'}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Department + level (if specific) */}
                              {doc.layer === 'specific' && (
                                <div style={{ fontSize: '13px', color: '#0F1923', display: 'flex', gap: '8px' }}>
                                  <span>{doc.department}</span>
                                  <span style={{ color: '#5B7080' }}>·</span>
                                  <span>{doc.min_level}</span>
                                </div>
                              )}

                              {/* Pilot indicator + confidence */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: doc.pilot_use ? '#C0F43C' : '#DDE8EE', flexShrink: 0 }} />
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: doc.pilot_use ? '#3D6B00' : '#5B7080' }}>
                                    {doc.pilot_use ? 'Used by Pilot' : 'Not indexed'}
                                  </span>
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: doc.confidence >= 75 ? '#0F1923' : '#8B1A1A' }}>
                                  {doc.confidence}% AI confidence
                                </span>
                              </div>

                              {/* Footer: word count + date + actions */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #DDE8EE' }}>
                                <span style={{ fontSize: '13px', color: '#0F1923' }}>
                                  {doc.word_count?.toLocaleString()} words · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </span>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <button onClick={() => { setSupersedesDoc(doc); setDocForm(p => ({ ...p, title: doc.title, type: doc.type, workspace_id: doc.workspace_id ?? '', doc_category: doc.doc_category ?? '' })); setIngestIntent('verbatim'); setShowIngestForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                    style={{ fontSize: '13px', fontWeight: 700, color: '#00897B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}>
                                    New Version
                                  </button>
                                  <button onClick={() => setDeletingDoc(doc)}
                                    style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,107,107,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}>
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
              </>
              )}

              {/* Version history modal */}
              {versionModalGroupId && (
                <div onClick={() => setVersionModalGroupId(null)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                  <div onClick={e => e.stopPropagation()}
                    style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', width: '520px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Version History</div>
                      <button onClick={() => setVersionModalGroupId(null)}
                        style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
                    </div>
                    {versionHistoryLoading ? (
                      <div style={{ fontSize: '13px', color: '#5B7080', padding: '20px 0', textAlign: 'center' }}>Loading…</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {versionHistory.map(v => {
                          const uploader = Array.isArray(v.staff_members) ? v.staff_members[0] : v.staff_members
                          const isCurrent = !v.superseded_by
                          return (
                            <div key={v.id} style={{ padding: '12px 14px', background: isCurrent ? 'rgba(192,244,60,0.06)' : '#E8EEF4', border: `1px solid ${isCurrent ? 'rgba(192,244,60,0.25)' : '#DDE8EE'}`, borderRadius: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>v{v.version}</span>
                                {isCurrent && <span style={{ fontSize: '13px', fontWeight: 700, color: '#3D6B00', background: 'rgba(192,244,60,0.15)', padding: '1px 8px', borderRadius: '10px' }}>Current</span>}
                                <span style={{ fontSize: '13px', color: '#5B7080', marginLeft: 'auto' }}>{new Date(v.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </div>
                              {v.version_note && <div style={{ fontSize: '13px', color: '#0F1923', marginBottom: '4px' }}>{v.version_note}</div>}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {uploader?.name && <span style={{ fontSize: '13px', color: '#5B7080' }}>Uploaded by {uploader.name}</span>}
                                {kbDownloadHref(v.source_url, v.id) && <a href={kbDownloadHref(v.source_url, v.id)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 700, color: '#00897B', textDecoration: 'none' }}>Download</a>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {deletingDoc && (
                <div onClick={() => { setDeletingDoc(null); setDeleteConfirmText('') }}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
                  <div onClick={e => e.stopPropagation()}
                    style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '440px', width: '100%' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F1923', marginBottom: '10px' }}>Remove this document?</div>
                    <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '16px' }}>
                      This removes <strong>&ldquo;{deletingDoc.title}&rdquo;</strong> from the Knowledge Base — it will no longer be visible to staff or Pilot. Type <strong>DELETE</strong> below to confirm.
                    </div>
                    <input
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '16px' }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setDeletingDoc(null); setDeleteConfirmText('') }}
                        style={{ padding: '10px 16px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancel
                      </button>
                      <button onClick={confirmDeleteDoc} disabled={deleteConfirmText !== 'DELETE' || deleting}
                        style={{ padding: '10px 16px', borderRadius: '9px', border: 'none', background: deleteConfirmText !== 'DELETE' || deleting ? '#F3B8B8' : '#FF6B6B', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: deleteConfirmText !== 'DELETE' || deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        {deleting ? 'Removing…' : 'Remove permanently'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Review Queue tab (super admin only) ── */}
        {tab === 'review' && isSuperAdmin && (
          <div>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#FF6B6B', marginBottom: '6px' }}>Review Queue</div>
              <h2 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 6px' }}>Courses Pending Approval</h2>
              <p style={{ fontSize: '13px', color: '#5B7080', margin: 0, lineHeight: 1.6 }}>These courses were generated via Learning Lab and are waiting for your review. Approve to publish them to the library, or reject to remove them.</p>
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
                <div style={{ fontSize: '13px', color: '#5B7080' }}>No courses pending review. When someone submits a course via Learning Lab it will appear here.</div>
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

        {/* ── Security Tab (super admin only) ── */}
        {tab === 'security' && isSuperAdmin && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#1D4ED8', marginBottom: '4px' }}>Security</div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.4px' }}>Login Audit &amp; Access Control</div>
              </div>
              <button onClick={fetchSecurity} style={{ padding: '8px 18px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#1D4ED8', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.82"/></svg>
                Refresh
              </button>
            </div>

            {securityLoading && (
              <div style={{ textAlign: 'center', padding: '60px', color: '#5B7080', fontSize: '13px' }}>Loading security data…</div>
            )}

            {!securityLoading && !securityData && (
              <div style={{ textAlign: 'center', padding: '60px', color: '#5B7080', fontSize: '13px' }}>Click Refresh to load security data.</div>
            )}

            {securityData && (
              <>
                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                  {[
                    { label: 'Logins Today',    value: securityData.today_logins,   color: '#166534', bg: 'rgba(22,101,52,0.06)' },
                    { label: 'Failed Today',     value: securityData.today_failures, color: '#991B1B', bg: 'rgba(153,27,27,0.06)' },
                    { label: 'Locked Right Now', value: securityData.locked_now.length, color: '#92400E', bg: 'rgba(146,64,14,0.06)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: '14px', padding: '20px 24px' }}>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: s.color, letterSpacing: '-1px' }}>{s.value}</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: s.color, marginTop: '4px', opacity: 0.8 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Locked accounts */}
                {securityData.locked_now.length > 0 && (
                  <div style={{ background: 'rgba(153,27,27,0.04)', border: '1px solid rgba(153,27,27,0.2)', borderRadius: '14px', padding: '20px 24px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#991B1B', marginBottom: '12px' }}>Locked Now (5+ failures in last 15 min)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {securityData.locked_now.map(email => (
                        <span key={email} style={{ background: 'rgba(153,27,27,0.08)', border: '1px solid rgba(153,27,27,0.25)', borderRadius: '8px', padding: '4px 12px', fontSize: '13px', fontWeight: 700, color: '#991B1B' }}>{email}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Login activity feed */}
                <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="14" height="14" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Recent Login Activity</div>
                    <span style={{ fontSize: '11px', color: '#5B7080', marginLeft: 'auto' }}>Last {securityData.recent.length} attempts</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['Time', 'Email', 'IP Address', 'Result', 'Reason'].map(h => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#5B7080', borderBottom: '1px solid #DDE8EE', whiteSpace: 'nowrap' }}>{h}</th>
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
                            <tr key={row.id} style={{ borderBottom: '1px solid #F0F4F8' }}>
                              <td style={{ padding: '10px 16px', color: '#5B7080', whiteSpace: 'nowrap' }}>{timeStr}</td>
                              <td style={{ padding: '10px 16px', color: '#0F1923', fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email}</td>
                              <td style={{ padding: '10px 16px', color: '#5B7080', fontFamily: 'monospace', fontSize: '12px' }}>{row.ip ?? '—'}</td>
                              <td style={{ padding: '10px 16px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: row.success ? 'rgba(22,101,52,0.08)' : 'rgba(153,27,27,0.08)', color: row.success ? '#166534' : '#991B1B' }}>
                                  {row.success ? 'Success' : 'Failed'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 16px', color: '#5B7080' }}>{REASON_LABEL[row.reason ?? ''] ?? row.reason ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* IP Allowlist config note */}
                <div style={{ marginTop: '24px', background: 'rgba(29,78,216,0.04)', border: '1px solid rgba(29,78,216,0.15)', borderRadius: '14px', padding: '20px 24px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1D4ED8', marginBottom: '8px' }}>IP Allowlist</div>
                  <div style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.7 }}>
                    To restrict staff logins to office networks only, add the <strong>OFFICE_IPS</strong> environment variable in Vercel with a comma-separated list of your office public IPs.<br/>
                    Example: <span style={{ fontFamily: 'monospace', background: '#F0F4F8', padding: '1px 6px', borderRadius: '4px', fontSize: '12px' }}>203.0.113.10,198.51.100.42</span><br/>
                    Admins (dept_head and above) are always exempt from IP restrictions.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes demoGlow{0%{color:#8B1A1A}20%{color:#FF6B6B}40%{color:#C0F43C}60%{color:#00A5A3}80%{color:#8B1A1A}100%{color:#FFD08A}} @keyframes tourPop{0%{opacity:0;transform:scale(0.95) translateY(6px)}100%{opacity:1;transform:scale(1) translateY(0)}} @keyframes slideInRight{0%{transform:translateX(100%);opacity:0}100%{transform:translateX(0);opacity:1}} @keyframes ingestBarSlide{0%{left:-40%}100%{left:100%}}`}</style>

      {/* ── What's Next — Roadmap Panel ── */}
      {showRoadmap && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex' }}>
          {/* Backdrop */}
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowRoadmap(false)} />

          {/* Drawer */}
          <div style={{ width: '560px', background: '#FFFFFF', borderLeft: '1px solid rgba(164,120,255,0.25)', height: '100%', overflowY: 'auto', animation: 'slideInRight 0.25s ease', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid #DDE8EE', position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '4px' }}>Platform Roadmap</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.3px' }}>What&apos;s next for Event Pilot</div>
                </div>
                <button onClick={() => setShowRoadmap(false)} style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" fill="none" stroke="#5B7080" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

              {/* ── Build Log — live from GitHub commits ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <svg width="14" height="14" fill="none" stroke="#1565C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#1565C0' }}>Build Log — what shipped &amp; when</div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>live · auto-updates on every commit</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {buildLog.length === 0 && (
                    <div style={{ fontSize: '13px', color: '#94A3B8', padding: '8px 0' }}>Loading build log…</div>
                  )}
                  {buildLog.map((day, di) => {
                    const isMadhu     = day.author === 'Madhu'
                    const badgeColor  = isMadhu ? '#00695C' : '#1565C0'
                    const badgeBg     = isMadhu ? 'rgba(0,105,92,0.08)' : 'rgba(21,101,192,0.08)'
                    const badgeBorder = isMadhu ? 'rgba(0,105,92,0.2)'  : 'rgba(21,101,192,0.2)'
                    return (
                      <div key={di}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0 6px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: badgeColor, background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: '6px', padding: '2px 8px', whiteSpace: 'nowrap' as const }}>
                            {day.date}{day.time ? ` · ${day.time}` : ''} — {day.author}
                          </div>
                          <div style={{ flex: 1, height: '1px', background: '#DDE8EE' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '4px' }}>
                          {day.items.map((item, ii) => (
                            <div key={ii}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: isMadhu ? 'rgba(0,105,92,0.4)' : '#93C5FD', marginTop: '6px', flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', color: '#0F1923', fontWeight: 600, lineHeight: 1.4 }}>{item.title}</span>
                              </div>
                              {item.bullets.length > 0 && (
                                <div style={{ paddingLeft: '13px', marginTop: '3px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {item.bullets.map((b, bi) => (
                                    <div key={bi} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                      <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#CBD5E1', marginTop: '7px', flexShrink: 0 }} />
                                      <span style={{ fontSize: '12px', color: '#5B7080', lineHeight: 1.5 }}>{b}</span>
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
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C0F43C' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#00695C' }}>Live now</div>
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

                      <svg width="13" height="13" style={{ flexShrink: 0, marginTop: '2px' }} fill="none" stroke="#3D6B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Phase 2 — complete ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3D6B00' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#3D6B00' }}>Phase 2 — Complete</div>
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
                      <svg width="13" height="13" style={{ flexShrink: 0, marginTop: '2px' }} fill="none" stroke="#3D6B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#3D6B00', marginBottom: '3px' }}>{item.title}</div>
                        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Pre-Phase 3 Checklist ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00897B' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#00897B' }}>Pre-Phase 3 — Current Sprint</div>
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
                    <div key={i} style={{ padding: '12px 14px', background: item.done ? 'rgba(0,137,123,0.04)' : 'rgba(0,137,123,0.02)', border: `1px solid ${item.done ? 'rgba(0,137,123,0.2)' : '#DDE8EE'}`, borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: item.done ? '#00897B' : '#E8EEF4', border: item.done ? 'none' : '2px solid #B8CDD8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                        {item.done && <svg width="10" height="10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: item.done ? '#00897B' : '#0F1923', marginBottom: '3px' }}>{item.title}{item.done ? ' ✓' : ''}</div>
                        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Blocked / Waiting ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97706' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#D97706' }}>Blocked — waiting on external input</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { title: 'Content Hub social publishing', blocker: 'Waiting on Meta API tokens from Madhu', desc: 'Approval queue and campaign workflow are fully built. Once Meta tokens are provided, LinkedIn, Instagram, and Facebook publishing can be wired up in one session.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>{item.title}</div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#D97706', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: '20px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{item.blocker}</div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>{item.desc}</div>
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
                      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Suggestion Box ── */}
              <div style={{ background: 'rgba(0,137,123,0.05)', border: '1px solid rgba(0,137,123,0.2)', borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#00897B', marginBottom: '6px' }}>Suggest something</div>
                <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '16px' }}>
                  What should we build next? Flag a gap, request a feature, or share what&apos;s not working. Every submission is reviewed.
                </div>
                {suggSent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: 'rgba(0,137,123,0.08)', borderRadius: '10px', border: '1px solid rgba(0,137,123,0.2)' }}>
                    <svg width="16" height="16" fill="none" stroke="#00897B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#00897B' }}>Received — thank you. We&apos;ll review it before the next build cycle.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <textarea
                      value={suggText}
                      onChange={e => setSuggText(e.target.value)}
                      placeholder="Describe the feature, gap, or issue…"
                      rows={4}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', fontSize: '13px', color: '#0F1923', lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
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
                      style={{ alignSelf: 'flex-end', padding: '10px 22px', borderRadius: '10px', border: 'none', background: suggText.trim() && !suggSending ? '#00897B' : '#DDE8EE', color: suggText.trim() && !suggSending ? '#FFFFFF' : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: suggText.trim() && !suggSending ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'background 0.15s' }}>
                      {suggSending ? 'Sending…' : 'Submit suggestion'}
                    </button>
                  </div>
                )}
              </div>

              {/* ── Footer note ── */}
              <div style={{ textAlign: 'center', fontSize: '13px', color: '#5B7080', lineHeight: 1.7, paddingBottom: '8px' }}>
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

      {/* ── Login History Modal ── */}
      {loginHistoryStaff && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setLoginHistoryStaff(null)}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923' }}>{loginHistoryStaff.name}</div>
                <div style={{ fontSize: '11px', color: '#5B7080' }}>{loginHistoryStaff.email} · Login history</div>
              </div>
              <button onClick={() => setLoginHistoryStaff(null)}
                style={{ width: '28px', height: '28px', borderRadius: '7px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" fill="none" stroke="#5B7080" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loginHistoryLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>Loading history…</div>
              ) : loginHistory.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>No login records found yet.</div>
              ) : (
                <>
                  {/* Stats bar */}
                  {(() => {
                    const successful = loginHistory.filter(r => r.success)
                    const failed     = loginHistory.filter(r => !r.success)
                    const lastOk     = successful[0]
                    return (
                      <div style={{ display: 'flex', gap: '20px', padding: '14px 24px', background: '#F8FAFC', borderBottom: '1px solid #E8EEF4' }}>
                        {[
                          { label: 'Total logins', value: successful.length, color: '#00897B' },
                          { label: 'Failed attempts', value: failed.length, color: failed.length > 0 ? '#DC2626' : '#B8CDD8' },
                          { label: 'Last seen', value: lastOk ? new Date(lastOk.attempted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' }) : '—', color: '#0E7490' },
                        ].map(s => (
                          <div key={s.label}>
                            <div style={{ fontSize: '18px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: '#5B7080', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  {/* Table */}
                  <div style={{ padding: '0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr', padding: '8px 24px', background: '#E8EEF4' }}>
                      {['Result', 'Date & Time (Dubai)', 'IP'].map(h => (
                        <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>{h}</div>
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
                        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr', alignItems: 'center', padding: '9px 24px', borderBottom: idx < loginHistory.length - 1 ? '1px solid #E8EEF4' : 'none' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: row.success ? '#166534' : '#DC2626', background: row.success ? 'rgba(22,101,52,0.08)' : 'rgba(220,38,38,0.08)', padding: '2px 8px', borderRadius: '5px' }}>
                              {label}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F1923' }}>
                            {new Date(row.attempted_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })}
                          </div>
                          <div style={{ fontSize: '11px', color: '#5B7080', fontFamily: 'monospace' }}>{row.ip ?? '—'}</div>
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
        const ALL_ROLES = ['standard', 'hr', 'project_manager', 'project_director', 'admin', 'super_admin']
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
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1300, background: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '420px', maxWidth: '90vw', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${off?.color ?? '#00897B'}18`, border: `1px solid ${off?.color ?? '#00897B'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: off?.color ?? '#00897B' }}>{rolesStaff.name.charAt(0)}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>{rolesStaff.name}</div>
                    <div style={{ fontSize: '11px', color: '#5B7080' }}>{rolesStaff.email}</div>
                  </div>
                </div>
                <button onClick={() => setRolesOpen(false)} style={{ background: 'none', border: '1px solid #DDE8EE', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#5B7080', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit' }}>Close</button>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '12px' }}>Platform Access Roles</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {ALL_ROLES.map(r => {
                  const meta    = ROLE_META[r]
                  const checked = rolesEdit.includes(r) || (r === 'standard' && rolesEdit.length === 0)
                  const isOnly  = r === 'standard'
                  return (
                    <label key={r} onClick={() => !isOnly && toggle(r)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${checked ? meta.color + '50' : '#DDE8EE'}`, background: checked ? meta.bg : '#FAFBFC', cursor: isOnly ? 'default' : 'pointer', transition: 'all 0.15s' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${checked ? meta.color : '#DDE8EE'}`, background: checked ? meta.color : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                        {checked && <svg width="10" height="10" viewBox="0 0 12 12" fill="white"><polyline points="2,6 5,9 10,3" strokeWidth="2" stroke="white" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: checked ? meta.color : '#0F1923' }}>{meta.label}</div>
                        <div style={{ fontSize: '11px', color: '#5B7080', marginTop: '1px' }}>{meta.desc}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div style={{ padding: '10px 14px', background: '#E8EEF4', borderRadius: '8px', fontSize: '11px', color: '#5B7080', marginBottom: '20px', lineHeight: 1.5 }}>
                Changes override HRMS sync until the next full sync. HRMS roles will re-apply on next sync unless you want them locked.
              </div>
              <button onClick={save} disabled={rolesSaving} style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: rolesSaving ? '#B8CDD8' : 'linear-gradient(135deg, #00897B 0%, #00695C 100%)', color: rolesSaving ? '#5B7080' : 'white', fontSize: '14px', fontWeight: 800, cursor: rolesSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
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
        const LEVEL_COLOR_D: Record<string,string> = { super_admin:'#7C3AED', office_head:'#DC2626', dept_head:'#D97706', team_lead:'#1565C0', staff:'#5B7080' }
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
            <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '520px', background: '#FFFFFF', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', zIndex: 1201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '24px 24px 0', borderBottom: '1px solid #DDE8EE', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00897B', marginBottom: '4px' }}>Platform Access</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F1923' }}>Tool Permissions</div>
                  </div>
                  <button onClick={() => setPermOpen(false)} style={{ background: 'none', border: '1px solid #DDE8EE', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#5B7080', display: 'flex', alignItems: 'center' }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                {/* Person card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F6F8FB', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${off?.color ?? '#00897B'}18`, border: `1.5px solid ${off?.color ?? '#00897B'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: off?.color ?? '#00897B' }}>{permStaff.name.charAt(0)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{permStaff.name}</div>
                    <div style={{ fontSize: '11px', color: '#5B7080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{permStaff.email}</div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: `${LEVEL_COLOR_D[permStaff.job_level] ?? '#5B7080'}15`, color: LEVEL_COLOR_D[permStaff.job_level] ?? '#5B7080', flexShrink: 0 }}>
                    {LEVEL_LABEL_D[permStaff.job_level] ?? permStaff.job_level}
                  </span>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['person', 'bulk'] as const).map(t => (
                    <button key={t} onClick={() => setPermTab(t)} style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: permTab === t ? '2px solid #00897B' : '2px solid transparent', color: permTab === t ? '#00897B' : '#5B7080', fontSize: '13px', fontWeight: permTab === t ? 800 : 600, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                      <div style={{ marginBottom: '16px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#7C3AED', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
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
                            style={{ background: granted ? `${tool.color}07` : '#FAFBFC', border: granted ? `1.5px solid ${tool.color}35` : '1.5px solid #E8EEF4', borderRadius: '12px', padding: '14px', cursor: isSuperAdmin ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', opacity: saving ? 0.65 : 1, transition: 'all 0.15s' }}
                          >
                            {/* Icon + toggle row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: granted ? `${tool.color}18` : '#EAEEF2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: granted ? tool.color : '#B8CDD8', transition: 'all 0.15s' }}>
                                {tool.icon}
                              </div>
                              {/* Toggle */}
                              <div style={{ width: '34px', height: '19px', borderRadius: '10px', background: saving ? '#DDE8EE' : (granted ? tool.color : '#DDE8EE'), position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                                <div style={{ position: 'absolute', top: '2px', left: granted ? '17px' : '2px', width: '15px', height: '15px', borderRadius: '50%', background: saving ? '#B8CDD8' : '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.18)', transition: 'left 0.15s' }} />
                              </div>
                            </div>
                            {/* Name */}
                            <div style={{ fontSize: '12px', fontWeight: 800, color: granted ? '#0F1923' : '#8899A8', lineHeight: 1.2 }}>{tool.label}</div>
                            {/* Desc */}
                            <div style={{ fontSize: '11px', color: '#A0B0BB', lineHeight: 1.45 }}>{tool.desc}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '12px', color: '#B8CDD8', fontWeight: 600, textAlign: 'center' }}>
                      {isSuperAdmin ? 'All tools — unrestricted' : `${Object.values(permGrants).filter(Boolean).length} of ${PLATFORM_TOOLS.length} tools granted`}
                    </div>
                  </>
                )}

                {/* ── Bulk Grant tab ── */}
                {permTab === 'bulk' && (
                  <div>
                    <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '18px', lineHeight: 1.6 }}>
                      Pick a tool, select staff members, then grant access to all at once.
                    </div>

                    {/* Tool picker */}
                    <div style={{ marginBottom: '18px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B8CDD8', marginBottom: '8px' }}>Tool to Grant</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {PLATFORM_TOOLS.map(tool => (
                          <button key={tool.key} onClick={() => { setBulkTool(tool.key); setBulkSel(new Set()); setBulkDone(null) }}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: bulkTool === tool.key ? `1.5px solid ${tool.color}` : '1.5px solid #DDE8EE', background: bulkTool === tool.key ? `${tool.color}10` : '#FFFFFF', color: bulkTool === tool.key ? tool.color : '#5B7080', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: bulkTool === tool.key ? tool.color : '#B8CDD8', flexShrink: 0 }} />
                            {tool.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Staff list header */}
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B8CDD8', marginBottom: '8px' }}>Select Staff</div>
                    <div style={{ position: 'relative', marginBottom: '6px' }}>
                      <svg width="12" height="12" fill="none" stroke="#5B7080" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)} placeholder="Search name, email, department…"
                        style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '30px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <button onClick={() => {
                        const noAccess = bulkFiltered.filter(s => !(s.tool_grants?.[bulkTool] ?? (bulkTool === 'smart_data' && (s.toolkit_access ?? false))))
                        setBulkSel(new Set(noAccess.map(s => s.id)))
                      }} style={{ background: 'none', border: 'none', color: '#00897B', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                        Select without access
                      </button>
                      {bulkSel.size > 0 && (
                        <button onClick={() => setBulkSel(new Set())} style={{ background: 'none', border: 'none', color: '#5B7080', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                          Clear ({bulkSel.size} selected)
                        </button>
                      )}
                    </div>

                    {/* Staff rows */}
                    <div style={{ background: '#FAFBFC', border: '1px solid #E8EEF4', borderRadius: '10px', overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' }}>
                      {bulkFiltered.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>No staff match your search.</div>
                      ) : bulkFiltered.map((s, idx) => {
                        const hasAccess = s.tool_grants?.[bulkTool] ?? (bulkTool === 'smart_data' && (s.toolkit_access ?? false))
                        const isSel     = bulkSel.has(s.id)
                        const offS      = OFFICES.find(o => o.id === s.office_id)
                        return (
                          <div key={s.id}
                            onClick={() => setBulkSel(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: idx < bulkFiltered.length - 1 ? '1px solid #E8EEF4' : 'none', cursor: 'pointer', background: isSel ? 'rgba(0,137,123,0.05)' : 'transparent' }}
                          >
                            {/* Checkbox */}
                            <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${isSel ? '#00897B' : '#C8D8E0'}`, background: isSel ? '#00897B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                              {isSel && <svg width="9" height="9" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                            {/* Avatar */}
                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${offS?.color ?? '#00897B'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: offS?.color ?? '#00897B' }}>{s.name.charAt(0)}</span>
                            </div>
                            {/* Name + dept */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                              <div style={{ fontSize: '10px', color: '#5B7080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.department ?? '—'}</div>
                            </div>
                            {/* Access status */}
                            {hasAccess ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: bulkToolDef.color }} />
                                <span style={{ fontSize: '10px', fontWeight: 700, color: bulkToolDef.color }}>Access</span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '10px', fontWeight: 600, color: '#C8D8E0', flexShrink: 0 }}>No access</span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Success banner */}
                    {bulkDone && (
                      <div style={{ marginTop: '10px', background: 'rgba(22,101,52,0.08)', border: '1px solid rgba(22,101,52,0.2)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#166534', fontWeight: 600 }}>
                        {bulkDone}
                      </div>
                    )}

                    {/* Grant button */}
                    <button
                      disabled={bulkSel.size === 0 || bulkSaving}
                      onClick={handleBulkGrant}
                      style={{ marginTop: '12px', width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: bulkSel.size === 0 || bulkSaving ? '#DDE8EE' : bulkToolDef.color, color: bulkSel.size === 0 || bulkSaving ? '#B8CDD8' : '#FFFFFF', fontSize: '14px', fontWeight: 800, cursor: bulkSel.size === 0 || bulkSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      {bulkSaving ? (
                        <>
                          <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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
                <div style={{ padding: '16px 24px', borderTop: '1px solid #DDE8EE', flexShrink: 0 }}>
                  <button onClick={() => setPermOpen(false)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#00897B', color: '#FFFFFF', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
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
