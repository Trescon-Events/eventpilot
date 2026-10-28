'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card } from '@/app/components/ui'

/* Admin > Super Admin (visible and usable only to the fixed Super Admin; every call below is re-checked on the server).
   1. System Admins — who holds the `admin` role, and their other platform roles.
   2. Alerts — which kinds of system alert go to whom. A kind nobody is chosen for goes to the Super Admin. */

type Staff = { id: string; name: string; email: string; department: string | null; access_roles: string[]; is_super_admin: boolean }
type AlertRecipient = { staff_id: string; email: boolean; bell: boolean }
type AlertKind = { key: string; label: string; description: string; recipients: AlertRecipient[] }

const OTHER_ROLES: [string, string][] = [['hr', 'HR'], ['project_manager', 'Project manager'], ['project_director', 'Project director']]
const labelStyle = { fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1.2px', textTransform: 'uppercase' as const, margin: '0 0 10px' }
const selectStyle = { padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '12px', minWidth: '260px' }

export default function SuperAdminPanel() {
  const [staff, setStaff] = useState<Staff[] | null>(null)
  const [kinds, setKinds] = useState<AlertKind[] | null>(null)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pickAdmin, setPickAdmin] = useState('')
  const [pickRecipient, setPickRecipient] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([fetch('/api/super-admin/staff'), fetch('/api/super-admin/alerts')])
    const sd = await s.json().catch(() => ({})), ad = await a.json().catch(() => ({}))
    if (!s.ok || !a.ok) { setMsg({ text: sd.error ?? ad.error ?? 'Could not load.', error: true }); return }
    setStaff(sd.staff); setKinds(ad.types)
  }, [])
  useEffect(() => { let live = true; Promise.all([fetch('/api/super-admin/staff'), fetch('/api/super-admin/alerts')]).then(async ([s, a]) => { const sd = await s.json().catch(() => ({})), ad = await a.json().catch(() => ({})); if (!live) return; if (!s.ok || !a.ok) setMsg({ text: sd.error ?? ad.error ?? 'Could not load.', error: true }); else { setStaff(sd.staff); setKinds(ad.types) } }); return () => { live = false } }, [])

  async function saveRoles(p: Staff, roles: string[]) {
    setBusy(p.id); setMsg(null)
    const res = await fetch('/api/staff-roles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, roles }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setMsg({ text: d.error ?? 'Could not save.', error: true }); return }
    setStaff(prev => prev && prev.map(x => x.id === p.id ? { ...x, access_roles: d.access_roles } : x))
    setMsg({ text: `Saved ${p.name}.`, error: false })
  }
  const withRole = (p: Staff, r: string, on: boolean) => { const base = p.access_roles.filter(x => x !== r && x !== 'standard'); return on ? [...base, r] : base }

  async function saveKind(k: AlertKind, recipients: AlertRecipient[]) {
    setBusy(k.key); setMsg(null)
    const res = await fetch('/api/super-admin/alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alert_type: k.key, recipients }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setMsg({ text: d.error ?? 'Could not save.', error: true }); return }
    setKinds(prev => prev && prev.map(x => x.key === k.key ? { ...x, recipients } : x))
    setMsg({ text: `Saved recipients for "${k.label}".`, error: false })
  }

  if (!staff || !kinds) return <div style={{ fontSize: '13px', color: msg?.error ? 'var(--red)' : 'var(--ink3)' }}>{msg?.text ?? 'Loading…'}</div>

  const byId = new Map(staff.map(s => [s.id, s]))
  const admins = staff.filter(s => s.is_super_admin || s.access_roles.includes('admin'))
  const candidates = staff.filter(s => !s.is_super_admin && !s.access_roles.includes('admin'))

  return (
    <div style={{ display: 'grid', gap: '24px', maxWidth: '860px' }}>
      <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Only the Super Admin sees this page. The Super Admin is fixed in the code and cannot be changed here or by any sync.</div>
      {msg && <div style={{ fontSize: '12px', color: msg.error ? 'var(--red)' : 'var(--ink)' }}>{msg.text}</div>}

      <section>
        <h3 style={labelStyle}>System admins</h3>
        <Card padded>
          <div style={{ display: 'grid', gap: '10px' }}>
            {admins.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{p.name} {p.is_super_admin && <span style={{ fontSize: '11px', color: 'var(--teal-mid)' }}>· Super Admin (fixed)</span>}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{p.email}</div>
                </div>
                {!p.is_super_admin && (
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
                    {OTHER_ROLES.map(([r, label]) => (
                      <label key={r} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input type="checkbox" checked={p.access_roles.includes(r)} disabled={busy === p.id} onChange={e => saveRoles(p, withRole(p, r, e.target.checked))} /> {label}
                      </label>
                    ))}
                    <Button variant="ghost" disabled={busy === p.id} onClick={() => { if (window.confirm(`Remove ${p.name} as a System Admin?`)) saveRoles(p, withRole(p, 'admin', false)) }}>Remove</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
            <select value={pickAdmin} onChange={e => setPickAdmin(e.target.value)} style={selectStyle}>
              <option value="">Add a System Admin…</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
            </select>
            <Button variant="teal" disabled={!pickAdmin || !!busy} onClick={() => { const p = byId.get(pickAdmin); if (p) { saveRoles(p, [...p.access_roles.filter(x => x !== 'standard'), 'admin']); setPickAdmin('') } }}>Make System Admin</Button>
          </div>
        </Card>
      </section>

      <section>
        <h3 style={labelStyle}>Alerts</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {kinds.map(k => {
            const taken = new Set(k.recipients.map(r => r.staff_id))
            const choice = pickRecipient[k.key] ?? ''
            return (
              <Card key={k.key} padded>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{k.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', margin: '4px 0 10px', maxWidth: '640px' }}>{k.description}</div>
                {k.recipients.length === 0 && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '8px' }}>Nobody chosen — goes to the Super Admin.</div>}
                {k.recipients.map(r => {
                  const p = byId.get(r.staff_id)
                  const set = (patch: Partial<AlertRecipient>) => saveKind(k, k.recipients.map(x => x.staff_id === r.staff_id ? { ...x, ...patch } : x))
                  return (
                    <div key={r.staff_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '5px 0', fontSize: '12px' }}>
                      <span><strong>{p?.name ?? 'Former staff'}</strong> <span style={{ color: 'var(--ink3)' }}>{p?.email}</span></span>
                      <span style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <label><input type="checkbox" checked={r.email} disabled={busy === k.key} onChange={e => set({ email: e.target.checked })} /> Email</label>
                        <label><input type="checkbox" checked={r.bell} disabled={busy === k.key} onChange={e => set({ bell: e.target.checked })} /> In-app bell</label>
                        <Button variant="ghost" disabled={busy === k.key} onClick={() => saveKind(k, k.recipients.filter(x => x.staff_id !== r.staff_id))}>Remove</Button>
                      </span>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <select value={choice} onChange={e => setPickRecipient(prev => ({ ...prev, [k.key]: e.target.value }))} style={selectStyle}>
                    <option value="">Add a recipient…</option>
                    {staff.filter(s => !taken.has(s.id)).map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
                  </select>
                  <Button variant="teal" disabled={!choice || busy === k.key} onClick={() => { saveKind(k, [...k.recipients, { staff_id: choice, email: true, bell: true }]); setPickRecipient(prev => ({ ...prev, [k.key]: '' })) }}>Add</Button>
                </div>
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}
