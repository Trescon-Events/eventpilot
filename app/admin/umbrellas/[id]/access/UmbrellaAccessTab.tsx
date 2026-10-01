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

/* Assign a role ONCE at the umbrella and it applies to every event under it — current and future
   (2026-10-01). Same interaction as the per-event Access tab (app/admin/events/[id]/access/
   AssignmentsTab.tsx), against /api/admin/umbrella-access. Revoking here removes only the umbrella-
   level grant; anything the person holds directly on a single event is untouched. */
export default function UmbrellaAccessTab({ umbrellaId, umbrellaName, eventCount }: { umbrellaId: string; umbrellaName: string; eventCount: number }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [staffId, setStaffId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard mount-time now() capture, same as AssignmentsTab
  useEffect(() => { setNow(Date.now()) }, [])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [aRes, sRes, rRes] = await Promise.all([
        fetch(`/api/admin/umbrella-access?umbrella_id=${umbrellaId}`), fetch('/api/staff-list'), fetch('/api/access-roles'),
      ])
      if (cancelled) return
      const a = await aRes.json().catch(() => []); setAssignments(Array.isArray(a) ? a : [])
      const s = await sRes.json().catch(() => []); setStaffOptions(Array.isArray(s) ? s.map((x: StaffOption) => ({ id: x.id, name: x.name, email: x.email })) : [])
      const r = await rRes.json().catch(() => []); setRoleOptions(Array.isArray(r) ? r.map((x: RoleOption) => ({ id: x.id, name: x.name })) : [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [umbrellaId])

  async function assign() {
    if (!staffId || !roleId) return
    setAssigning(true); setMsg(null)
    const expires_at = expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null
    const res = await fetch('/api/admin/umbrella-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ umbrella_id: umbrellaId, staff_id: staffId, role_id: roleId, expires_at }),
    })
    const data = await res.json().catch(() => ({}))
    setAssigning(false)
    if (!res.ok) { setMsg(data.error ?? 'Assign failed'); return }
    setAssignments(prev => [data, ...prev]); setStaffId(''); setRoleId(''); setExpiresAt('')
  }

  async function unassign(a: Assignment) {
    if (!window.confirm(`Remove ${a.staff_members?.name ?? 'this person'}'s ${a.access_roles_catalog?.name ?? 'role'} access across all of ${umbrellaName}?`)) return
    const res = await fetch(`/api/admin/umbrella-access/${a.id}`, { method: 'DELETE' })
    if (res.ok) setAssignments(prev => prev.filter(x => x.id !== a.id))
    else setMsg('Could not remove that assignment.')
  }

  if (loading) return <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '24px' }}>Loading…</div>

  const field = { padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' } as const

  return (
    <div style={{ padding: '4px 28px 40px 12px', maxWidth: '900px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>Access</h1>
      <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '22px' }}>
        A role assigned here applies to <strong>every event under {umbrellaName}</strong> ({eventCount} today) — and to any event added to it later.
        Use it for people who work across the whole umbrella, such as Operations. To limit someone to a single event, assign the role on that event&apos;s own Access page instead.
      </div>

      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>Assign a Role Across {umbrellaName}</div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <select value={staffId} onChange={e => setStaffId(e.target.value)} style={{ ...field, flex: 1, minWidth: '220px' }}>
          <option value="">Select staff member…</option>
          {staffOptions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
        </select>
        <select value={roleId} onChange={e => setRoleId(e.target.value)} style={field}>
          <option value="">Select role…</option>
          {roleOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <Button variant="teal" onClick={assign} disabled={assigning || !staffId || !roleId}>{assigning ? 'Assigning…' : 'Assign'}</Button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <label style={{ fontSize: '12px', color: 'var(--ink3)' }}>Expires (optional):</label>
        <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ ...field, padding: '6px 8px', fontSize: '12.5px' }} />
        {expiresAt && <button onClick={() => setExpiresAt('')} style={{ fontSize: '12px', color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>}
      </div>
      {msg && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginBottom: '10px' }}>{msg}</div>}

      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '22px 0 10px' }}>Current umbrella-level assignments ({assignments.length})</div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {assignments.map(a => {
          const expired = !!a.expires_at && now > 0 && new Date(a.expires_at).getTime() <= now
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', flex: 1, minWidth: '140px' }}>{a.staff_members?.name ?? a.staff_id}</span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{a.staff_members?.email}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', background: 'var(--card-hi)', padding: '2px 8px', borderRadius: '10px' }}>{a.access_roles_catalog?.name ?? 'Unknown role'}</span>
              {a.expires_at && <span className={`tbadge ${expired ? 'tbadge-red' : 'tbadge-amber'}`}>{expired ? 'Expired' : `Until ${new Date(a.expires_at).toLocaleDateString()}`}</span>}
              <button onClick={() => unassign(a)} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Unassign</button>
            </div>
          )
        })}
        {assignments.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No one holds a role at this umbrella yet.</div>}
      </div>
    </div>
  )
}
