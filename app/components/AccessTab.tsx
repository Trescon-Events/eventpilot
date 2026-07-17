'use client'

import { useState, useEffect } from 'react'

type Grant = { id: string; staff_id: string; tier: string; granted_at: string; staff_members: { name: string; email: string } | null }
type StaffOption = { id: string; name: string; email: string }

/*
  Shared "Settings → Access" tab: grant/revoke a staff member's user/admin
  tier for one module, backed by the generic /api/module-access/[moduleKey]
  routes (module_access table). Self-contained — checks the current user's
  own tier and renders the "admin access required" gate itself, so a host
  settings page just drops in <AccessTab moduleKey="kb" moduleLabel="Knowledge Base" />.

  Replaces the hand-duplicated Access-tab JSX that used to live directly in
  app/admin/toolkit/knowledge-base/settings/page.tsx and
  app/admin/toolkit/docuhub/settings/page.tsx.
*/
export default function AccessTab({ moduleKey, moduleLabel }: { moduleKey: string; moduleLabel: string }) {
  const [tier, setTier] = useState<'none' | 'user' | 'admin'>('none')
  const [checked, setChecked] = useState(false)

  const [grants, setGrants] = useState<Grant[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [grantStaffId, setGrantStaffId] = useState('')
  const [grantTier, setGrantTier] = useState('user')

  useEffect(() => {
    setChecked(false)
    fetch(`/api/module-access/${moduleKey}/me`).then(r => r.json()).then(d => { setTier(d.tier ?? 'none'); setChecked(true) })
  }, [moduleKey])

  useEffect(() => {
    if (tier !== 'admin') return
    fetch(`/api/module-access/${moduleKey}`).then(r => r.json()).then(d => setGrants(Array.isArray(d) ? d : []))
    fetch('/api/staff-list').then(r => r.json()).then(d => setStaffOptions(Array.isArray(d) ? d.map((s: { id: string; name: string; email: string }) => ({ id: s.id, name: s.name, email: s.email })) : [])).catch(() => {})
  }, [tier, moduleKey])

  async function grantAccess() {
    if (!grantStaffId) return
    const res = await fetch(`/api/module-access/${moduleKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: grantStaffId, tier: grantTier }),
    })
    if (res.ok) {
      const data = await res.json()
      setGrants(p => [data.grant, ...p.filter(g => g.staff_id !== grantStaffId)])
      setGrantStaffId('')
    }
  }

  async function revokeAccess(grant: Grant) {
    const res = await fetch(`/api/module-access/${moduleKey}/${grant.id}`, { method: 'DELETE' })
    if (res.ok) setGrants(p => p.filter(g => g.id !== grant.id))
  }

  if (!checked) return null

  if (tier !== 'admin') {
    return (
      <div style={{ maxWidth: '480px', margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>{moduleLabel} admin access required</div>
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Ask a current {moduleLabel} admin to grant you access.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '14px' }}>Grant Access</div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <select value={grantStaffId} onChange={e => setGrantStaffId(e.target.value)}
          style={{ flex: 1, padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
          <option value="">Select staff member…</option>
          {staffOptions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
        </select>
        <select value={grantTier} onChange={e => setGrantTier(e.target.value)}
          style={{ padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={grantAccess} style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: 'var(--ink3)', color: 'var(--surface)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Grant</button>
      </div>

      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>Current Grants ({grants.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {grants.map(g => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{g.staff_members?.name ?? g.staff_id}</span>
            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{g.staff_members?.email}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: g.tier === 'admin' ? 'var(--purple)' : 'var(--ink3)', background: g.tier === 'admin' ? 'var(--purple-light)' : 'var(--card-hi)', padding: '2px 8px', borderRadius: '10px' }}>{g.tier}</span>
            <button onClick={() => revokeAccess(g)} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Revoke</button>
          </div>
        ))}
        {grants.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No grants yet.</div>}
      </div>
    </div>
  )
}
