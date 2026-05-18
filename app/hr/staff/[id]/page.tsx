'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

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
  manager_id: string | null; joined_at: string | null; is_active: boolean
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

/* ── Main Page ───────────────────────────────────────────────────────── */
export default function StaffHRProfile() {
  const { id } = useParams<{ id: string }>()

  const [staff,      setStaff]      = useState<Staff | null>(null)
  const [contract,   setContract]   = useState<Contract | null>(null)
  const [balances,   setBalances]   = useState<LeaveBalance[]>([])
  const [onboarding, setOnboarding] = useState<OnboardingRecord | null>(null)
  const [offboarding,setOffboarding]= useState<OffboardingRecord | null>(null)
  const [certs,      setCerts]      = useState<Certificate[]>([])
  const [assignments,setAssignments]= useState<Assignment[]>([])
  const [history,    setHistory]    = useState<HistoryEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'overview' | 'leave' | 'training' | 'offboarding'>('overview')
  const [busy,       setBusy]       = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const year = new Date().getFullYear()
    const [staffRes, contractRes, balRes, obRes, offRes, certRes, assignRes, histRes] = await Promise.all([
      fetch(`/api/staff-list?id=${id}`).then(r => r.json()),
      fetch(`/api/hr/contracts?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/leave-balances?staff_id=${id}&year=${year}`).then(r => r.json()),
      fetch(`/api/hr/onboarding?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/offboarding?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/certificates?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/course-assignments?staff_id=${id}`).then(r => r.json()),
      fetch(`/api/hr/employment-history?staff_id=${id}`).then(r => r.json()),
    ])
    setStaff(staffRes?.id ? staffRes : null)
    // contracts returns array, pick active one
    const contracts = Array.isArray(contractRes) ? contractRes : []
    setContract(contracts.find((c: Contract) => c.employment_status === 'active') ?? contracts[0] ?? null)
    setBalances(Array.isArray(balRes) ? balRes : [])
    setOnboarding(obRes?.id ? obRes : null)
    setOffboarding(offRes?.id ? offRes : null)
    setCerts(Array.isArray(certRes) ? certRes : [])
    setAssignments(Array.isArray(assignRes) ? assignRes : [])
    setHistory(Array.isArray(histRes) ? histRes : [])
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

  const STATUS_COLOR: Record<string, string> = {
    active:      C.green,
    completed:   C.green,
    in_progress: C.amber,
    pending:     C.muted,
    skipped:     C.muted,
    resigned:    C.amber,
    terminated:  C.red,
    stalled:     C.red,
  }

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'overview',    label: 'Overview' },
    { id: 'leave',       label: 'Leave' },
    { id: 'training',    label: 'Training' },
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
          <Link href="/hr" style={{ color: C.green, fontWeight: 700 }}>← Back to HR Portal</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', alignItems: 'center', height: '60px', gap: '16px' }}>
          <Link href="/hr" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>← HR Portal</Link>
          <div style={{ width: '1px', height: '20px', background: C.border }} />
          <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>{staff.name}</div>
          {!staff.is_active && pill(C.red, 'Inactive')}
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>
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

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${C.border}` }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: tab === t.id ? `2px solid ${C.green}` : '2px solid transparent', color: tab === t.id ? C.green : C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginBottom: '-1px', fontFamily: 'inherit' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <>
            {/* Contract details */}
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

            {/* Onboarding */}
            {onboarding && (
              <Section title={`Onboarding — ${onboarding.status}`}>
                {onboarding.tasks.map(task => (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', padding: '10px 12px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLOR[task.status] ?? C.muted, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: '13px', color: C.text, fontWeight: 600 }}>{task.title}</div>
                    {task.due_date && <div style={{ fontSize: '12px', color: C.muted }}>{task.due_date}</div>}
                    {task.status !== 'completed' && task.status !== 'skipped' && (
                      <button
                        disabled={busy === task.id}
                        onClick={() => updateOnboardingTask(task.id, 'completed')}
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

            {/* Employment history */}
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
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '40px', textAlign: 'center', color: C.muted }}>
                No leave balances found for {new Date().getFullYear()}.
              </div>
            ) : (
              <Section title={`Leave Balances — ${new Date().getFullYear()}`}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                  {balances.map(bal => {
                    const total    = bal.entitled_days + bal.carried_over
                    const available = total - bal.used_days - bal.pending_days
                    const usedPct  = total > 0 ? Math.round((bal.used_days / total) * 100) : 0
                    return (
                      <div key={bal.id} style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', background: C.bg }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>{bal.leave_type?.name ?? '—'}</div>
                          {pill(bal.leave_type?.is_paid ? C.green : C.amber, bal.leave_type?.code ?? '')}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                          {[
                            ['Entitled',   bal.entitled_days],
                            ['Carried',    bal.carried_over],
                            ['Used',       bal.used_days],
                            ['Pending',    bal.pending_days],
                          ].map(([label, val]) => (
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

        {/* ── Offboarding ── */}
        {tab === 'offboarding' && (
          <>
            {!offboarding && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px', textAlign: 'center', color: C.muted }}>
                No offboarding record for this staff member.
              </div>
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
                        <button
                          disabled={busy === task.id}
                          onClick={() => updateOffboardingTask(task.id)}
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
