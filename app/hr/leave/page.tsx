'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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

type LeaveRequest = {
  id: string
  staff_id: string
  start_date: string
  end_date: string
  total_days: number
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  review_note: string | null
  created_at: string
  staff: { id: string; name: string; department: string; office_id: string } | null
  leave_type: { id: string; name: string; code: string; is_paid: boolean } | null
  reviewed_by: { id: string; name: string } | null
}

type LeaveType = { id: string; name: string; code: string; is_paid: boolean; default_days_per_year: number }

const STATUS_COLOR: Record<string, string> = {
  pending:   C.amber,
  approved:  C.green,
  rejected:  C.red,
  cancelled: C.muted,
}

function pill(color: string, text: string) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: color + '20', color, letterSpacing: '0.4px' }}>
      {text}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return diff === 0 ? 'today' : diff === 1 ? 'yesterday' : `${diff} days ago`
}

function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  return (
    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{initials}</span>
    </div>
  )
}

export default function LeaveManagerPage() {
  const [requests,   setRequests]   = useState<LeaveRequest[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [staffId,    setStaffId]    = useState('')
  const [busy,       setBusy]       = useState<string | null>(null)
  const [notes,      setNotes]      = useState<Record<string, string>>({})

  // We keep staffId in state (unchanged logic), but don't expose a UI input for it
  // The staffId state can still be set programmatically if needed

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    if (staffId)          params.set('staff_id', staffId)
    const [reqRes, typRes] = await Promise.all([
      fetch(`/api/hr/leave-requests?${params}`).then(r => r.json()),
      fetch('/api/hr/leave-types').then(r => r.json()),
    ])
    setRequests(Array.isArray(reqRes) ? reqRes : [])
    setLeaveTypes(Array.isArray(typRes) ? typRes : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filter, staffId])

  async function decide(id: string, status: 'approved' | 'rejected' | 'cancelled') {
    setBusy(id)
    await fetch('/api/hr/leave-requests', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status, review_note: notes[id] || null }),
    })
    setBusy(null)
    load()
  }

  // Count requests by status for filter tab badges
  // We fetch all statuses lazily — the counts reflect current loaded set when filter='all',
  // otherwise we show the count of what's loaded.
  const pendingCount   = filter === 'all' ? requests.filter(r => r.status === 'pending').length   : filter === 'pending'  ? requests.length : 0
  const approvedCount  = filter === 'all' ? requests.filter(r => r.status === 'approved').length  : filter === 'approved' ? requests.length : 0
  const rejectedCount  = filter === 'all' ? requests.filter(r => r.status === 'rejected').length  : filter === 'rejected' ? requests.length : 0

  const pendingRequests  = requests.filter(r => r.status === 'pending')
  const resolvedRequests = requests.filter(r => r.status !== 'pending')

  const filterTabs: { id: typeof filter; label: string; count: number }[] = [
    { id: 'pending',  label: 'Pending',  count: filter === 'pending'  ? requests.length : filter === 'all' ? pendingCount  : 0 },
    { id: 'approved', label: 'Approved', count: filter === 'approved' ? requests.length : filter === 'all' ? approvedCount : 0 },
    { id: 'rejected', label: 'Rejected', count: filter === 'rejected' ? requests.length : filter === 'all' ? rejectedCount : 0 },
    { id: 'all',      label: 'All',      count: requests.length },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <PageHeader eyebrow="HR" title="Leave Manager" />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>

        {/* Amber banner: pending count alert */}
        {!loading && filter === 'pending' && requests.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: C.amber + '12', border: `1px solid ${C.amber}40`, borderRadius: '12px', padding: '14px 18px', marginBottom: '20px' }}>
            <span style={{ fontSize: '18px', lineHeight: 1 }}>●</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: C.amber }}>
              {requests.length} {requests.length === 1 ? 'request is' : 'requests are'} waiting for your review
            </span>
          </div>
        )}

        {/* Filter tabs with counts */}
        <div style={{ display: 'flex', gap: '4px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '4px', marginBottom: '24px', alignSelf: 'flex-start', width: 'fit-content' }}>
          {filterTabs.map(t => {
            const isActive = filter === t.id
            return (
              <button key={t.id} onClick={() => setFilter(t.id)}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: isActive ? C.green : 'transparent', color: isActive ? '#fff' : C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {t.label}
                {t.count > 0 && (
                  <span style={{ fontSize: '11px', fontWeight: 800, background: isActive ? 'rgba(255,255,255,0.25)' : C.bg, color: isActive ? '#fff' : C.muted, borderRadius: '8px', padding: '1px 6px', minWidth: '18px', textAlign: 'center' }}>
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '60px', color: C.muted }}>Loading...</div>}

        {!loading && requests.length === 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px', textAlign: 'center', color: C.muted }}>
            No {filter === 'all' ? '' : filter} leave requests.
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Pending requests — prominent amber-bordered cards */}
            {pendingRequests.map(req => {
              const staffName = req.staff?.name ?? req.staff_id
              return (
                <div key={req.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.amber}`, borderRadius: '16px', padding: '20px 24px' }}>
                  {/* Row 1: Avatar + name + leave type pill + days count */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <Avatar name={staffName} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <Link href={`/hr/staff/${req.staff_id}`} style={{ fontSize: '16px', fontWeight: 800, color: C.text, textDecoration: 'none' }}>
                          {staffName}
                        </Link>
                        {pill(C.purple, req.leave_type?.name ?? 'Leave')}
                        {req.leave_type?.is_paid === false && pill(C.amber, 'unpaid')}
                      </div>
                    </div>
                    {/* Days — right aligned, large */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: C.text, lineHeight: 1 }}>{req.total_days}</div>
                      <div style={{ fontSize: '11px', color: C.muted, fontWeight: 600 }}>day{req.total_days !== 1 ? 's' : ''}</div>
                    </div>
                  </div>

                  {/* Row 2: Dept · office · date range */}
                  <div style={{ fontSize: '13px', color: C.muted, marginBottom: req.reason ? '8px' : '14px', paddingLeft: '52px' }}>
                    {req.staff?.department ?? ''}
                    {req.staff?.office_id ? ` · ${req.staff.office_id}` : ''}
                    {' · '}
                    <strong style={{ color: C.text }}>{fmtDate(req.start_date)} → {fmtDate(req.end_date)}</strong>
                  </div>

                  {/* Row 3: Reason (if any) */}
                  {req.reason && (
                    <div style={{ fontSize: '13px', color: C.muted, fontStyle: 'italic', marginBottom: '14px', paddingLeft: '52px' }}>
                      "{req.reason}"
                    </div>
                  )}

                  {/* Row 4: Inline note input + Approve + Reject */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', paddingLeft: '52px', marginBottom: '10px' }}>
                    <input
                      value={notes[req.id] ?? ''}
                      onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                      placeholder="Review note (optional)"
                      style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', color: C.text, fontFamily: 'inherit', outline: 'none', background: C.bg }}
                    />
                    <button
                      disabled={busy === req.id}
                      onClick={() => decide(req.id, 'approved')}
                      style={{ padding: '9px 22px', borderRadius: '8px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy === req.id ? 0.5 : 1, fontFamily: 'inherit', flexShrink: 0 }}>
                      Approve
                    </button>
                    <button
                      disabled={busy === req.id}
                      onClick={() => decide(req.id, 'rejected')}
                      style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', color: C.muted, fontSize: '13px', fontWeight: 700, border: `1px solid ${C.border}`, cursor: 'pointer', opacity: busy === req.id ? 0.5 : 1, fontFamily: 'inherit', flexShrink: 0 }}>
                      Reject
                    </button>
                  </div>

                  {/* Bottom: Requested X days ago */}
                  <div style={{ fontSize: '11px', color: C.muted, paddingLeft: '52px' }}>
                    Requested {daysAgo(req.created_at)}
                  </div>
                </div>
              )
            })}

            {/* Approved / Rejected / Cancelled — compact rows */}
            {resolvedRequests.map(req => {
              const sc = STATUS_COLOR[req.status] ?? C.muted
              const staffName = req.staff?.name ?? req.staff_id
              return (
                <div key={req.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${sc}`, borderRadius: '12px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Left: name + type + dates + days */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                    <Link href={`/hr/staff/${req.staff_id}`} style={{ fontSize: '14px', fontWeight: 800, color: C.text, textDecoration: 'none', flexShrink: 0 }}>
                      {staffName}
                    </Link>
                    {pill(C.purple, req.leave_type?.name ?? 'Leave')}
                    <span style={{ fontSize: '12px', color: C.muted }}>
                      {fmtDate(req.start_date)} → {fmtDate(req.end_date)}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{req.total_days}d</span>
                    {pill(sc, req.status)}
                  </div>

                  {/* Right: cancel button or review note */}
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    {req.status === 'approved' ? (
                      <button
                        disabled={busy === req.id}
                        onClick={() => decide(req.id, 'cancelled')}
                        style={{ padding: '5px 12px', borderRadius: '7px', background: C.bg, color: C.muted, fontSize: '11px', fontWeight: 700, border: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancel Leave
                      </button>
                    ) : req.review_note ? (
                      <span style={{ fontSize: '11px', color: C.muted, fontStyle: 'italic', maxWidth: '180px', display: 'block' }}>
                        {req.review_note}
                        {req.reviewed_by ? ` — ${req.reviewed_by.name}` : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Leave types reference strip — bottom of page */}
        {leaveTypes.length > 0 && (
          <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Leave Types Reference</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {leaveTypes.map(lt => (
                <div key={lt.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '20px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: C.green, letterSpacing: '0.8px' }}>{lt.code}</span>
                  <span style={{ fontSize: '11px', color: C.text, fontWeight: 600 }}>{lt.name}</span>
                  <span style={{ fontSize: '10px', color: C.muted }}>{lt.default_days_per_year}d/yr</span>
                  {lt.is_paid && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: C.green, background: C.green + '15', borderRadius: '8px', padding: '1px 6px' }}>paid</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
