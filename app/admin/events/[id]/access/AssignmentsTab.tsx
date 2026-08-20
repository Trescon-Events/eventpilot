'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui'

type StaffOption = { id: string; name: string; email: string }
type RoleOption = { id: string; name: string }
type Assignment = {
  id: string; staff_id: string; role_id: string; granted_at: string; expires_at: string | null
  staff_members: { name: string; email: string } | null
  access_roles_catalog: { name: string; slug: string } | null
}

// Mirrors AccessTab.tsx's grant/revoke interaction idiom (staff dropdown +
// role dropdown + Assign button + revoke list) as a sibling component, not
// a generalization of it — AccessTab is hardcoded to a two-tier user/admin
// concept and has no event scoping; forcing one component to serve both
// shapes would mean threading conditionals through it for a genuinely
// different case.
//
// eventId omitted (2026-08-16, Event Workspace Access Roles foundation
// redesign) = org-wide scope — the role applies to every event, current
// and future (event_id IS NULL in event_access_assignments; see
// supabase/access_rbac.sql's "ORG-WIDE (GLOBAL) ASSIGNMENTS" section).
// Used both here (per-event Access tab) and from app/admin/access/page.tsx
// (the global assignments page).
export default function AssignmentsTab({ eventId }: { eventId?: string }) {
  const isGlobal = !eventId
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [staffId, setStaffId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [expiresAt, setExpiresAt] = useState('') // '' = never expires; set for a freelancer/contractor on a fixed engagement
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Sourced from an effect, not read directly during render (Date.now() at
  // render time is flagged as impure by this repo's react-hooks/purity
  // rule) — safe to default to 0, expiry badges just don't show as expired
  // until this first effect runs, a few ms after mount.
  const [now, setNow] = useState(0)

  useEffect(() => { fetchAll() }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard mount-time now() capture, matches TaskManagerConsolePage's own identical pattern
  useEffect(() => { setNow(Date.now()) }, [])

  async function fetchAll() {
    setLoading(true)
    const [assignRes, staffRes, rolesRes] = await Promise.all([
      fetch(`/api/events/access/assignments?event_id=${eventId ?? 'global'}`),
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
    // Date input gives just a day (e.g. "2026-10-15") — end of that day
    // local time, so the grant lasts through the whole last day rather
    // than expiring at midnight the moment it starts.
    const expires_at = expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null
    const res = await fetch('/api/events/access/assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId ?? null, staff_id: staffId, role_id: roleId, expires_at }),
    })
    const data = await res.json()
    if (!res.ok) { setMsg(data.error ?? 'Assign failed'); setAssigning(false); return }
    setAssignments(prev => [data, ...prev])
    setStaffId(''); setRoleId(''); setExpiresAt('')
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
      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '14px' }}>
        {isGlobal ? 'Assign a Role Organization-Wide' : 'Assign a Role for This Event'}
      </div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <label style={{ fontSize: '12px', color: 'var(--ink3)' }}>Expires (optional — for a freelancer/contractor on a fixed engagement):</label>
        <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontFamily: 'inherit' }} />
        {expiresAt && <button onClick={() => setExpiresAt('')} style={{ fontSize: '12px', color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>}
      </div>
      {msg && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginBottom: '10px' }}>{msg}</div>}

      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '20px 0 10px' }}>Current Assignments ({assignments.length})</div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {assignments.map(a => {
          const isExpired = !!a.expires_at && now > 0 && new Date(a.expires_at).getTime() <= now
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.staff_members?.name ?? a.staff_id}</span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{a.staff_members?.email}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', background: 'var(--card-hi)', padding: '2px 8px', borderRadius: '10px' }}>{a.access_roles_catalog?.name ?? 'Unknown role'}</span>
              {a.expires_at && (
                <span className={`tbadge ${isExpired ? 'tbadge-red' : 'tbadge-amber'}`}>
                  {isExpired ? 'Expired' : `Until ${new Date(a.expires_at).toLocaleDateString()}`}
                </span>
              )}
              <button onClick={() => unassign(a)} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Unassign</button>
            </div>
          )
        })}
        {assignments.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>
            {isGlobal ? 'No one holds an organization-wide role yet.' : 'No one is assigned to this event yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
