'use client'

import { useState, useEffect } from 'react'
import { AppShellNav } from '@/app/components/AppShell'
import PlatformMenu from '@/app/components/PlatformMenu'

type Grant = { id: string; staff_id: string; tier: string; granted_at: string; staff_members: { name: string; email: string } | null }
type StaffOption = { id: string; name: string; email: string }

export default function KnowledgeSettingsPage() {
  const [tier, setTier] = useState<'none' | 'user' | 'admin'>('none')
  const [checked, setChecked] = useState(false)

  const [grants, setGrants] = useState<Grant[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [grantStaffId, setGrantStaffId] = useState('')
  const [grantTier, setGrantTier] = useState('user')

  useEffect(() => {
    fetch('/api/kb/access/me').then(r => r.json()).then(d => { setTier(d.tier ?? 'none'); setChecked(true) })
  }, [])

  useEffect(() => {
    if (tier !== 'admin') return
    fetch('/api/kb/access').then(r => r.json()).then(d => setGrants(Array.isArray(d) ? d : []))
    fetch('/api/staff-list').then(r => r.json()).then(d => setStaffOptions(Array.isArray(d) ? d.map((s: { id: string; name: string; email: string }) => ({ id: s.id, name: s.name, email: s.email })) : [])).catch(() => {})
  }, [tier])

  async function grantAccess() {
    if (!grantStaffId) return
    const res = await fetch('/api/kb/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: grantStaffId, tier: grantTier }),
    })
    if (res.ok) {
      const data = await res.json()
      setGrants(p => [data.grant, ...p.filter(g => g.staff_id !== grantStaffId)])
      setGrantStaffId('')
    }
  }

  async function revokeAccess(grant: Grant) {
    const res = await fetch(`/api/kb/access/${grant.id}`, { method: 'DELETE' })
    if (res.ok) setGrants(p => p.filter(g => g.id !== grant.id))
  }

  if (!checked) return null

  if (tier !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), sans-serif' }}>
        <AppShellNav moduleKey="kb" moduleHref="/knowledge" homeHref="/knowledge" />
        <div style={{ maxWidth: '480px', margin: '80px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F1923', marginBottom: '8px' }}>Knowledge Base admin access required</div>
          <div style={{ fontSize: '13px', color: '#5B7080' }}>Ask a current KB admin to grant you access.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <AppShellNav moduleKey="kb" moduleHref="/knowledge" homeHref="/knowledge" subtitle="Settings" rightSlot={<PlatformMenu />} />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', margin: '0 0 20px' }}>Knowledge Base Settings</h1>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(91,112,128,0.4)', background: 'rgba(91,112,128,0.08)', color: '#5B7080', fontSize: '13px', fontWeight: 800, fontFamily: 'inherit' }}>
            Access
          </button>
        </div>

        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '14px' }}>Grant Access</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <select value={grantStaffId} onChange={e => setGrantStaffId(e.target.value)}
              style={{ flex: 1, padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
              <option value="">Select staff member…</option>
              {staffOptions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
            </select>
            <select value={grantTier} onChange={e => setGrantTier(e.target.value)}
              style={{ padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={grantAccess} style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: '#5B7080', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Grant</button>
          </div>

          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '10px' }}>Current Grants ({grants.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {grants.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', flex: 1 }}>{g.staff_members?.name ?? g.staff_id}</span>
                <span style={{ fontSize: '13px', color: '#5B7080' }}>{g.staff_members?.email}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: g.tier === 'admin' ? '#7C3AED' : '#5B7080', background: g.tier === 'admin' ? 'rgba(124,58,237,0.1)' : '#E8EEF4', padding: '2px 8px', borderRadius: '10px' }}>{g.tier}</span>
                <button onClick={() => revokeAccess(g)} style={{ fontSize: '13px', fontWeight: 700, color: '#FF6B6B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Revoke</button>
              </div>
            ))}
            {grants.length === 0 && <div style={{ fontSize: '13px', color: '#5B7080' }}>No grants yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
