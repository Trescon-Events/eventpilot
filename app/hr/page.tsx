'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

/* ── Types ──────────────────────────────────────────────────────────── */
type OnboardingRecord = {
  id: string
  staff_id: string
  started_at: string
  target_end: string | null
  status: string
  staff: { id: string; name: string; department: string } | null
  task_count: number
  tasks_done: number
}

type OffboardingRecord = {
  id: string
  staff_id: string
  last_working_day: string
  reason: string
  staff: { id: string; name: string; department: string } | null
  task_count: number
  tasks_done: number
}

type LeaveRequest = {
  id: string
  staff_id: string
  start_date: string
  end_date: string
  total_days: number
  created_at: string
  staff: { name: string; department: string } | null
  leave_type: { name: string } | null
}

type AlertRecord = {
  id: string
  type: string
  title: string
  due_date: string | null
  status: string
  staff: { name: string; department: string } | null
}

type TrainingRecord = {
  id: string
  staff_id: string
  due_date: string
  staff: { name: string; department: string } | null
  course: { title: string } | null
}

type ContractRecord = {
  id: string
  staff_id: string
  contract_end_date: string
  contract_type: string
  staff: { name: string; department: string } | null
}

type HistoryRecord = {
  id: string
  change_type: string
  new_value: Record<string, unknown>
  notes: string | null
  created_at: string
  staff: { name: string; department: string } | null
}

type DashData = {
  as_of: string
  headcount: {
    total: number
    by_department: Record<string, number>
    on_leave_today: number
  }
  onboarding: {
    active_count: number
    records: OnboardingRecord[]
  }
  offboarding: {
    active_count: number
    records: OffboardingRecord[]
  }
  leave: {
    pending_count: number
    pending_requests: LeaveRequest[]
  }
  alerts: {
    open_count: number
    records: AlertRecord[]
  }
  training: {
    overdue_count: number
    overdue: TrainingRecord[]
  }
  contracts: {
    expiring_soon_count: number
    expiring: ContractRecord[]
  }
  recent_history: HistoryRecord[]
}

type InitResult = {
  total_staff: number
  contracts_created: number
  balances_created: number
  history_created: number
}

type HistoryFilter = 'all' | 'hire' | 'promotion' | 'departure'

/* ── Palette ─────────────────────────────────────────────────────────── */
const C = {
  bg:       '#F6F8FB',
  surface:  '#FFFFFF',
  border:   '#DDE8EE',
  text:     '#0F1923',
  muted:    '#5B7080',
  teal:     '#00897B',
  tealAcc:  '#00A5A3',
  lime:     '#C0F43C',
  red:      '#8B1A1A',
  purple:   '#6C54B5',
  amber:    '#D97706',
  blue:     '#1565C0',
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function Pill({ color, text }: { color: string; text: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 700,
      background: color + '20',
      color,
      letterSpacing: '0.3px',
      whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      color: C.muted,
      marginBottom: '14px',
    }}>
      {children}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      padding: '32px 20px',
      color: C.muted,
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke={C.teal} strokeWidth="1.5" />
        <path d="M8 12l3 3 5-5" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: '15px', color: C.muted }}>{message}</span>
    </div>
  )
}

function Shimmer() {
  return (
    <div style={{
      background: 'linear-gradient(90deg, #e8edf2 25%, #f0f4f7 50%, #e8edf2 75%)',
      backgroundSize: '400% 100%',
      borderRadius: '12px',
      animation: 'shimmer 1.4s ease-in-out infinite',
    }} />
  )
}

function alertColor(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('expir') || t.includes('contract')) return C.amber
  if (t.includes('overdue'))                          return C.red
  if (t.includes('anniversary') || t.includes('birthday')) return C.purple
  return C.tealAcc
}

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return '1 day ago'
  return `${diff} days ago`
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function daysOverdue(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/* ── Main Page ────────────────────────────────────────────────────────── */
export default function HRDashboard() {
  const [data, setData]                     = useState<DashData | null>(null)
  const [loading, setLoading]               = useState(true)
  const [syncing, setSyncing]               = useState(false)
  const [historyFilter, setHistoryFilter]   = useState<HistoryFilter>('all')
  const [initState, setInitState]           = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [initResult, setInitResult]         = useState<InitResult | null>(null)
  const [initBannerDismissed, setInitBannerDismissed] = useState(false)

  const leaveSectionRef    = useRef<HTMLDivElement>(null)
  const alertsSectionRef   = useRef<HTMLDivElement>(null)
  const trainingSectionRef = useRef<HTMLDivElement>(null)
  const contractsSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setInitBannerDismissed(localStorage.getItem('hrms_init_done') === 'true')
    }
  }, [])

  const refreshDashboard = useCallback(() => {
    fetch('/api/hr/dashboard')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/hr/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function dismissInitBanner() {
    localStorage.setItem('hrms_init_done', 'true')
    setInitBannerDismissed(true)
  }

  async function runInit() {
    setInitState('running')
    try {
      const res = await fetch('/api/hr/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const result = await res.json()
      setInitResult(result)
      setInitState('done')
      localStorage.setItem('hrms_init_done', 'true')
      setInitBannerDismissed(true)
      setLoading(true)
      fetch('/api/hr/dashboard')
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false) })
    } catch {
      setInitState('error')
    }
  }

  async function runAlertChecks() {
    await fetch('/api/hr/alerts?run_checks=true', { method: 'POST' })
    refreshDashboard()
  }

  async function syncHRMS() {
    setSyncing(true)
    await fetch('/api/hrms-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: 'eventpilot2026' }),
    })
    setSyncing(false)
    refreshDashboard()
  }

  const filteredHistory = data?.recent_history.filter(h => {
    if (historyFilter === 'all') return true
    const ct = h.change_type.toLowerCase()
    if (historyFilter === 'hire')      return ct.includes('hire') || ct.includes('join') || ct.includes('onboard')
    if (historyFilter === 'promotion') return ct.includes('promot') || ct.includes('transfer') || ct.includes('title')
    if (historyFilter === 'departure') return ct.includes('terminat') || ct.includes('resign') || ct.includes('offboard') || ct.includes('exit')
    return true
  }).slice(0, 20) ?? []

  /* ── Render ── */
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, -apple-system, sans-serif', color: C.text }}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-8px); max-height: 0; padding: 0; margin: 0; }
        }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1320px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Dashboard
            </Link>
            <div style={{ width: '1px', height: '20px', background: C.border }} />
            <div>
              <span style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>HR Portal</span>
              <span style={{ fontSize: '13px', color: C.muted, marginLeft: '8px' }}>Trescon</span>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={runAlertChecks}
              style={{ padding: '8px 14px', borderRadius: '8px', background: C.surface, color: C.teal, fontSize: '13px', fontWeight: 700, border: `1px solid ${C.teal}40`, cursor: 'pointer', fontFamily: 'inherit' }}>
              Run Alert Checks
            </button>
            <button
              onClick={syncHRMS}
              disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: syncing ? C.bg : C.teal, color: syncing ? C.muted : '#fff', fontSize: '13px', fontWeight: 700, border: `1px solid ${syncing ? C.border : C.teal}`, cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {syncing ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <circle cx="12" cy="12" r="9" stroke={C.muted} strokeWidth="2.5" strokeDasharray="28 56" />
                  </svg>
                  Syncing...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M4 12a8 8 0 0 1 14.93-4H15m-11 4a8 8 0 0 0 14.93 4H20" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Sync HRMS
                </>
              )}
            </button>
            <div style={{ width: '1px', height: '20px', background: C.border }} />
            <Link href="/hr/attendance" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: C.muted, textDecoration: 'none' }}>Attendance</Link>
            <Link href="/hr/recruitment" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: C.muted, textDecoration: 'none' }}>Recruitment</Link>
            <Link href="/hr/staff" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: C.muted, textDecoration: 'none' }}>Staff Directory</Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1320px', margin: '0 auto', padding: '28px 32px' }}>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ flex: 1 }}>
                  <Shimmer />
                  <div style={{ height: '88px', background: 'linear-gradient(90deg, #e8edf2 25%, #f0f4f7 50%, #e8edf2 75%)', backgroundSize: '400% 100%', borderRadius: '12px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                </div>
              ))}
            </div>
            <div style={{ height: '320px', background: 'linear-gradient(90deg, #e8edf2 25%, #f0f4f7 50%, #e8edf2 75%)', backgroundSize: '400% 100%', borderRadius: '16px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
            <div style={{ height: '220px', background: 'linear-gradient(90deg, #e8edf2 25%, #f0f4f7 50%, #e8edf2 75%)', backgroundSize: '400% 100%', borderRadius: '16px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
          </div>
        )}

        {!loading && !data && (
          <div style={{ textAlign: 'center', padding: '80px', color: C.red, fontSize: '15px', fontWeight: 600 }}>
            Failed to load dashboard data. Please refresh.
          </div>
        )}

        {/* ── HRMS Init Banner ── */}
        {!loading && data && !initBannerDismissed && initState === 'idle' &&
          data.headcount.total > 0 && data.onboarding.active_count === 0 && data.contracts.expiring_soon_count === 0 && (
          <div style={{ background: C.amber + '14', border: `1px solid ${C.amber}40`, borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: C.amber, marginBottom: '2px' }}>First-time setup</div>
              <div style={{ fontSize: '13px', color: C.muted }}>Create starter contracts, leave balances, and employment history for all active staff. Safe to run — skips anyone already set up.</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={dismissInitBanner} style={{ padding: '9px 14px', borderRadius: '8px', background: 'transparent', color: C.muted, fontSize: '13px', fontWeight: 600, border: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Dismiss</button>
              <button onClick={runInit} style={{ padding: '9px 20px', borderRadius: '8px', background: C.amber, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Initialise HRMS</button>
            </div>
          </div>
        )}

        {initState === 'running' && (
          <div style={{ background: C.teal + '12', border: `1px solid ${C.teal}30`, borderRadius: '12px', padding: '14px 20px', marginBottom: '20px', fontSize: '13px', color: C.teal, fontWeight: 700 }}>
            Setting up HRMS records for all staff...
          </div>
        )}
        {initState === 'done' && initResult && (
          <div style={{ background: C.teal + '12', border: `1px solid ${C.teal}30`, borderRadius: '12px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: C.teal, marginBottom: '2px' }}>HRMS initialised successfully</div>
              <div style={{ fontSize: '13px', color: C.muted }}>
                {initResult.total_staff} staff · {initResult.contracts_created} contracts · {initResult.balances_created} leave balance rows · {initResult.history_created} hire records
              </div>
            </div>
            <button onClick={() => setInitState('idle')} style={{ fontSize: '12px', color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>dismiss</button>
          </div>
        )}
        {initState === 'error' && (
          <div style={{ background: C.red + '12', border: `1px solid ${C.red}30`, borderRadius: '12px', padding: '14px 20px', marginBottom: '20px', fontSize: '13px', color: C.red, fontWeight: 700 }}>
            Initialisation failed — check the console and try again.
          </div>
        )}

        {!loading && data && (
          <>
            {/* ── Stats Strip ── */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
              <StatTile
                label="Total Staff"
                value={data.headcount.total}
                sub="active employees"
                accent={C.teal}
              />
              <StatTile
                label="On Leave Today"
                value={data.headcount.on_leave_today}
                sub="approved absences"
                accent={C.purple}
              />
              <StatTile
                label="Leave Pending"
                value={data.leave.pending_count}
                sub="awaiting your approval"
                accent={C.amber}
                onClick={() => leaveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
              <StatTile
                label="Open Alerts"
                value={data.alerts.open_count}
                sub="need attention"
                accent={C.red}
                onClick={() => alertsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
              <StatTile
                label="Onboarding"
                value={data.onboarding.active_count}
                sub="in progress"
                accent={C.blue}
              />
              <StatTile
                label="Contracts Expiring"
                value={data.contracts.expiring_soon_count}
                sub="within 30 days"
                accent={C.amber}
                onClick={() => contractsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
            </div>

            {/* ── Two-column main ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '65% 1fr', gap: '24px', alignItems: 'start' }}>

              {/* ── LEFT COLUMN: Action Required ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

                {/* Section A: Leave Requests */}
                <div ref={leaveSectionRef} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="4" width="18" height="18" rx="3" stroke={C.teal} strokeWidth="1.8" />
                        <path d="M16 2v4M8 2v4M3 10h18" stroke={C.teal} strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>Leave Requests</span>
                      {data.leave.pending_count > 0 && (
                        <span style={{ background: C.amber, color: '#fff', borderRadius: '10px', fontSize: '12px', fontWeight: 800, padding: '2px 8px' }}>
                          {data.leave.pending_count}
                        </span>
                      )}
                    </div>
                    {data.leave.pending_requests.length > 5 && (
                      <Link href="/hr/leave" style={{ fontSize: '13px', fontWeight: 700, color: C.teal, textDecoration: 'none' }}>
                        View all {data.leave.pending_count} requests →
                      </Link>
                    )}
                  </div>

                  {data.leave.pending_requests.length === 0 ? (
                    <EmptyState message="All clear — no pending leave requests" />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {data.leave.pending_requests.slice(0, 5).map(req => (
                        <LeaveApprovalCard key={req.id} req={req} onAction={refreshDashboard} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Section B: HR Alerts */}
                <div ref={alertsSectionRef} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2a7 7 0 0 1 7 7c0 4-2.5 6.5-3 8H8c-.5-1.5-3-4-3-8a7 7 0 0 1 7-7z" stroke={C.red} strokeWidth="1.8" />
                        <path d="M9 21h6" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>HR Alerts</span>
                      {data.alerts.open_count > 0 && (
                        <span style={{ background: C.red, color: '#fff', borderRadius: '10px', fontSize: '12px', fontWeight: 800, padding: '2px 8px' }}>
                          {data.alerts.open_count}
                        </span>
                      )}
                    </div>
                  </div>

                  {data.alerts.records.length === 0 ? (
                    <EmptyState message="No open alerts" />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[...data.alerts.records]
                        .sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1))
                        .slice(0, 8)
                        .map(alert => (
                          <AlertCard key={alert.id} alert={alert} onResolve={refreshDashboard} />
                        ))}
                      {data.alerts.records.length > 8 && (
                        <div style={{ textAlign: 'right', paddingTop: '4px' }}>
                          <Link href="/hr/alerts" style={{ fontSize: '13px', fontWeight: 700, color: C.teal, textDecoration: 'none' }}>
                            View all {data.alerts.records.length} alerts →
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Section C: Overdue Training */}
                <div ref={trainingSectionRef} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden', marginBottom: '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 24px', borderBottom: data.training.overdue.length > 0 ? `1px solid ${C.border}` : 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" stroke={C.red} strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>Overdue Training</span>
                    {data.training.overdue_count > 0 && (
                      <span style={{ background: C.red, color: '#fff', borderRadius: '10px', fontSize: '12px', fontWeight: 800, padding: '2px 8px' }}>
                        {data.training.overdue_count}
                      </span>
                    )}
                  </div>

                  {data.training.overdue.length === 0 ? (
                    <EmptyState message="No overdue training assignments" />
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                          {['Staff', 'Department', 'Course', 'Due Date', 'Days Overdue'].map(h => (
                            <th key={h} style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.8px', textTransform: 'uppercase', textAlign: 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.training.overdue.slice(0, 10).map((a, i) => {
                          const days = daysOverdue(a.due_date)
                          return (
                            <tr key={a.id} style={{ borderBottom: i < data.training.overdue.length - 1 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? C.surface : C.bg }}>
                              <td style={{ padding: '12px 16px', fontSize: '15px', fontWeight: 700, color: C.text }}>{a.staff?.name ?? '—'}</td>
                              <td style={{ padding: '12px 16px', fontSize: '15px', color: C.muted }}>{a.staff?.department ?? '—'}</td>
                              <td style={{ padding: '12px 16px', fontSize: '15px', color: C.text }}>{a.course?.title ?? '—'}</td>
                              <td style={{ padding: '12px 16px', fontSize: '15px', color: C.amber, fontWeight: 600 }}>{fmtDate(a.due_date)}</td>
                              <td style={{ padding: '12px 16px' }}><Pill color={C.red} text={`${days}d overdue`} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* ── RIGHT COLUMN: Status Overview ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Panel A: Department Headcount */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '22px' }}>
                  <SectionLabel>Department Headcount</SectionLabel>
                  {Object.keys(data.headcount.by_department).length === 0 ? (
                    <div style={{ fontSize: '15px', color: C.muted }}>No department data.</div>
                  ) : (() => {
                    const entries = Object.entries(data.headcount.by_department).sort((a, b) => b[1] - a[1])
                    const max = entries[0]?.[1] ?? 1
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                        {entries.map(([dept, count]) => (
                          <div key={dept}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{dept}</span>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>{count}</span>
                            </div>
                            <div style={{ height: '5px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.round((count / max) * 100)}%`, background: C.teal, borderRadius: '3px' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* Panel B: Active Onboardings */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <SectionLabel>Active Onboardings</SectionLabel>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '-14px' }}>
                      {data.onboarding.records.length > 3 && (
                        <Link href="/hr/onboarding" style={{ fontSize: '12px', fontWeight: 700, color: C.teal, textDecoration: 'none' }}>View All</Link>
                      )}
                      <Link href="/hr/staff/new" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', background: C.teal, color: '#fff', textDecoration: 'none', fontSize: '11px', fontWeight: 700 }}>
                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Staff
                      </Link>
                    </div>
                  </div>
                  {data.onboarding.records.length === 0 ? (
                    <EmptyState message="No active onboardings" />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {data.onboarding.records.slice(0, 3).map(ob => {
                        const pct = ob.task_count > 0 ? Math.round((ob.tasks_done / ob.task_count) * 100) : 0
                        return (
                          <Link key={ob.id} href={`/hr/staff/${ob.staff_id}`} style={{ textDecoration: 'none', display: 'block', borderRadius: '10px', padding: '12px', border: `1px solid ${C.border}`, background: C.bg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 700, color: C.text }}>{ob.staff?.name ?? ob.staff_id}</span>
                              <span style={{ fontSize: '13px', color: C.muted, fontWeight: 600 }}>{pct}%</span>
                            </div>
                            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '6px' }}>{ob.staff?.department}</div>
                            <div style={{ height: '5px', background: C.border, borderRadius: '3px', overflow: 'hidden', marginBottom: '4px' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.teal : C.amber, borderRadius: '3px' }} />
                            </div>
                            <div style={{ fontSize: '12px', color: C.muted }}>{ob.tasks_done}/{ob.task_count} tasks</div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Panel C: Active Offboardings */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '22px' }}>
                  <SectionLabel>Active Offboardings</SectionLabel>
                  {data.offboarding.records.length === 0 ? (
                    <EmptyState message="No active offboardings" />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {data.offboarding.records.map(ob => {
                        const pct = ob.task_count > 0 ? Math.round((ob.tasks_done / ob.task_count) * 100) : 0
                        const reasonColor = ob.reason?.toLowerCase().includes('terminat') ? C.red : C.amber
                        return (
                          <Link key={ob.id} href={`/hr/staff/${ob.staff_id}`} style={{ textDecoration: 'none', display: 'block', borderRadius: '10px', padding: '12px', border: `1px solid ${C.border}`, background: C.bg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 700, color: C.text }}>{ob.staff?.name ?? ob.staff_id}</span>
                              <Pill color={reasonColor} text={ob.reason ?? 'exit'} />
                            </div>
                            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '6px' }}>
                              {ob.staff?.department} · Last day: {fmtDate(ob.last_working_day)}
                            </div>
                            <div style={{ height: '5px', background: C.border, borderRadius: '3px', overflow: 'hidden', marginBottom: '4px' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: C.red, borderRadius: '3px' }} />
                            </div>
                            <div style={{ fontSize: '12px', color: C.muted }}>{ob.tasks_done}/{ob.task_count} tasks</div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Panel D: Contracts Expiring */}
                <div ref={contractsSectionRef} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '22px' }}>
                  <SectionLabel>Contracts Expiring (30 days)</SectionLabel>
                  {data.contracts.expiring.length === 0 ? (
                    <EmptyState message="No contracts expiring soon" />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {data.contracts.expiring.map(c => {
                        const days = daysUntil(c.contract_end_date)
                        const dateColor = days <= 7 ? C.red : days <= 14 ? C.amber : C.muted
                        return (
                          <Link key={c.id} href={`/hr/staff/${c.staff_id}`} style={{ textDecoration: 'none', display: 'block', borderRadius: '10px', padding: '12px', border: `1px solid ${C.border}`, background: C.bg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: C.text, marginBottom: '2px' }}>{c.staff?.name ?? '—'}</div>
                                <div style={{ fontSize: '12px', color: C.muted }}>{c.staff?.department}</div>
                                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{c.contract_type}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: dateColor }}>{fmtDate(c.contract_end_date)}</div>
                                <div style={{ fontSize: '12px', color: dateColor, marginTop: '2px' }}>{days}d left</div>
                              </div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Recent Activity (full width) ── */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px', marginTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke={C.teal} strokeWidth="1.8" />
                    <path d="M12 7v5l3 3" stroke={C.teal} strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>Recent Activity</span>
                </div>

                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['all', 'hire', 'promotion', 'departure'] as HistoryFilter[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setHistoryFilter(f)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 700,
                        border: `1px solid ${historyFilter === f ? C.teal : C.border}`,
                        background: historyFilter === f ? C.teal + '15' : 'transparent',
                        color: historyFilter === f ? C.teal : C.muted,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textTransform: 'capitalize',
                      }}>
                      {f === 'all' ? 'All' : f === 'hire' ? 'Hires' : f === 'promotion' ? 'Promotions' : 'Departures'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <EmptyState message="No activity matching this filter" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {filteredHistory.map((h, i) => {
                    const ct = h.change_type.toLowerCase()
                    const chipColor = ct.includes('hire') || ct.includes('join') ? C.teal
                      : ct.includes('promot') || ct.includes('transfer') ? C.blue
                      : ct.includes('terminat') || ct.includes('resign') ? C.red
                      : C.purple
                    return (
                      <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', padding: '14px 0', borderBottom: i < filteredHistory.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4px' }}>
                          <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: C.teal, flexShrink: 0 }} />
                          {i < filteredHistory.length - 1 && (
                            <div style={{ width: '1px', flex: 1, background: C.border, marginTop: '4px', minHeight: '20px' }} />
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '15px', fontWeight: 700, color: C.text }}>{h.staff?.name ?? 'Unknown'}</span>
                            <Pill color={chipColor} text={h.change_type.replace(/_/g, ' ')} />
                            {h.staff?.department && (
                              <span style={{ fontSize: '13px', color: C.muted }}>{h.staff.department}</span>
                            )}
                          </div>
                          {h.notes && (
                            <div style={{ fontSize: '15px', color: C.muted, marginTop: '3px' }}>{h.notes}</div>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: C.muted, whiteSpace: 'nowrap', paddingTop: '2px' }}>
                          {fmtDate(h.created_at)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Stat Tile ───────────────────────────────────────────────────────── */
function StatTile({
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  label: string
  value: number
  sub: string
  accent: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        border: `1px solid #DDE8EE`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: '12px',
        padding: '18px 20px',
        flex: 1,
        minWidth: '140px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.12s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 12px ${accent}22` }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '30px', fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#5B7080', marginTop: '5px' }}>{sub}</div>
    </div>
  )
}

/* ── Leave Approval Card ─────────────────────────────────────────────── */
function LeaveApprovalCard({
  req,
  onAction,
}: {
  req: LeaveRequest
  onAction: () => void
}) {
  const [note, setNote]     = useState('')
  const [busy, setBusy]     = useState(false)
  const [done, setDone]     = useState(false)
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null)

  async function decide(status: 'approved' | 'rejected') {
    setBusy(true)
    await fetch('/api/hr/leave-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: req.id, status, review_note: note || null }),
    })
    setDecided(status)
    setDone(true)
    setBusy(false)
    setTimeout(() => onAction(), 600)
  }

  if (done) {
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.5 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill={decided === 'approved' ? C.teal : C.red} />
          <path d={decided === 'approved' ? 'M8 12l3 3 5-5' : 'M8 8l8 8M16 8l-8 8'} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: '13px', color: C.muted, fontWeight: 600 }}>
          {decided === 'approved' ? 'Approved' : 'Rejected'} — {req.staff?.name}
        </span>
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '18px 20px', background: '#FFFFFF' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>{req.staff?.name ?? req.staff_id}</span>
            {req.staff?.department && <Pill color={C.blue} text={req.staff.department} />}
            {req.leave_type?.name && <Pill color={C.purple} text={req.leave_type.name} />}
          </div>
          {/* Date range */}
          <div style={{ fontSize: '15px', color: C.muted, marginBottom: '3px' }}>
            {fmtDate(req.start_date)} — {fmtDate(req.end_date)}
            <strong style={{ color: C.text, marginLeft: '8px' }}>{req.total_days} day{req.total_days !== 1 ? 's' : ''}</strong>
          </div>
          <div style={{ fontSize: '13px', color: C.muted, marginBottom: '12px' }}>
            Requested {daysAgo(req.created_at)}
          </div>
          {/* Note input */}
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add a note..."
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '15px', color: C.text, fontFamily: 'inherit', outline: 'none', background: C.bg }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, minWidth: '96px' }}>
          <button
            disabled={busy}
            onClick={() => decide('approved')}
            style={{ padding: '9px 18px', borderRadius: '8px', background: C.teal, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.5 : 1, fontFamily: 'inherit' }}>
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => decide('rejected')}
            style={{ padding: '9px 18px', borderRadius: '8px', background: '#fff', color: C.red, fontSize: '13px', fontWeight: 700, border: `1px solid ${C.red}50`, cursor: 'pointer', opacity: busy ? 0.5 : 1, fontFamily: 'inherit' }}>
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Alert Card ──────────────────────────────────────────────────────── */
function AlertCard({
  alert,
  onResolve,
}: {
  alert: AlertRecord
  onResolve: () => void
}) {
  const [busy, setBusy]   = useState(false)
  const [hidden, setHidden] = useState(false)
  const color = alertColor(alert.type)

  async function act(status: 'acknowledged' | 'resolved') {
    setBusy(true)
    await fetch('/api/hr/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alert.id, status }),
    })
    setBusy(false)
    setHidden(true)
    setTimeout(() => onResolve(), 400)
  }

  if (hidden) return null

  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: '10px',
      padding: '12px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
      opacity: busy ? 0.5 : 1,
      transition: 'opacity 0.15s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
          <Pill color={color} text={alert.type.replace(/_/g, ' ')} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: C.text }}>{alert.title}</span>
        </div>
        <div style={{ fontSize: '13px', color: C.muted }}>
          {alert.staff?.name && <span>{alert.staff.name}</span>}
          {alert.staff?.department && <span> · {alert.staff.department}</span>}
          {alert.due_date && <span> · due {fmtDate(alert.due_date)}</span>}
          {alert.status === 'acknowledged' && (
            <span style={{ marginLeft: '8px' }}><Pill color={C.muted} text="acknowledged" /></span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {alert.status === 'open' && (
          <button
            disabled={busy}
            onClick={() => act('acknowledged')}
            style={{ padding: '6px 12px', borderRadius: '7px', border: `1px solid ${C.border}`, background: C.bg, fontSize: '12px', fontWeight: 700, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
            Acknowledge
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => act('resolved')}
          style={{ padding: '6px 12px', borderRadius: '7px', border: `1px solid ${color}50`, background: color + '14', fontSize: '12px', fontWeight: 700, color, cursor: 'pointer', fontFamily: 'inherit' }}>
          Resolve
        </button>
      </div>
    </div>
  )
}
