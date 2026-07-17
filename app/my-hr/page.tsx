'use client'

import { useState, useEffect } from 'react'
import { NotificationBell } from '@/app/components/NavBar'
import PageHeader from '@/app/components/PageHeader'

/* ── Design tokens ─────────────────────────────────────────────────────
   DARK/SUB/BORDER/BG/PURPLE are never alpha-suffixed and never flow into
   Badge()'s `${color}NN` concatenation below, so they hold var() strings
   directly. TEAL/GREEN/RED/AMBER/INDIGO/MUTED all do get alpha-suffixed
   (directly, or indirectly via statusColor()/Badge()'s generic `color`
   prop), so they stay literal hex — kept in sync with their matching
   token's value by hand. GREEN here means "status positive" (present/
   approved), distinct from the brand TEAL used for tabs/buttons/icons. */
const BG     = 'var(--surface)'
const DARK   = 'var(--ink)'
const MUTED  = '#7E93A1'   // == var(--ink3)
const SUB    = 'var(--ink3)'
const BORDER = 'var(--border)'
const TEAL   = '#12C9BD'   // == var(--teal-mid)
const PURPLE = 'var(--purple)'
const AMBER  = '#F5B94D'   // == var(--amber)
const GREEN  = '#34D399'   // == var(--success)
const RED    = '#F1667A'   // == var(--red)
const INDIGO = '#818CF8'   // == var(--indigo)

/* ── Types ─────────────────────────────────────────────────── */
type LeaveBalance = {
  id: string; entitled_days: number; used_days: number; pending_days: number; carried_over: number; year: number
  leave_type: { id: string; name: string; code: string; is_paid: boolean } | null
}
type LeaveRequest = {
  id: string; start_date: string; end_date: string; total_days: number; reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'; created_at: string; review_note: string | null
  leave_type: { name: string; code: string } | null
  reviewed_by: { name: string } | null
}
type LeaveType = { id: string; name: string; code: string; is_paid: boolean; default_days_per_year: number }
type AttendanceRecord = {
  id: string; date: string; status: string; clock_in: string | null; clock_out: string | null
  work_hours: number | null; late_arrival: boolean; early_leave: boolean; notes: string | null
}
type ChecklistItem = {
  id: string; department: string; title: string; status: string; due_date: string | null; notes: string | null
  events: { id: string; name: string; type: string; event_date: string | null; city: string | null; status: string } | null
}
type StaffMember = { id: string; name: string; role: string; department: string; office_id: string }

/* ── Helpers ───────────────────────────────────────────────── */
function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function statusColor(s: string) {
  if (s === 'approved' || s === 'present') return GREEN
  if (s === 'rejected' || s === 'absent')  return RED
  if (s === 'pending')                     return AMBER
  if (s === 'late')                        return AMBER
  if (s === 'leave')                       return INDIGO
  return MUTED
}
function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')
}
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: `${color}15`, color, border: `1px solid ${color}30`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--card)', border: `1px solid ${BORDER}`, borderRadius: '14px', ...style }}>
      {children}
    </div>
  )
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
      {children}
    </div>
  )
}

/* ── Leave balance card ────────────────────────────────────── */
function BalanceCard({ b }: { b: LeaveBalance }) {
  const available = b.entitled_days + b.carried_over - b.used_days - b.pending_days
  const pct = b.entitled_days > 0 ? Math.round((b.used_days / b.entitled_days) * 100) : 0
  const color = available <= 2 ? RED : available <= 5 ? AMBER : TEAL
  return (
    <div style={{ background: 'var(--card)', border: `1.5px solid ${color}25`, borderRadius: '12px', borderTop: `3px solid ${color}`, padding: '16px 18px' }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: DARK, marginBottom: '2px' }}>{b.leave_type?.name ?? 'Leave'}</div>
      <div style={{ fontSize: '11px', color: MUTED, marginBottom: '14px' }}>{b.leave_type?.is_paid ? 'Paid' : 'Unpaid'} · {b.year}</div>
      <div style={{ fontSize: '32px', fontWeight: 900, color, lineHeight: 1, marginBottom: '4px' }}>{available}</div>
      <div style={{ fontSize: '12px', color: MUTED, marginBottom: '12px' }}>days available</div>
      <div style={{ height: '4px', borderRadius: '4px', background: 'var(--border-light)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: '4px', transition: 'width 0.5s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ fontSize: '11px', color: MUTED }}>Used {b.used_days}d{b.pending_days > 0 ? ` · ${b.pending_days}d pending` : ''}</span>
        <span style={{ fontSize: '11px', color: MUTED }}>of {b.entitled_days}d</span>
      </div>
    </div>
  )
}

/* ── Main page ─────────────────────────────────────────────── */
export default function MyHRPage() {
  const [session, setSession] = useState<{ sid: string; adm?: boolean } | null>(null)
  const [staff,   setStaff]   = useState<StaffMember | null>(null)
  const [tab,     setTab]     = useState<'overview' | 'leave' | 'events' | 'attendance'>('overview')
  const [loading, setLoading] = useState(true)

  /* Data */
  const [balances,    setBalances]    = useState<LeaveBalance[]>([])
  const [requests,    setRequests]    = useState<LeaveRequest[]>([])
  const [leaveTypes,  setLeaveTypes]  = useState<LeaveType[]>([])
  const [attendance,  setAttendance]  = useState<AttendanceRecord[]>([])
  const [checklist,   setChecklist]   = useState<ChecklistItem[]>([])

  /* Leave form */
  const [showForm,    setShowForm]    = useState(false)
  const [ltId,        setLtId]        = useState('')
  const [startDate,   setStartDate]   = useState('')
  const [endDate,     setEndDate]     = useState('')
  const [reason,      setReason]      = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [formMsg,     setFormMsg]     = useState('')
  const [formOk,      setFormOk]      = useState(true)

  const now   = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(async s => {
      if (!s?.sid) { setLoading(false); return }
      setSession(s)
      const [staffRes, balRes, reqRes, ltRes, attRes, clRes] = await Promise.all([
        fetch(`/api/staff-member?id=${s.sid}`),
        fetch(`/api/hr/leave-balances?staff_id=${s.sid}&year=${now.getFullYear()}`),
        fetch(`/api/hr/leave-requests?staff_id=${s.sid}`),
        fetch('/api/hr/leave-types'),
        fetch(`/api/hr/attendance?staff_id=${s.sid}&month=${month}`),
        fetch(`/api/events/my-checklist?staff_id=${s.sid}`),
      ])
      const [staffData, balData, reqData, ltData, attData, clData] = await Promise.all([
        staffRes.json(), balRes.json(), reqRes.json(), ltRes.json(), attRes.json(), clRes.json(),
      ])
      if (staffData && !staffData.error) setStaff(staffData)
      setBalances(Array.isArray(balData) ? balData : [])
      setRequests(Array.isArray(reqData) ? reqData : [])
      setLeaveTypes(Array.isArray(ltData) ? ltData : [])
      setAttendance(Array.isArray(attData) ? attData : [])
      setChecklist(Array.isArray(clData) ? clData : [])
      if (ltData?.[0]) setLtId(ltData[0].id)
      setLoading(false)
    }).catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitLeave() {
    if (!session || !ltId || !startDate || !endDate) { setFormMsg('Fill all fields.'); setFormOk(false); return }
    setSubmitting(true); setFormMsg('')
    const res  = await fetch('/api/hr/leave-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: session.sid, leave_type_id: ltId, start_date: startDate, end_date: endDate, reason }),
    })
    const data = await res.json()
    if (!res.ok) { setFormMsg(data.error ?? 'Failed to submit.'); setFormOk(false); setSubmitting(false); return }
    setFormMsg('Leave request submitted successfully.'); setFormOk(true)
    setShowForm(false); setStartDate(''); setEndDate(''); setReason('')
    // Refresh requests + balances
    const [rRes, bRes] = await Promise.all([
      fetch(`/api/hr/leave-requests?staff_id=${session.sid}`),
      fetch(`/api/hr/leave-balances?staff_id=${session.sid}&year=${now.getFullYear()}`),
    ])
    setRequests(await rRes.json())
    setBalances(await bRes.json())
    setSubmitting(false)
  }

  /* ── Event grouping for My Events ── */
  const eventMap = new Map<string, { event: ChecklistItem['events']; items: ChecklistItem[] }>()
  for (const item of checklist) {
    if (!item.events) continue
    const eid = item.events.id
    if (!eventMap.has(eid)) eventMap.set(eid, { event: item.events, items: [] })
    eventMap.get(eid)!.items.push(item)
  }
  const eventGroups = Array.from(eventMap.values())

  /* ── Attendance calendar ── */
  const attMap = new Map(attendance.map(a => [a.date, a]))
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const firstDay    = new Date(now.getFullYear(), now.getMonth(), 1).getDay()

  /* ── Overview stats ── */
  const totalAvailable = balances.reduce((sum, b) => {
    const av = b.entitled_days + b.carried_over - b.used_days - b.pending_days
    return sum + Math.max(0, av)
  }, 0)
  const pendingRequests = requests.filter(r => r.status === 'pending').length
  const todayStr   = now.toISOString().split('T')[0]
  const todayAtt   = attMap.get(todayStr)
  const openTasks  = checklist.filter(c => c.status === 'pending').length

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: '14px', color: MUTED }}>Loading your HR profile…</div>
    </div>
  )

  const firstName = staff?.name?.split(' ')[0] ?? 'You'

  const TABS = [
    { id: 'overview',    label: 'Overview' },
    { id: 'leave',       label: 'Leave' },
    { id: 'events',      label: 'My Events' },
    { id: 'attendance',  label: 'Attendance' },
  ] as const

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      <PageHeader title="My HR" actions={<NotificationBell />} />

      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: `1px solid ${BORDER}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${TEAL}12`, border: `1.5px solid ${TEAL}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: DARK, letterSpacing: '-0.3px' }}>My HR Profile</div>
              {staff && <div style={{ fontSize: '13px', color: MUTED, marginTop: '1px' }}>{staff.role} · {staff.department}</div>}
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '13px', fontWeight: tab === t.id ? 700 : 500,
                  background: tab === t.id ? TEAL : 'transparent',
                  color: tab === t.id ? 'var(--teal-light)' : MUTED,
                  transition: 'all 0.12s',
                }}>
                {t.label}
                {t.id === 'leave' && pendingRequests > 0 && (
                  <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 800, background: AMBER, color: 'var(--amber-light)', padding: '1px 5px', borderRadius: '10px' }}>{pendingRequests}</span>
                )}
                {t.id === 'events' && openTasks > 0 && (
                  <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 800, background: INDIGO, color: 'var(--indigo-light)', padding: '1px 5px', borderRadius: '10px' }}>{openTasks}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '28px 32px 60px' }}>

        {/* ─────────── OVERVIEW ─────────── */}
        {tab === 'overview' && (
          <div>
            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px', marginBottom: '28px' }}>
              {[
                { label: 'Leave Days Available', value: totalAvailable, sub: 'across all leave types', color: TEAL,   icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
                { label: 'Pending Requests',     value: pendingRequests, sub: 'awaiting approval',      color: AMBER,  icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                { label: 'Open Event Tasks',     value: openTasks,       sub: 'across your events',     color: INDIGO, icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
                { label: 'Events Assigned',      value: eventGroups.length, sub: 'you are working on',  color: PURPLE, icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--card)', border: `1px solid ${BORDER}`, borderRadius: '12px', borderLeft: `4px solid ${s.color}`, padding: '16px 18px' }}>
                  <div style={{ color: s.color, marginBottom: '10px' }}>{s.icon}</div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: DARK, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: DARK, marginTop: '4px' }}>{s.label}</div>
                  <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Today's status */}
              <Card style={{ padding: '20px 22px' }}>
                <SectionLabel>Today's Status</SectionLabel>
                {todayAtt ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusColor(todayAtt.status), flexShrink: 0 }} />
                      <span style={{ fontSize: '16px', fontWeight: 800, color: statusColor(todayAtt.status) }}>{statusLabel(todayAtt.status)}</span>
                    </div>
                    {todayAtt.clock_in && <div style={{ fontSize: '13px', color: SUB, marginBottom: '4px' }}>Clock in: <strong>{todayAtt.clock_in}</strong></div>}
                    {todayAtt.clock_out && <div style={{ fontSize: '13px', color: SUB, marginBottom: '4px' }}>Clock out: <strong>{todayAtt.clock_out}</strong></div>}
                    {todayAtt.work_hours && <div style={{ fontSize: '13px', color: SUB }}>Hours logged: <strong>{todayAtt.work_hours}h</strong></div>}
                    {todayAtt.late_arrival && <div style={{ marginTop: '8px' }}><Badge label="Late Arrival" color={AMBER} /></div>}
                  </div>
                ) : (
                  <div style={{ color: MUTED, fontSize: '14px' }}>No attendance record for today yet.</div>
                )}
              </Card>

              {/* Upcoming leave */}
              <Card style={{ padding: '20px 22px' }}>
                <SectionLabel>Recent Leave Requests</SectionLabel>
                {requests.length === 0 ? (
                  <div style={{ color: MUTED, fontSize: '14px' }}>No leave requests found.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {requests.slice(0, 3).map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: DARK }}>{r.leave_type?.name ?? 'Leave'}</div>
                          <div style={{ fontSize: '11px', color: MUTED }}>{fmt(r.start_date)} – {fmt(r.end_date)} · {r.total_days}d</div>
                        </div>
                        <Badge label={statusLabel(r.status)} color={statusColor(r.status)} />
                      </div>
                    ))}
                    {requests.length > 3 && (
                      <button onClick={() => setTab('leave')} style={{ fontSize: '12px', color: TEAL, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontWeight: 600 }}>
                        View all {requests.length} requests →
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </div>

            {/* Upcoming event tasks */}
            {checklist.filter(c => c.status === 'pending').length > 0 && (
              <Card style={{ padding: '20px 22px', marginTop: '20px' }}>
                <SectionLabel>Open Event Tasks</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {checklist.filter(c => c.status === 'pending').slice(0, 5).map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: DARK }}>{item.title}</div>
                        {item.events && <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{item.events.name}{item.events.city ? ` · ${item.events.city}` : ''}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {item.due_date && <span style={{ fontSize: '11px', color: MUTED }}>{fmt(item.due_date)}</span>}
                        <Badge label="Pending" color={AMBER} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ─────────── LEAVE ─────────── */}
        {tab === 'leave' && (
          <div>
            {formMsg && (
              <div style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', fontWeight: 600, background: formOk ? `${GREEN}10` : `${RED}10`, color: formOk ? GREEN : RED, border: `1px solid ${formOk ? GREEN : RED}30` }}>
                {formMsg}
              </div>
            )}

            {/* Leave balances */}
            <SectionLabel>Leave Balances — {now.getFullYear()}</SectionLabel>
            {balances.length === 0 ? (
              <div style={{ color: MUTED, fontSize: '14px', marginBottom: '28px' }}>No leave balances found. Contact HR to initialise your record.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                {balances.map(b => <BalanceCard key={b.id} b={b} />)}
              </div>
            )}

            {/* Submit request */}
            <div style={{ marginBottom: '28px' }}>
              {!showForm ? (
                <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 20px', background: TEAL, color: 'var(--teal-light)', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Request Leave
                </button>
              ) : (
                <Card style={{ padding: '22px 24px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: DARK, marginBottom: '18px' }}>New Leave Request</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Leave Type</label>
                      <select value={ltId} onChange={e => setLtId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', color: DARK, boxSizing: 'border-box' as const }}>
                        {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Start Date</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', color: DARK, boxSizing: 'border-box' as const }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>End Date</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', color: DARK, boxSizing: 'border-box' as const }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reason (optional)</label>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Briefly describe your reason…" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', color: DARK, resize: 'vertical', boxSizing: 'border-box' as const }} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={submitLeave} disabled={submitting} style={{ padding: '10px 20px', background: TEAL, color: 'var(--teal-light)', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.7 : 1 }}>
                      {submitting ? 'Submitting…' : 'Submit Request'}
                    </button>
                    <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', background: 'var(--card-hi)', color: MUTED, border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                  </div>
                </Card>
              )}
            </div>

            {/* Request history */}
            <SectionLabel>Request History</SectionLabel>
            {requests.length === 0 ? (
              <div style={{ color: MUTED, fontSize: '14px' }}>No leave requests yet.</div>
            ) : (
              <Card>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--border-light)', borderBottom: `1px solid ${BORDER}` }}>
                        {['Type', 'Dates', 'Days', 'Reason', 'Status', 'Note'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: i < requests.length - 1 ? `1px solid var(--border-light)` : 'none' }}>
                          <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: DARK, whiteSpace: 'nowrap' }}>{r.leave_type?.name ?? '—'}</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', color: SUB, whiteSpace: 'nowrap' }}>{fmt(r.start_date)} – {fmt(r.end_date)}</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', color: DARK, fontWeight: 700 }}>{r.total_days}d</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', color: MUTED, maxWidth: '180px' }}>{r.reason ?? '—'}</td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}><Badge label={statusLabel(r.status)} color={statusColor(r.status)} /></td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', color: MUTED, maxWidth: '160px' }}>{r.review_note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ─────────── MY EVENTS ─────────── */}
        {tab === 'events' && (
          <div>
            {eventGroups.length === 0 ? (
              <Card style={{ padding: '40px', textAlign: 'center' }}>
                <svg width="40" height="40" fill="none" stroke={BORDER} strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ margin: '0 auto 14px', display: 'block' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <div style={{ fontSize: '15px', fontWeight: 700, color: DARK, marginBottom: '6px' }}>No event assignments yet</div>
                <div style={{ fontSize: '13px', color: MUTED }}>You will appear here when you are added to an event by your manager or HR.</div>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {eventGroups.map(({ event, items }) => {
                  const done    = items.filter(i => i.status === 'completed').length
                  const total   = items.length
                  const pct     = total > 0 ? Math.round((done / total) * 100) : 0
                  return (
                    <Card key={event!.id} style={{ overflow: 'hidden' }}>
                      {/* Event header */}
                      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: DARK, marginBottom: '2px' }}>{event!.name}</div>
                          <div style={{ fontSize: '12px', color: MUTED }}>
                            {event!.city && `${event!.city} · `}
                            {event!.event_date ? fmt(event!.event_date) : 'Date TBC'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '4px' }}>{done}/{total} tasks done</div>
                            <div style={{ width: '100px', height: '4px', borderRadius: '4px', background: 'var(--border-light)' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? GREEN : TEAL, borderRadius: '4px', transition: 'width 0.4s' }} />
                            </div>
                          </div>
                          <Badge label={statusLabel(event!.status)} color={event!.status === 'live' ? GREEN : MUTED} />
                        </div>
                      </div>
                      {/* Tasks */}
                      <div style={{ padding: '6px 0' }}>
                        {items.map((item, i) => (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 22px', borderBottom: i < items.length - 1 ? `1px solid var(--border-light)` : 'none' }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${item.status === 'completed' ? GREEN : BORDER}`, background: item.status === 'completed' ? `${GREEN}15` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {item.status === 'completed' && (
                                <svg width="9" height="9" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: item.status === 'completed' ? 500 : 600, color: item.status === 'completed' ? MUTED : DARK, textDecoration: item.status === 'completed' ? 'line-through' : 'none' }}>
                                {item.title}
                              </div>
                              {item.department && <div style={{ fontSize: '11px', color: MUTED, marginTop: '1px' }}>{item.department}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                              {item.due_date && <span style={{ fontSize: '11px', color: new Date(item.due_date) < now && item.status !== 'completed' ? RED : MUTED }}>{fmt(item.due_date)}</span>}
                              <Badge label={statusLabel(item.status)} color={statusColor(item.status)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ─────────── ATTENDANCE ─────────── */}
        {tab === 'attendance' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <SectionLabel>{now.toLocaleString('default', { month: 'long', year: 'numeric' })} Attendance</SectionLabel>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: MUTED, alignItems: 'center' }}>
                {[
                  { label: 'Present',   color: GREEN  },
                  { label: 'Absent',    color: RED    },
                  { label: 'Late',      color: AMBER  },
                  { label: 'Leave',     color: INDIGO },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar grid */}
            <Card style={{ padding: '20px 22px', marginBottom: '24px' }}>
              {/* Day labels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '6px' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} style={{ fontSize: '10px', fontWeight: 700, color: MUTED, textAlign: 'center', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {Array.from({ length: firstDay }).map((_, i) => <div key={`pad-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1
                  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const rec  = attMap.get(dateStr)
                  const isToday = dateStr === todayStr
                  const dotColor = rec ? statusColor(rec.status) : 'transparent'
                  return (
                    <div key={day} title={rec ? `${statusLabel(rec.status)}${rec.work_hours ? ` · ${rec.work_hours}h` : ''}` : undefined}
                      style={{ borderRadius: '8px', padding: '6px 4px', textAlign: 'center', background: isToday ? `${TEAL}12` : 'transparent', border: isToday ? `1.5px solid ${TEAL}` : '1.5px solid transparent', cursor: rec ? 'default' : 'default' }}>
                      <div style={{ fontSize: '12px', fontWeight: isToday ? 800 : 400, color: isToday ? TEAL : DARK }}>{day}</div>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor, margin: '3px auto 0' }} />
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Summary stats */}
            {(() => {
              const present  = attendance.filter(a => a.status === 'present').length
              const absent   = attendance.filter(a => a.status === 'absent').length
              const late     = attendance.filter(a => a.late_arrival).length
              const onLeave  = attendance.filter(a => a.status === 'leave').length
              const totalHrs = attendance.reduce((s, a) => s + (a.work_hours ?? 0), 0)
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
                  {[
                    { label: 'Present',     value: present,           color: GREEN  },
                    { label: 'Absent',      value: absent,            color: RED    },
                    { label: 'Late',        value: late,              color: AMBER  },
                    { label: 'On Leave',    value: onLeave,           color: INDIGO },
                    { label: 'Total Hours', value: `${totalHrs.toFixed(1)}h`, color: TEAL },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--card)', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px', fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Day-by-day list */}
            {attendance.length > 0 && (
              <Card>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px' }}>Daily Records</div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--border-light)', borderBottom: `1px solid ${BORDER}` }}>
                        {['Date', 'Status', 'Clock In', 'Clock Out', 'Hours', 'Notes'].map(h => (
                          <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.slice().sort((a, b) => b.date.localeCompare(a.date)).map((a, i) => (
                        <tr key={a.id} style={{ borderBottom: i < attendance.length - 1 ? `1px solid var(--border-light)` : 'none' }}>
                          <td style={{ padding: '11px 16px', fontSize: '13px', color: DARK, fontWeight: 500, whiteSpace: 'nowrap' }}>{fmt(a.date)}</td>
                          <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}><Badge label={statusLabel(a.status)} color={statusColor(a.status)} /></td>
                          <td style={{ padding: '11px 16px', fontSize: '13px', color: SUB }}>{a.clock_in ?? '—'}</td>
                          <td style={{ padding: '11px 16px', fontSize: '13px', color: SUB }}>{a.clock_out ?? '—'}</td>
                          <td style={{ padding: '11px 16px', fontSize: '13px', color: DARK, fontWeight: 600 }}>{a.work_hours ? `${a.work_hours}h` : '—'}</td>
                          <td style={{ padding: '11px 16px', fontSize: '13px', color: MUTED }}>{a.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            {attendance.length === 0 && (
              <div style={{ color: MUTED, fontSize: '14px' }}>No attendance records found for this month.</div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
