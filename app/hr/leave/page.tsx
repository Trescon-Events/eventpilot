'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

export default function LeaveManagerPage() {
  const [requests,   setRequests]   = useState<LeaveRequest[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [staffId,    setStaffId]    = useState('')
  const [busy,       setBusy]       = useState<string | null>(null)
  const [notes,      setNotes]      = useState<Record<string, string>>({})

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

  const filterTabs: { id: typeof filter; label: string }[] = [
    { id: 'pending',  label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all',      label: 'All' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', alignItems: 'center', height: '60px', gap: '16px' }}>
          <Link href="/hr" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>← HR Portal</Link>
          <div style={{ width: '1px', height: '20px', background: C.border }} />
          <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>Leave Manager</div>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '4px' }}>
            {filterTabs.map(t => (
              <button key={t.id} onClick={() => setFilter(t.id)}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: filter === t.id ? C.green : 'transparent', color: filter === t.id ? '#fff' : C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={staffId}
            onChange={e => setStaffId(e.target.value)}
            placeholder="Filter by staff ID..."
            style={{ padding: '9px 14px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', color: C.text, fontFamily: 'inherit', outline: 'none', background: C.surface, width: '200px' }}
          />
        </div>

        {/* Leave Types Summary */}
        {leaveTypes.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
            {leaveTypes.map(lt => (
              <div key={lt.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: C.green, letterSpacing: '1px' }}>{lt.code}</span>
                <span style={{ fontSize: '12px', color: C.text, fontWeight: 600 }}>{lt.name}</span>
                <span style={{ fontSize: '11px', color: C.muted }}>{lt.default_days_per_year}d/yr</span>
                {lt.is_paid && pill(C.green, 'paid')}
              </div>
            ))}
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: '60px', color: C.muted }}>Loading...</div>}

        {!loading && requests.length === 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px', textAlign: 'center', color: C.muted }}>
            No {filter === 'all' ? '' : filter} leave requests.
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {requests.map(req => (
              <div key={req.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    {/* Name + type + status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <Link href={`/hr/staff/${req.staff_id}`} style={{ fontSize: '15px', fontWeight: 800, color: C.text, textDecoration: 'none' }}>
                        {req.staff?.name ?? req.staff_id}
                      </Link>
                      {pill(C.purple, req.leave_type?.name ?? 'Leave')}
                      {pill(STATUS_COLOR[req.status] ?? C.muted, req.status)}
                      {req.leave_type?.is_paid === false && pill(C.amber, 'unpaid')}
                    </div>

                    <div style={{ fontSize: '13px', color: C.muted, marginBottom: '4px' }}>
                      {req.staff?.department} · {req.start_date} to {req.end_date} · <strong style={{ color: C.text }}>{req.total_days} day{req.total_days !== 1 ? 's' : ''}</strong>
                    </div>

                    {req.reason && (
                      <div style={{ fontSize: '13px', color: C.muted, fontStyle: 'italic', marginBottom: '4px' }}>"{req.reason}"</div>
                    )}

                    {req.review_note && (
                      <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>
                        <strong>Review note:</strong> {req.review_note}
                        {req.reviewed_by && ` — ${req.reviewed_by.name}`}
                      </div>
                    )}

                    {/* Action row for pending */}
                    {req.status === 'pending' && (
                      <div style={{ marginTop: '14px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          value={notes[req.id] ?? ''}
                          onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                          placeholder="Review note (optional)"
                          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', color: C.text, fontFamily: 'inherit', outline: 'none' }}
                        />
                        <button
                          disabled={busy === req.id}
                          onClick={() => decide(req.id, 'approved')}
                          style={{ padding: '8px 20px', borderRadius: '8px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy === req.id ? 0.5 : 1, fontFamily: 'inherit' }}>
                          Approve
                        </button>
                        <button
                          disabled={busy === req.id}
                          onClick={() => decide(req.id, 'rejected')}
                          style={{ padding: '8px 20px', borderRadius: '8px', background: C.bg, color: C.red, fontSize: '13px', fontWeight: 700, border: `1px solid ${C.border}`, cursor: 'pointer', opacity: busy === req.id ? 0.5 : 1, fontFamily: 'inherit' }}>
                          Reject
                        </button>
                      </div>
                    )}

                    {/* Cancel for approved */}
                    {req.status === 'approved' && (
                      <div style={{ marginTop: '10px' }}>
                        <button
                          disabled={busy === req.id}
                          onClick={() => decide(req.id, 'cancelled')}
                          style={{ padding: '6px 14px', borderRadius: '8px', background: C.bg, color: C.muted, fontSize: '12px', fontWeight: 700, border: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Cancel Leave
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Date column */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: C.text }}>{req.total_days}</div>
                    <div style={{ fontSize: '12px', color: C.muted }}>days</div>
                    <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>
                      {new Date(req.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
