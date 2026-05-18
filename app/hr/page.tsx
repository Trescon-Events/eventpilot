'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

/* ── Types ──────────────────────────────────────────────────────────── */
type DashData = {
  as_of: string
  headcount: {
    total: number
    by_department: Record<string, number>
    on_leave_today: number
  }
  onboarding: {
    active_count: number
    records: Array<{
      id: string; staff_id: string; started_at: string; target_end: string | null; status: string
      staff: { id: string; name: string; department: string } | null
      task_count: number; tasks_done: number
    }>
  }
  offboarding: {
    active_count: number
    records: Array<{
      id: string; staff_id: string; last_working_day: string; reason: string
      staff: { id: string; name: string; department: string } | null
      task_count: number; tasks_done: number
    }>
  }
  leave: {
    pending_count: number
    pending_requests: Array<{
      id: string; staff_id: string; start_date: string; end_date: string; total_days: number; created_at: string
      staff: { name: string; department: string } | null
      leave_type: { name: string } | null
    }>
  }
  alerts: {
    open_count: number
    records: Array<{
      id: string; type: string; title: string; due_date: string | null; status: string
      staff: { name: string; department: string } | null
    }>
  }
  training: {
    overdue_count: number
    overdue: Array<{
      id: string; staff_id: string; due_date: string
      staff: { name: string; department: string } | null
      course: { title: string } | null
    }>
  }
  contracts: {
    expiring_soon_count: number
    expiring: Array<{
      id: string; staff_id: string; contract_end_date: string; contract_type: string
      staff: { name: string; department: string } | null
    }>
  }
  recent_history: Array<{
    id: string; change_type: string; new_value: Record<string, unknown>; notes: string | null; created_at: string
    staff: { name: string; department: string } | null
  }>
}

/* ── Palette ─────────────────────────────────────────────────────────── */
const C = {
  bg:      '#F6F8FB',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  green:   '#00897B',
  lime:    '#C0F43C',
  red:     '#8B1A1A',
  purple:  '#6C54B5',
  amber:   '#D97706',
}

const pill = (color: string, text: string) => (
  <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: color + '20', color, letterSpacing: '0.4px' }}>
    {text}
  </span>
)

const statCard = (label: string, value: number | string, sub: string, accent: string) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '20px 24px', flex: 1, minWidth: '160px' }}>
    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: C.muted, marginBottom: '8px' }}>{label}</div>
    <div style={{ fontSize: '32px', fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: '12px', color: C.muted, marginTop: '6px' }}>{sub}</div>
  </div>
)

/* ── Alert type color ─────────────────────────────────────────────────── */
function alertColor(type: string) {
  if (type.includes('expir') || type.includes('contract')) return C.amber
  if (type.includes('overdue'))                             return C.red
  if (type.includes('anniversary') || type.includes('birthday')) return C.purple
  return C.green
}

/* ── Main Page ────────────────────────────────────────────────────────── */
export default function HRDashboard() {
  const [data, setData]   = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]     = useState<'overview' | 'leave' | 'alerts' | 'training' | 'history'>('overview')
  const [initState, setInitState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [initResult, setInitResult] = useState<{ total_staff: number; contracts_created: number; balances_created: number; history_created: number } | null>(null)

  async function runInit() {
    setInitState('running')
    try {
      const res  = await fetch('/api/hr/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      setInitResult(data)
      setInitState('done')
      // Reload dashboard data after init
      fetch('/api/hr/dashboard').then(r => r.json()).then(d => setData(d))
    } catch {
      setInitState('error')
    }
  }

  useEffect(() => {
    fetch('/api/hr/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const tabs: { id: typeof tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'leave',    label: 'Leave Approvals', badge: data?.leave.pending_count },
    { id: 'alerts',   label: 'Alerts',          badge: data?.alerts.open_count },
    { id: 'training', label: 'Overdue Training', badge: data?.training.overdue_count },
    { id: 'history',  label: 'Recent Activity' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/admin" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>← Admin</Link>
            <div style={{ width: '1px', height: '20px', background: C.border }} />
            <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>HR Portal</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/hr/recruitment" style={{ padding: '8px 16px', borderRadius: '10px', background: C.purple + '15', border: `1px solid ${C.purple}30`, fontSize: '13px', fontWeight: 700, color: C.purple, textDecoration: 'none' }}>
              Recruitment
            </Link>
            <Link href="/hr/attendance" style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.text, textDecoration: 'none', background: C.surface }}>
              Attendance
            </Link>
            <Link href="/hr/leave" style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.text, textDecoration: 'none', background: C.surface }}>
              Leave Manager
            </Link>
            <button
              onClick={() => fetch('/api/hr/alerts?run_checks=true', { method: 'POST' }).then(() => window.location.reload())}
              style={{ padding: '8px 16px', borderRadius: '10px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              Run Alert Checks
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px', color: C.muted, fontSize: '15px' }}>Loading HR data...</div>
        )}

        {!loading && !data && (
          <div style={{ textAlign: 'center', padding: '80px', color: C.red, fontSize: '15px' }}>Failed to load dashboard data.</div>
        )}

        {/* ── HRMS Initialisation Banner ── */}
        {initState === 'idle' && (
          <div style={{ background: C.amber + '15', border: `1px solid ${C.amber}40`, borderRadius: '14px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: C.amber, marginBottom: '2px' }}>First-time setup required</div>
              <div style={{ fontSize: '13px', color: C.muted }}>Create starter contracts, leave balances (2026), and employment history for all active staff. Safe to run — skips anyone already set up.</div>
            </div>
            <button
              onClick={runInit}
              style={{ padding: '10px 20px', borderRadius: '10px', background: C.amber, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              Initialise HRMS
            </button>
          </div>
        )}

        {initState === 'running' && (
          <div style={{ background: C.green + '10', border: `1px solid ${C.green}30`, borderRadius: '14px', padding: '16px 20px', marginBottom: '24px', fontSize: '13px', color: C.green, fontWeight: 700 }}>
            Setting up HRMS records for all staff...
          </div>
        )}

        {initState === 'done' && initResult && (
          <div style={{ background: C.green + '10', border: `1px solid ${C.green}30`, borderRadius: '14px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: C.green, marginBottom: '4px' }}>HRMS initialised successfully</div>
              <div style={{ fontSize: '13px', color: C.muted }}>
                {initResult.total_staff} staff · {initResult.contracts_created} contracts created · {initResult.balances_created} leave balance rows · {initResult.history_created} hire records
              </div>
            </div>
            <button onClick={() => setInitState('idle')} style={{ fontSize: '12px', color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>dismiss</button>
          </div>
        )}

        {initState === 'error' && (
          <div style={{ background: C.red + '10', border: `1px solid ${C.red}30`, borderRadius: '14px', padding: '16px 20px', marginBottom: '24px', fontSize: '13px', color: C.red, fontWeight: 700 }}>
            Initialisation failed — check the console and try again.
          </div>
        )}

        {data && (
          <>
            {/* Stat strip */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px' }}>
              {statCard('Total Staff',     data.headcount.total,                           'active employees',    C.green)}
              {statCard('On Leave Today',  data.headcount.on_leave_today,                  'approved today',      C.purple)}
              {statCard('Onboarding',      data.onboarding.active_count,                   'in progress',         C.amber)}
              {statCard('Offboarding',     data.offboarding.active_count,                  'in progress',         C.red)}
              {statCard('Leave Pending',   data.leave.pending_count,                       'awaiting approval',   C.amber)}
              {statCard('Open Alerts',     data.alerts.open_count,                         'need attention',      C.red)}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: `1px solid ${C.border}`, paddingBottom: '0' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: tab === t.id ? `2px solid ${C.green}` : '2px solid transparent', color: tab === t.id ? C.green : C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
                  {t.label}
                  {(t.badge ?? 0) > 0 && (
                    <span style={{ background: C.red, color: '#fff', borderRadius: '10px', fontSize: '11px', fontWeight: 800, padding: '1px 6px' }}>{t.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Overview ── */}
            {tab === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Headcount by dept */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>Headcount by Department</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(data.headcount.by_department)
                      .sort((a, b) => b[1] - a[1])
                      .map(([dept, count]) => (
                        <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ flex: 1, fontSize: '13px', color: C.text, fontWeight: 600 }}>{dept}</div>
                          <div style={{ width: `${Math.round((count / data.headcount.total) * 140)}px`, height: '6px', background: C.green + '40', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', inset: 0, width: '100%', background: C.green, borderRadius: '3px' }} />
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, width: '24px', textAlign: 'right' }}>{count}</div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Recruitment pipeline shortcut */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Recruitment</div>
                    <Link href="/hr/recruitment" style={{ fontSize: '12px', fontWeight: 700, color: C.purple, textDecoration: 'none' }}>Open Pipeline →</Link>
                  </div>
                  {data.onboarding.records.length === 0 ? (
                    <div>
                      <div style={{ color: C.muted, fontSize: '13px', marginBottom: '16px' }}>No active onboardings.</div>
                      <Link href="/hr/recruitment" style={{ display: 'block', padding: '14px 18px', borderRadius: '12px', background: C.purple + '10', border: `1px solid ${C.purple}25`, textDecoration: 'none', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: C.purple }}>Open Recruitment Pipeline</div>
                        <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>Manage positions, screen candidates with AI, schedule interviews</div>
                      </Link>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                        {data.onboarding.records.map(ob => {
                          const pct = ob.task_count > 0 ? Math.round((ob.tasks_done / ob.task_count) * 100) : 0
                          return (
                            <Link key={ob.id} href={`/hr/staff/${ob.staff_id}`} style={{ textDecoration: 'none' }}>
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px', background: C.bg }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{ob.staff?.name ?? ob.staff_id}</div>
                                  <div style={{ fontSize: '12px', color: C.muted }}>{pct}%</div>
                                </div>
                                <div style={{ fontSize: '12px', color: C.muted }}>{ob.staff?.department} · started {ob.started_at}</div>
                                <div style={{ height: '4px', background: C.border, borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.green : C.amber, borderRadius: '2px' }} />
                                </div>
                                <div style={{ fontSize: '11px', color: C.muted }}>{ob.tasks_done}/{ob.task_count} tasks complete</div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                      <Link href="/hr/recruitment" style={{ display: 'block', padding: '10px', borderRadius: '10px', background: C.purple + '10', textDecoration: 'none', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: C.purple }}>
                        View Recruitment Pipeline →
                      </Link>
                    </div>
                  )}
                </div>

                {/* Active offboardings */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>Active Offboardings</div>
                  {data.offboarding.records.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: '13px' }}>No active offboardings.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {data.offboarding.records.map(ob => {
                        const pct = ob.task_count > 0 ? Math.round((ob.tasks_done / ob.task_count) * 100) : 0
                        return (
                          <Link key={ob.id} href={`/hr/staff/${ob.staff_id}`} style={{ textDecoration: 'none' }}>
                            <div style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px', background: C.bg }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{ob.staff?.name ?? ob.staff_id}</div>
                                {pill(ob.reason === 'termination' ? C.red : C.amber, ob.reason)}
                              </div>
                              <div style={{ fontSize: '12px', color: C.muted }}>{ob.staff?.department} · last day {ob.last_working_day}</div>
                              <div style={{ height: '4px', background: C.border, borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: C.red, borderRadius: '2px' }} />
                              </div>
                              <div style={{ fontSize: '11px', color: C.muted }}>{ob.tasks_done}/{ob.task_count} tasks complete</div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Expiring contracts */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>Contracts Expiring (30 days)</div>
                  {data.contracts.expiring.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: '13px' }}>No contracts expiring soon.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {data.contracts.expiring.map(c => (
                        <Link key={c.id} href={`/hr/staff/${c.staff_id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{c.staff?.name}</div>
                              <div style={{ fontSize: '12px', color: C.muted }}>{c.staff?.department} · {c.contract_type}</div>
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: C.amber }}>{c.contract_end_date}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Leave Approvals ── */}
            {tab === 'leave' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {data.leave.pending_requests.length === 0 ? (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '40px', textAlign: 'center', color: C.muted }}>No pending leave requests.</div>
                ) : data.leave.pending_requests.map(req => (
                  <LeaveApprovalCard key={req.id} req={req} onAction={() => {
                    fetch('/api/hr/dashboard').then(r => r.json()).then(d => setData(d))
                  }} />
                ))}
              </div>
            )}

            {/* ── Alerts ── */}
            {tab === 'alerts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {data.alerts.records.length === 0 ? (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '40px', textAlign: 'center', color: C.muted }}>No open alerts.</div>
                ) : data.alerts.records.map(alert => (
                  <AlertCard key={alert.id} alert={alert} onResolve={() => {
                    fetch('/api/hr/dashboard').then(r => r.json()).then(d => setData(d))
                  }} />
                ))}
              </div>
            )}

            {/* ── Overdue Training ── */}
            {tab === 'training' && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden' }}>
                {data.training.overdue.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>No overdue training assignments.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {['Staff Member', 'Department', 'Course', 'Due Date', 'Overdue By'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.training.overdue.map((a, i) => {
                        const days = Math.floor((Date.now() - new Date(a.due_date).getTime()) / 86400000)
                        return (
                          <tr key={a.id} style={{ borderBottom: i < data.training.overdue.length - 1 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? C.surface : C.bg }}>
                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: C.text }}>{a.staff?.name}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: C.muted }}>{a.staff?.department}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: C.text }}>{a.course?.title}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: C.amber, fontWeight: 700 }}>{a.due_date}</td>
                            <td style={{ padding: '12px 16px' }}>{pill(C.red, `${days}d overdue`)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── Recent Activity ── */}
            {tab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.recent_history.map((h, i) => (
                  <div key={h.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{h.staff?.name ?? 'Unknown'}</span>
                        {pill(C.green, h.change_type.replace(/_/g, ' '))}
                      </div>
                      {h.notes && <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{h.notes}</div>}
                    </div>
                    <div style={{ fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Leave Approval Card ─────────────────────────────────────────────── */
function LeaveApprovalCard({
  req,
  onAction,
}: {
  req: DashData['leave']['pending_requests'][number]
  onAction: () => void
}) {
  const [note, setNote]   = useState('')
  const [busy, setBusy]   = useState(false)

  async function decide(status: 'approved' | 'rejected') {
    setBusy(true)
    await fetch('/api/hr/leave-requests', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: req.id, status, review_note: note || null }),
    })
    setBusy(false)
    onAction()
  }

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: '16px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>{req.staff?.name}</span>
            {pill(C.purple, req.leave_type?.name ?? 'Leave')}
          </div>
          <div style={{ fontSize: '13px', color: C.muted }}>
            {req.staff?.department} · {req.start_date} to {req.end_date} · <strong style={{ color: C.text }}>{req.total_days} day{req.total_days !== 1 ? 's' : ''}</strong>
          </div>
          <div style={{ marginTop: '12px' }}>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a review note (optional)"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', color: C.text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          <button
            disabled={busy}
            onClick={() => decide('approved')}
            style={{ padding: '9px 20px', borderRadius: '10px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => decide('rejected')}
            style={{ padding: '9px 20px', borderRadius: '10px', background: C.bg, color: C.red, fontSize: '13px', fontWeight: 700, border: `1px solid ${C.border}`, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
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
  alert: DashData['alerts']['records'][number]
  onResolve: () => void
}) {
  const [busy, setBusy] = useState(false)
  const color = alertColor(alert.type)

  async function resolve() {
    setBusy(true)
    await fetch('/api/hr/alerts', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: alert.id, status: 'resolved' }),
    })
    setBusy(false)
    onResolve()
  }

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: '12px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          {pill(color, alert.type.replace(/_/g, ' '))}
          <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{alert.title}</span>
        </div>
        <div style={{ fontSize: '12px', color: C.muted }}>
          {alert.staff?.name} · {alert.staff?.department}
          {alert.due_date && ` · due ${alert.due_date}`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        {alert.status === 'open' && (
          <button
            onClick={async () => {
              await fetch('/api/hr/alerts', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ id: alert.id, status: 'acknowledged' }),
              })
              onResolve()
            }}
            style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.bg, fontSize: '12px', fontWeight: 700, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
            Acknowledge
          </button>
        )}
        <button
          disabled={busy}
          onClick={resolve}
          style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${color}`, background: color + '15', fontSize: '12px', fontWeight: 700, color, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.5 : 1 }}>
          Resolve
        </button>
      </div>
    </div>
  )
}
