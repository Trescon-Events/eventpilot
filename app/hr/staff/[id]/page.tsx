'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'

const C = {
  bg:      '#F6F8FB',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  green:   '#00897B',
  amber:   '#D97706',
  red:     '#8B1A1A',
  purple:  '#6C54B5',
}

/* ── Types ───────────────────────────────────────────────────────────── */
type Staff = {
  id: string; name: string; email: string; department: string | null
  role: string | null; job_level: string | null; office_id: string | null
  manager_id: string | null; joined_at: string | null; access_enabled: boolean
  phone: string | null; address: string | null
  emergency_contact_name: string | null; emergency_contact_phone: string | null
  work_mode: string | null; company: string | null; business_unit: string | null
  employee_code: string | null; skills: string[] | null
  is_management_overhead: boolean; gender: string | null
  date_of_birth: string | null; salutation: string | null; blood_group: string | null
  data_source: string | null; last_synced_at: string | null
}

type EventAssignment = {
  id: string; role: string | null
  event: { id: string; name: string; type: string; status: string; event_date: string | null; city: string | null } | null
}

type Contract = {
  id: string; contract_type: string; employment_status: string
  start_date: string; contract_end_date: string | null
  grade_id: string | null; notes: string | null
  grade: { code: string; label: string } | null
}

type LeaveBalance = {
  id: string; year: number; entitled_days: number; used_days: number
  pending_days: number; carried_over: number
  leave_type: { name: string; code: string; is_paid: boolean } | null
}

type OnboardingRecord = {
  id: string; status: string; started_at: string; target_end: string | null
  tasks: Array<{
    id: string; title: string; owner: string; status: string; due_date: string | null
    course: { id: string; title: string } | null
  }>
}

type OffboardingRecord = {
  id: string; status: string; last_working_day: string; reason: string
  tasks: Array<{ id: string; title: string; owner: string; status: string }>
}

type Certificate = {
  id: string; issued_at: string; expires_at: string | null
  course: { id: string; title: string; is_mandatory: boolean } | null
}

type Assignment = {
  id: string; status: string; due_date: string | null
  course: { id: string; title: string; is_mandatory: boolean; duration_hours: number | null } | null
}

type HistoryEntry = {
  id: string; change_type: string; previous_value: Record<string, unknown> | null
  new_value: Record<string, unknown>; notes: string | null; created_at: string
}

type AttRecord = {
  id: string; date: string; status: string
  clock_in: string | null; clock_out: string | null; work_hours: number | null
  location: string; late_arrival: boolean; early_leave: boolean; notes: string | null
}

type Timesheet = {
  id: string; date: string; description: string; task_type: string
  hours: number; approved: boolean
  event: { id: string; name: string } | null
}

type Asset = {
  id: string; asset_type: string; asset_tag: string | null; brand_model: string | null
  serial_number: string | null; condition: string; assigned_at: string | null
  returned_at: string | null; notes: string | null
}

type HRDocument = {
  id: string; doc_type: string; title: string; file_url: string | null
  file_name: string | null; issued_date: string | null; expiry_date: string | null
  notes: string | null; created_at: string
}

type SalaryRecord = {
  id: string; effective_from: string; effective_to: string | null
  basic_salary: number; allowances: number; deductions: number; currency: string
  gross_salary: number | null; net_salary: number | null; notes: string | null
  grade: { code: string; label: string } | null
}

type PerfReview = {
  id: string; review_period: string; review_date: string | null
  overall_rating: number | null; kpi_score: number | null
  strengths: string | null; areas_to_improve: string | null
  goals_next_period: string | null; reviewer_comments: string | null
  status: string
  reviewer: { id: string; name: string } | null
}

function pill(color: string, text: string) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: color + '20', color, letterSpacing: '0.4px' }}>
      {text}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: C.muted, marginBottom: '16px' }}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
      {msg}
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────── */
type TabId = 'overview' | 'leave' | 'events' | 'training' | 'attendance' | 'timesheets' | 'documents' | 'assets' | 'salary' | 'performance' | 'offboarding'

const STATUS_COLOR: Record<string, string> = {
  active:      C.green,
  completed:   C.green,
  approved:    C.green,
  present:     C.green,
  wfh:         C.purple,
  in_progress: C.amber,
  pending:     C.muted,
  pending_approval: C.amber,
  half_day:    C.amber,
  on_leave:    C.amber,
  skipped:     C.muted,
  resigned:    C.amber,
  absent:      C.red,
  rejected:    C.red,
  terminated:  C.red,
  stalled:     C.red,
  weekend:     C.muted,
  holiday:     C.muted,
}

export default function StaffHRProfile() {
  const { id } = useParams<{ id: string }>()

  const [staff,        setStaff]        = useState<Staff | null>(null)
  const [contract,     setContract]     = useState<Contract | null>(null)
  const [balances,     setBalances]     = useState<LeaveBalance[]>([])
  const [onboarding,   setOnboarding]   = useState<OnboardingRecord | null>(null)
  const [offboarding,  setOffboarding]  = useState<OffboardingRecord | null>(null)
  const [certs,        setCerts]        = useState<Certificate[]>([])
  const [assignments,  setAssignments]  = useState<Assignment[]>([])
  const [history,      setHistory]      = useState<HistoryEntry[]>([])
  const [attendance,   setAttendance]   = useState<AttRecord[]>([])
  const [timesheets,   setTimesheets]   = useState<Timesheet[]>([])
  const [assets,       setAssets]       = useState<Asset[]>([])
  const [documents,    setDocuments]    = useState<HRDocument[]>([])
  const [salary,       setSalary]       = useState<SalaryRecord[]>([])
  const [performance,  setPerformance]  = useState<PerfReview[]>([])
  const [eventAssignments, setEventAssignments] = useState<EventAssignment[]>([])
  const [leaveRequests,    setLeaveRequests]    = useState<{id:string;status:string;start_date:string;end_date:string;total_days:number;reason:string|null;leave_type:{name:string;code:string}|null}[]>([])
  const [leaveForm,        setLeaveForm]        = useState({ leave_type_id: '', start_date: '', end_date: '', reason: '' })
  const [leaveTypes,       setLeaveTypes]       = useState<{id:string;name:string;code:string}[]>([])
  const [leaveSaving,      setLeaveSaving]      = useState(false)
  const [leaveMsg,         setLeaveMsg]         = useState('')

  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<TabId>('overview')
  const [busy,     setBusy]     = useState<string | null>(null)

  const thisMonth = new Date().toISOString().slice(0, 7)

  async function load() {
    setLoading(true)
    const year = new Date().getFullYear()
    const [
      staffRes, contractRes, balRes, obRes, offRes,
      certRes, assignRes, histRes, attRes, tsRes,
      assetRes, docRes, salRes, perfRes,
      eventAssignRes, leaveReqRes, leaveTypesRes,
    ] = await Promise.all([
      fetch(`/api/staff-list?id=${id}`).then(r => r.json()),
      fetch(`/api/hr/contracts?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/leave-balances?staff_id=${id}&year=${year}`).then(r => r.json()),
      fetch(`/api/hr/onboarding?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/offboarding?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/certificates?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/course-assignments?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/employment-history?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/attendance?staff_id=${id}&month=${thisMonth}`).then(r => r.json()),
      fetch(`/api/hr/timesheets?staff_id=${id}&month=${thisMonth}`).then(r => r.json()).then(d => d?.entries ?? (Array.isArray(d) ? d : [])),
      fetch(`/api/hr/assets?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/documents?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/salary?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/performance?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/events/staff?staff_id=${id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/hr/leave-requests?staff_id=${id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/hr/leave-types`).then(r => r.json()).catch(() => []),
    ])

    setStaff(staffRes?.id ? staffRes : null)
    const contracts = Array.isArray(contractRes) ? contractRes : []
    setContract(contracts.find((c: Contract) => c.employment_status === 'active') ?? contracts[0] ?? null)
    setBalances(Array.isArray(balRes) ? balRes : [])
    setOnboarding(obRes?.id ? obRes : null)
    setOffboarding(offRes?.id ? offRes : null)
    setCerts(Array.isArray(certRes) ? certRes : [])
    setAssignments(Array.isArray(assignRes) ? assignRes : [])
    setHistory(Array.isArray(histRes) ? histRes : [])
    setAttendance(Array.isArray(attRes) ? attRes : [])
    setTimesheets(Array.isArray(tsRes) ? tsRes : [])
    setAssets(Array.isArray(assetRes) ? assetRes : [])
    setDocuments(Array.isArray(docRes) ? docRes : [])
    setSalary(Array.isArray(salRes) ? salRes : [])
    setPerformance(Array.isArray(perfRes) ? perfRes : [])
    setEventAssignments(Array.isArray(eventAssignRes) ? eventAssignRes : [])
    setLeaveRequests(Array.isArray(leaveReqRes) ? leaveReqRes : [])
    setLeaveTypes(Array.isArray(leaveTypesRes) ? leaveTypesRes : [])
    setLoading(false)
  }

  useEffect(() => { if (id) load() }, [id])

  async function updateOnboardingTask(taskId: string, status: 'completed' | 'skipped') {
    setBusy(taskId)
    await fetch('/api/hr/onboarding', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ task_id: taskId, status }),
    })
    setBusy(null)
    load()
  }

  async function updateOffboardingTask(taskId: string) {
    setBusy(taskId)
    await fetch('/api/hr/offboarding', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ task_id: taskId }),
    })
    setBusy(null)
    load()
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',    label: 'Overview'    },
    { id: 'events',      label: `Events${eventAssignments.length ? ` (${eventAssignments.length})` : ''}` },
    { id: 'attendance',  label: 'Attendance'  },
    { id: 'timesheets',  label: 'Timesheets'  },
    { id: 'leave',       label: 'Leave'       },
    { id: 'training',    label: 'Training'    },
    { id: 'documents',   label: 'Documents'   },
    { id: 'assets',      label: 'Assets'      },
    { id: 'salary',      label: 'Salary'      },
    { id: 'performance', label: 'Performance' },
    { id: 'offboarding', label: 'Offboarding' },
  ]

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: '15px' }}>
        Loading staff record...
      </div>
    )
  }

  if (!staff) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '15px', color: C.red, marginBottom: '12px' }}>Staff member not found.</div>
          <Link href="/hr" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>← HR Portal</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <PageHeader eyebrow="HR" title={staff.name} actions={
        !staff.access_enabled ? pill(C.red, 'Access Disabled') : undefined
      } />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px' }}>
        {/* Profile hero */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '28px', marginBottom: '16px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: C.green + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 800, color: C.green, flexShrink: 0 }}>
            {staff.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>{staff.name}</div>
            <div style={{ fontSize: '14px', color: C.muted, marginBottom: '10px' }}>{staff.role ?? 'No role set'} · {staff.department ?? 'No department'}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {staff.job_level  && pill(C.purple, staff.job_level)}
              {staff.office_id  && pill(C.green,  staff.office_id)}
              {contract         && pill(STATUS_COLOR[contract.employment_status] ?? C.muted, contract.employment_status)}
              {contract?.grade  && pill(C.amber, contract.grade.code)}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '12px', color: C.muted }}>Joined</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{staff.joined_at?.slice(0, 10) ?? '—'}</div>
            {contract?.contract_end_date && (
              <>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '8px' }}>Contract ends</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: C.amber }}>{contract.contract_end_date}</div>
              </>
            )}
          </div>
        </div>

        {/* Tabs — scrollable row */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: tab === t.id ? `2px solid ${C.green}` : '2px solid transparent', color: tab === t.id ? C.green : C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginBottom: '-1px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <>
            {contract && (
              <Section title="Contract & Employment">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                  {[
                    ['Type',   contract.contract_type],
                    ['Status', contract.employment_status],
                    ['Start',  contract.start_date],
                    ['End',    contract.contract_end_date ?? 'Open-ended'],
                    ['Grade',  contract.grade ? `${contract.grade.code} — ${contract.grade.label}` : '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{value}</div>
                    </div>
                  ))}
                </div>
                {contract.notes && (
                  <div style={{ marginTop: '14px', padding: '12px 14px', background: C.bg, borderRadius: '8px', fontSize: '13px', color: C.muted }}>{contract.notes}</div>
                )}
              </Section>
            )}

            {onboarding && (
              <Section title={`Onboarding — ${onboarding.status}`}>
                {onboarding.tasks.map(task => (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', padding: '10px 12px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLOR[task.status] ?? C.muted, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: '13px', color: C.text, fontWeight: 600 }}>{task.title}</div>
                    {task.due_date && <div style={{ fontSize: '12px', color: C.muted }}>{task.due_date}</div>}
                    {task.status !== 'completed' && task.status !== 'skipped' && (
                      <button disabled={busy === task.id} onClick={() => updateOnboardingTask(task.id, 'completed')}
                        style={{ padding: '4px 10px', borderRadius: '6px', background: C.green, color: '#fff', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Mark done
                      </button>
                    )}
                    {task.status === 'completed' && <span style={{ fontSize: '12px', color: C.green, fontWeight: 700 }}>Done</span>}
                    {task.status === 'skipped'   && <span style={{ fontSize: '12px', color: C.muted, fontWeight: 700 }}>Skipped</span>}
                  </div>
                ))}
              </Section>
            )}

            <Section title="Personal & Contact">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                {[
                  ['Email',            staff.email],
                  ['Phone',            staff.phone ?? '—'],
                  ['Gender',           staff.gender ?? '—'],
                  ['Date of Birth',    staff.date_of_birth?.slice(0, 10) ?? '—'],
                  ['Blood Group',      staff.blood_group ?? '—'],
                  ['Work Mode',        staff.work_mode ?? '—'],
                  ['Employee Code',    staff.employee_code ?? '—'],
                  ['Company',          staff.company ?? '—'],
                  ['Business Unit',    staff.business_unit ?? '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>{label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>{value}</div>
                  </div>
                ))}
              </div>
              {staff.address && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Address</div>
                  <div style={{ fontSize: '13px', color: C.text }}>{staff.address}</div>
                </div>
              )}
              {(staff.emergency_contact_name || staff.emergency_contact_phone) && (
                <div style={{ marginTop: '14px', padding: '12px 14px', background: C.amber + '10', borderRadius: '10px', border: `1px solid ${C.amber}30` }}>
                  <div style={{ fontSize: '11px', color: C.amber, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Emergency Contact</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{staff.emergency_contact_name ?? '—'}</div>
                  <div style={{ fontSize: '13px', color: C.muted }}>{staff.emergency_contact_phone ?? '—'}</div>
                </div>
              )}
              {staff.skills && staff.skills.length > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Skills</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {staff.skills.map(s => <span key={s} style={{ padding: '3px 10px', borderRadius: '10px', background: C.purple + '15', color: C.purple, fontSize: '12px', fontWeight: 600 }}>{s}</span>)}
                  </div>
                </div>
              )}
              {staff.data_source && (
                <div style={{ marginTop: '12px', fontSize: '11px', color: C.muted }}>
                  Source: {staff.data_source.toUpperCase()}{staff.last_synced_at ? ` · Last synced ${new Date(staff.last_synced_at).toLocaleDateString()}` : ''}
                </div>
              )}
            </Section>

            {history.length > 0 && (
              <Section title="Employment History">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}` }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        {pill(C.green, h.change_type.replace(/_/g, ' '))}
                        {h.notes && <span style={{ fontSize: '12px', color: C.muted, marginLeft: '8px' }}>{h.notes}</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: C.muted }}>{new Date(h.created_at).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Leave ── */}
        {tab === 'leave' && (
          <>
            {balances.length === 0 ? (
              <Empty msg={`No leave balances found for ${new Date().getFullYear()}.`} />
            ) : (
              <Section title={`Leave Balances — ${new Date().getFullYear()}`}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                  {balances.map(bal => {
                    const total     = bal.entitled_days + bal.carried_over
                    const available = total - bal.used_days - bal.pending_days
                    const usedPct   = total > 0 ? Math.round((bal.used_days / total) * 100) : 0
                    return (
                      <div key={bal.id} style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', background: C.bg }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>{bal.leave_type?.name ?? '—'}</div>
                          {pill(bal.leave_type?.is_paid ? C.green : C.amber, bal.leave_type?.code ?? '')}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                          {[['Entitled', bal.entitled_days], ['Carried', bal.carried_over], ['Used', bal.used_days], ['Pending', bal.pending_days]].map(([label, val]) => (
                            <div key={label as string}>
                              <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                              <div style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ height: '4px', background: C.border, borderRadius: '2px', overflow: 'hidden', marginBottom: '4px' }}>
                          <div style={{ height: '100%', width: `${usedPct}%`, background: usedPct > 80 ? C.red : C.green, borderRadius: '2px' }} />
                        </div>
                        <div style={{ fontSize: '12px', color: C.muted }}>
                          <strong style={{ color: available > 0 ? C.green : C.red }}>{available}</strong> days available
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Leave Request Form */}
            {leaveTypes.length > 0 && (
              <Section title="Raise Leave Request">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: '12px', alignItems: 'end' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Leave Type</div>
                    <select value={leaveForm.leave_type_id} onChange={e => setLeaveForm(f => ({ ...f, leave_type_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', background: C.surface, color: C.text }}>
                      <option value="">Select type</option>
                      {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Start Date</div>
                    <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', background: C.surface, color: C.text, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>End Date</div>
                    <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', background: C.surface, color: C.text, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Reason</div>
                    <input type="text" value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} placeholder="Optional reason"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', background: C.surface, color: C.text, boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button disabled={leaveSaving || !leaveForm.leave_type_id || !leaveForm.start_date || !leaveForm.end_date}
                    onClick={async () => {
                      setLeaveSaving(true); setLeaveMsg('')
                      const start = new Date(leaveForm.start_date)
                      const end   = new Date(leaveForm.end_date)
                      if (end < start) { setLeaveMsg('End date cannot be before start date.'); setLeaveSaving(false); return }
                      const days  = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
                      const res   = await fetch('/api/hr/leave-requests', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ staff_id: id, leave_type_id: leaveForm.leave_type_id, start_date: leaveForm.start_date, end_date: leaveForm.end_date, total_days: days, reason: leaveForm.reason || null }),
                      })
                      const data = await res.json()
                      if (res.ok) {
                        setLeaveMsg('Request submitted.')
                        setLeaveForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' })
                        load()
                      } else {
                        setLeaveMsg(data.error ?? 'Failed to submit.')
                      }
                      setLeaveSaving(false)
                    }}
                    style={{ padding: '8px 20px', borderRadius: '8px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: leaveSaving ? 0.6 : 1 }}>
                    {leaveSaving ? 'Submitting…' : 'Submit Request'}
                  </button>
                  {leaveMsg && <span style={{ fontSize: '13px', color: leaveMsg === 'Request submitted.' ? C.green : C.red }}>{leaveMsg}</span>}
                </div>
              </Section>
            )}

            {/* Leave Request History */}
            {leaveRequests.length > 0 && (
              <Section title="Leave Request History">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {leaveRequests.map(req => (
                    <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{req.leave_type?.name ?? '—'}</div>
                        <div style={{ fontSize: '12px', color: C.muted }}>{req.start_date} → {req.end_date} · {req.total_days}d</div>
                        {req.reason && <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{req.reason}</div>}
                      </div>
                      {pill(STATUS_COLOR[req.status] ?? C.muted, req.status.replace('_', ' '))}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Events ── */}
        {tab === 'events' && (
          <>
            {eventAssignments.length === 0 ? (
              <Empty msg="This staff member has not been assigned to any events." />
            ) : (
              <Section title={`Event Assignments (${eventAssignments.length})`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {eventAssignments.map(ea => {
                    const ev = ea.event
                    if (!ev) return null
                    const statusColor = ev.status === 'active' ? C.green : ev.status === 'completed' ? C.muted : C.amber
                    return (
                      <div key={ea.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '12px', background: C.bg, border: `1px solid ${C.border}` }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <Link href={`/admin/events/${ev.id}`} style={{ fontSize: '14px', fontWeight: 700, color: C.text, textDecoration: 'none' }}
                            onMouseOver={e => (e.currentTarget.style.color = C.green)} onMouseOut={e => (e.currentTarget.style.color = C.text)}>
                            {ev.name}
                          </Link>
                          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                            {ev.type && <span style={{ textTransform: 'capitalize', marginRight: '8px' }}>{ev.type.replace(/_/g, ' ')}</span>}
                            {ev.city && <span>{ev.city}</span>}
                            {ev.event_date && <span style={{ marginLeft: '8px' }}>{ev.event_date.slice(0, 10)}</span>}
                          </div>
                        </div>
                        {ea.role && <div style={{ fontSize: '12px', color: C.muted, fontWeight: 600 }}>{ea.role}</div>}
                        {pill(statusColor, ev.status)}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Attendance ── */}
        {tab === 'attendance' && (
          <>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '12px' }}>Showing this month — {thisMonth}</div>
            {attendance.length === 0 ? (
              <Empty msg="No attendance records this month." />
            ) : (
              <Section title={`Attendance — ${thisMonth}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Summary strip */}
                  {(() => {
                    const counts = attendance.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc }, {} as Record<string, number>)
                    const totalH = attendance.reduce((s, r) => s + (r.work_hours ?? 0), 0)
                    return (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        {[
                          { label: 'Present',  val: counts.present  ?? 0, color: C.green  },
                          { label: 'WFH',      val: counts.wfh      ?? 0, color: C.purple },
                          { label: 'Absent',   val: counts.absent   ?? 0, color: C.red    },
                          { label: 'On Leave', val: counts.on_leave ?? 0, color: C.amber  },
                          { label: 'Half Day', val: counts.half_day ?? 0, color: C.amber  },
                          { label: 'Hrs',      val: `${Math.round(totalH * 10) / 10}h`, color: C.muted },
                        ].map(s => (
                          <div key={s.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 14px', textAlign: 'center', minWidth: '70px' }}>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{s.val}</div>
                            <div style={{ fontSize: '10px', color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {['Date', 'Status', 'Clock In', 'Clock Out', 'Hours', 'Location', 'Flags'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {attendance.map((r, i) => (
                          <tr key={r.id} style={{ borderBottom: i < attendance.length - 1 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? C.surface : C.bg }}>
                            <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: C.text }}>{r.date}</td>
                            <td style={{ padding: '10px 14px' }}>{pill(STATUS_COLOR[r.status] ?? C.muted, r.status.replace('_', ' '))}</td>
                            <td style={{ padding: '10px 14px', fontSize: '13px', color: C.text, fontFamily: 'monospace' }}>{r.clock_in ?? '—'}</td>
                            <td style={{ padding: '10px 14px', fontSize: '13px', color: C.text, fontFamily: 'monospace' }}>{r.clock_out ?? '—'}</td>
                            <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: C.text }}>{r.work_hours ? `${r.work_hours}h` : '—'}</td>
                            <td style={{ padding: '10px 14px', fontSize: '12px', color: C.muted, textTransform: 'capitalize' }}>{r.location}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {r.late_arrival && pill(C.amber, 'Late')}
                                {r.early_leave  && pill(C.red,   'Early out')}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Timesheets ── */}
        {tab === 'timesheets' && (
          <>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '12px' }}>Showing this month — {thisMonth}</div>
            {timesheets.length === 0 ? (
              <Empty msg="No timesheet entries this month." />
            ) : (
              <Section title={`Timesheets — ${thisMonth}`}>
                {(() => {
                  const totalH  = timesheets.reduce((s, t) => s + t.hours, 0)
                  const pending = timesheets.filter(t => !t.approved).length
                  return (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                      {[
                        { label: 'Total Hrs', val: `${Math.round(totalH * 10) / 10}h`, color: C.text },
                        { label: 'Approved',  val: timesheets.length - pending, color: C.green },
                        { label: 'Pending',   val: pending, color: C.amber },
                      ].map(s => (
                        <div key={s.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 14px', textAlign: 'center', minWidth: '80px' }}>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{s.val}</div>
                          <div style={{ fontSize: '10px', color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {timesheets.map((t, i) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: i % 2 === 0 ? C.surface : C.bg, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: C.muted, width: '80px', flexShrink: 0 }}>{t.date}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{t.description}</div>
                        {t.event && <div style={{ fontSize: '11px', color: C.muted }}>{t.event.name}</div>}
                      </div>
                      <div style={{ fontSize: '11px', color: C.muted, textTransform: 'capitalize' }}>{t.task_type.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>{t.hours}h</div>
                      {pill(t.approved ? C.green : C.amber, t.approved ? 'approved' : 'pending')}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Training ── */}
        {tab === 'training' && (
          <>
            {certs.length > 0 && (
              <Section title="Certificates">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {certs.map(cert => {
                    const expired = cert.expires_at && new Date(cert.expires_at) < new Date()
                    return (
                      <div key={cert.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}` }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{cert.course?.title}</div>
                          <div style={{ fontSize: '12px', color: C.muted }}>Issued {cert.issued_at}</div>
                        </div>
                        {cert.course?.is_mandatory && pill(C.red, 'mandatory')}
                        {cert.expires_at ? pill(expired ? C.red : C.amber, expired ? `expired ${cert.expires_at}` : `expires ${cert.expires_at}`) : pill(C.green, 'no expiry')}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            <Section title="Course Assignments">
              {assignments.length === 0 ? (
                <div style={{ color: C.muted, fontSize: '13px' }}>No courses assigned.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {assignments.map(a => {
                    const overdue = a.due_date && a.status !== 'completed' && new Date(a.due_date) < new Date()
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', background: C.bg, border: `1px solid ${overdue ? C.red : C.border}` }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{a.course?.title}</div>
                          {a.due_date && <div style={{ fontSize: '12px', color: overdue ? C.red : C.muted }}>Due {a.due_date}</div>}
                        </div>
                        {a.course?.is_mandatory && pill(C.red, 'mandatory')}
                        {pill(STATUS_COLOR[a.status] ?? C.muted, a.status.replace('_', ' '))}
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          </>
        )}

        {/* ── Documents ── */}
        {tab === 'documents' && (
          <>
            {documents.length === 0 ? (
              <Empty msg="No HR documents on file." />
            ) : (
              <Section title="HR Documents">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {documents.map(doc => {
                    const expiryDate = doc.expiry_date ? new Date(doc.expiry_date) : null
                    const expired    = expiryDate && expiryDate < new Date()
                    const expiringSoon = expiryDate && !expired && (expiryDate.getTime() - Date.now()) < 60 * 24 * 60 * 60 * 1000
                    return (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', background: C.bg, border: `1px solid ${expired ? C.red : expiringSoon ? C.amber : C.border}` }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{doc.title}</div>
                          <div style={{ fontSize: '11px', color: C.muted }}>
                            {doc.doc_type.replace(/_/g, ' ')}
                            {doc.issued_date && ` · Issued ${doc.issued_date}`}
                          </div>
                          {doc.notes && <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>{doc.notes}</div>}
                        </div>
                        {doc.expiry_date && pill(expired ? C.red : expiringSoon ? C.amber : C.green, expired ? `Expired ${doc.expiry_date}` : `Expires ${doc.expiry_date}`)}
                        {doc.file_url && (
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                            style={{ padding: '4px 10px', borderRadius: '6px', background: C.green, color: '#fff', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
                            View
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Assets ── */}
        {tab === 'assets' && (
          <>
            {assets.length === 0 ? (
              <Empty msg="No assets assigned to this staff member." />
            ) : (
              <Section title="Assigned Assets">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                  {assets.map(asset => (
                    <div key={asset.id} style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', background: C.bg }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, textTransform: 'capitalize' }}>{asset.asset_type.replace(/_/g, ' ')}</div>
                        {pill(asset.condition === 'good' ? C.green : asset.condition === 'fair' ? C.amber : C.red, asset.condition)}
                      </div>
                      {asset.brand_model && <div style={{ fontSize: '13px', color: C.text, marginBottom: '4px' }}>{asset.brand_model}</div>}
                      {asset.asset_tag && <div style={{ fontSize: '11px', color: C.muted }}>Tag: {asset.asset_tag}</div>}
                      {asset.serial_number && <div style={{ fontSize: '11px', color: C.muted }}>S/N: {asset.serial_number}</div>}
                      {asset.assigned_at && <div style={{ fontSize: '11px', color: C.muted, marginTop: '6px' }}>Assigned {asset.assigned_at}</div>}
                      {asset.notes && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>{asset.notes}</div>}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Salary ── */}
        {tab === 'salary' && (
          <>
            {salary.length === 0 ? (
              <Empty msg="No salary records on file." />
            ) : (
              <Section title="Salary History">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {salary.map((rec, i) => (
                    <div key={rec.id} style={{ padding: '14px 16px', borderRadius: '12px', background: i === 0 ? C.green + '08' : C.bg, border: `1px solid ${i === 0 ? C.green + '40' : C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>
                          {rec.currency} {rec.basic_salary.toLocaleString()}
                          <span style={{ fontSize: '11px', color: C.muted, fontWeight: 400, marginLeft: '6px' }}>basic</span>
                        </div>
                        {i === 0 && pill(C.green, 'current')}
                        {rec.grade && pill(C.amber, rec.grade.code)}
                        <div style={{ marginLeft: 'auto', fontSize: '12px', color: C.muted }}>
                          From {rec.effective_from}{rec.effective_to ? ` → ${rec.effective_to}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {[
                          ['Allowances',  `+${rec.currency} ${rec.allowances.toLocaleString()}`,  C.green],
                          ['Deductions',  `-${rec.currency} ${rec.deductions.toLocaleString()}`,   C.red  ],
                          ['Gross',       rec.gross_salary ? `${rec.currency} ${rec.gross_salary.toLocaleString()}` : '—', C.text ],
                          ['Net',         rec.net_salary   ? `${rec.currency} ${rec.net_salary.toLocaleString()}`   : '—', C.text ],
                        ].map(([label, val, color]) => (
                          <div key={label as string}>
                            <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: color as string }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {rec.notes && <div style={{ fontSize: '12px', color: C.muted, marginTop: '8px' }}>{rec.notes}</div>}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Performance ── */}
        {tab === 'performance' && (
          <>
            {performance.length === 0 ? (
              <Empty msg="No performance reviews on record." />
            ) : (
              <Section title="Performance Reviews">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {performance.map(rev => (
                    <div key={rev.id} style={{ padding: '16px', borderRadius: '12px', background: C.bg, border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>{rev.review_period}</div>
                        {pill(STATUS_COLOR[rev.status] ?? C.muted, rev.status)}
                        {rev.overall_rating != null && (
                          <div style={{ marginLeft: 'auto', fontSize: '22px', fontWeight: 800, color: rev.overall_rating >= 4 ? C.green : rev.overall_rating >= 3 ? C.amber : C.red }}>
                            {rev.overall_rating}<span style={{ fontSize: '13px', color: C.muted, fontWeight: 400 }}>/5</span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                        {[
                          ['Reviewer',  rev.reviewer?.name ?? '—'],
                          ['Date',      rev.review_date ?? '—'],
                          ['KPI Score', rev.kpi_score != null ? `${rev.kpi_score}%` : '—'],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {rev.strengths && (
                        <div style={{ marginBottom: '6px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Strengths</div>
                          <div style={{ fontSize: '13px', color: C.text }}>{rev.strengths}</div>
                        </div>
                      )}
                      {rev.areas_to_improve && (
                        <div style={{ marginBottom: '6px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Areas to Improve</div>
                          <div style={{ fontSize: '13px', color: C.text }}>{rev.areas_to_improve}</div>
                        </div>
                      )}
                      {rev.goals_next_period && (
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: C.purple, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Goals Next Period</div>
                          <div style={{ fontSize: '13px', color: C.text }}>{rev.goals_next_period}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Offboarding ── */}
        {tab === 'offboarding' && (
          <>
            {!offboarding && (
              <Empty msg="No offboarding record for this staff member." />
            )}
            {offboarding && (
              <Section title={`Offboarding — ${offboarding.reason} · last day ${offboarding.last_working_day}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {offboarding.tasks.map(task => (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}` }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: task.status === 'completed' ? C.green : C.muted, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{task.title}</div>
                        <div style={{ fontSize: '12px', color: C.muted }}>{task.owner}</div>
                      </div>
                      {task.status !== 'completed' ? (
                        <button disabled={busy === task.id} onClick={() => updateOffboardingTask(task.id)}
                          style={{ padding: '6px 14px', borderRadius: '8px', background: C.green, color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Mark done
                        </button>
                      ) : (
                        <span style={{ fontSize: '12px', color: C.green, fontWeight: 700 }}>Done</span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
