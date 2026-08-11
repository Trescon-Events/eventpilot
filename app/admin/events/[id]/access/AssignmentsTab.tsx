'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui'

type StaffOption = { id: string; name: string; email: string }
type RoleOption = { id: string; name: string }
type Assignment = {
  id: string; staff_id: string; role_id: string; granted_at: string
  staff_members: { name: string; email: string } | null
  access_roles_catalog: { name: string; slug: string } | null
}

// Mirrors AccessTab.tsx's grant/revoke interaction idiom (staff dropdown +
// role dropdown + Assign button + revoke list) as a sibling component, not
// a generalization of it — AccessTab is hardcoded to a two-tier user/admin
// concept and has no event scoping; forcing one component to serve both
// shapes would mean threading conditionals through it for a genuinely
// different case.
export default function AssignmentsTab({ eventId }: { eventId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [staffId, setStaffId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [eventId])

  async function fetchAll() {
    setLoading(true)
    const [assignRes, staffRes, rolesRes] = await Promise.all([
      fetch(`/api/events/access/assignments?event_id=${eventId}`),
      fetch('/api/staff-list'),
      fetch('/api/access-roles'),
    ])
    setAssignments(await assignRes.json().catch(() => []))
    const staff = await staffRes.json().catch(() => [])
    setStaffOptions(Array.isArray(staff) ? staff.map((s: StaffOption) => ({ id: s.id, name: s.name, email: s.email })) : [])
    const roles = await rolesRes.json().catch(() => [])
    setRoleOptions(Array.isArray(roles) ? roles.map((r: RoleOption) => ({ id: r.id, name: r.name })) : [])
    setLoading(false)
  }

  async function assign() {
    if (!staffId || !roleId) return
    setAssigning(true); setMsg(null)
    const res = await fetch('/api/events/access/assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, staff_id: staffId, role_id: roleId }),
    })
    const data = await res.json()
    if (!res.ok) { setMsg(data.error ?? 'Assign failed'); setAssigning(false); return }
    setAssignments(prev => [data, ...prev])
    setStaffId(''); setRoleId('')
    setAssigning(false)
  }

  async function unassign(assignment: Assignment) {
    await fetch(`/api/events/access/assignments/${assignment.id}`, { method: 'DELETE' })
    setAssignments(prev => prev.filter(a => a.id !== assignment.id))
  }

  if (loading) return <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>

  if (roleOptions.length === 0) {
    return (
      <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '24px', textAlign: 'center' }}>
        No roles exist yet — create one in the Roles tab first.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '14px' }}>Assign a Role for This Event</div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <select value={staffId} onChange={e => setStaffId(e.target.value)}
          style={{ flex: 1, padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
          <option value="">Select staff member…</option>
          {staffOptions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
        </select>
        <select value={roleId} onChange={e => setRoleId(e.target.value)}
          style={{ padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
          <option value="">Select role…</option>
          {roleOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <Button variant="teal" onClick={assign}>{assigning ? 'Assigning…' : 'Assign'}</Button>
      </div>
      {msg && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginBottom: '10px' }}>{msg}</div>}

      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '20px 0 10px' }}>Current Assignments ({assignments.length})</div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {assignments.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{a.staff_members?.name ?? a.staff_id}</span>
            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{a.staff_members?.email}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', background: 'var(--card-hi)', padding: '2px 8px', borderRadius: '10px' }}>{a.access_roles_catalog?.name ?? 'Unknown role'}</span>
            <button onClick={() => unassign(a)} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Unassign</button>
          </div>
        ))}
        {assignments.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No one is assigned to this event yet.</div>}
      </div>
    </div>
  )
}
