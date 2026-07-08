'use client'

import { useState, useEffect } from 'react'
import NavBar, { MOD_DOCUHUB } from '@/app/components/NavBar'

type DocType = {
  id: string; key: string; label: string; slug_prefix: string
  requires_event_attribution: boolean; supports_expiry: boolean
  default_visibility: string; allowed_formats: string[]; is_active: boolean; sort_order: number
}
type Grant = { id: string; staff_id: string; tier: string; granted_at: string; staff_members: { name: string; email: string } | null }
type StaffOption = { id: string; name: string; email: string }
type AuditEntry = {
  id: string; action: string; actor_tier: string; created_at: string
  staff_members: { name: string; email: string } | null
  docuhub_documents: { title: string } | null
}

const NEW_TYPE_FORM = { key: '', label: '', slug_prefix: '', requires_event_attribution: false, supports_expiry: false, default_visibility: 'internal', allowed_formats: ['file', 'link'] as string[] }

export default function DocuHubSettingsPage() {
  const [tier, setTier] = useState<'none' | 'user' | 'admin'>('none')
  const [checked, setChecked] = useState(false)
  const [tab, setTab] = useState<'types' | 'access' | 'activity'>('types')

  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [showNewType, setShowNewType] = useState(false)
  const [newType, setNewType] = useState(NEW_TYPE_FORM)
  const [typeMsg, setTypeMsg] = useState('')

  const [grants, setGrants] = useState<Grant[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [grantStaffId, setGrantStaffId] = useState('')
  const [grantTier, setGrantTier] = useState('user')

  const [audit, setAudit] = useState<AuditEntry[]>([])

  useEffect(() => {
    fetch('/api/docuhub/access/me').then(r => r.json()).then(d => { setTier(d.tier ?? 'none'); setChecked(true) })
  }, [])

  useEffect(() => {
    if (tier !== 'admin') return
    fetch('/api/docuhub/doc-types').then(r => r.json()).then(d => setDocTypes(Array.isArray(d) ? d : []))
    fetch('/api/docuhub/access').then(r => r.json()).then(d => setGrants(Array.isArray(d) ? d : []))
    fetch('/api/staff-list').then(r => r.json()).then(d => setStaffOptions(Array.isArray(d) ? d.map((s: { id: string; name: string; email: string }) => ({ id: s.id, name: s.name, email: s.email })) : [])).catch(() => {})
    fetch('/api/docuhub/audit').then(r => r.json()).then(d => setAudit(d.entries ?? []))
  }, [tier])

  async function createType() {
    if (!newType.key.trim() || !newType.label.trim() || !newType.slug_prefix.trim()) {
      setTypeMsg('Key, label, and slug prefix are required.'); return
    }
    const res = await fetch('/api/docuhub/doc-types', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newType),
    })
    const data = await res.json()
    if (!res.ok) { setTypeMsg(data.error ?? 'Could not create type.'); return }
    setDocTypes(p => [...p, data.doc_type])
    setShowNewType(false); setNewType(NEW_TYPE_FORM); setTypeMsg('')
  }

  async function toggleTypeActive(t: DocType) {
    const res = await fetch(`/api/docuhub/doc-types/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !t.is_active }),
    })
    if (res.ok) setDocTypes(p => p.map(x => x.id === t.id ? { ...x, is_active: !x.is_active } : x))
  }

  async function grantAccess() {
    if (!grantStaffId) return
    const res = await fetch('/api/docuhub/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: grantStaffId, tier: grantTier }),
    })
    if (res.ok) {
      const data = await res.json()
      setGrants(p => [data.grant, ...p.filter(g => g.staff_id !== grantStaffId)])
      setGrantStaffId('')
    }
  }

  async function revokeAccess(grant: Grant) {
    const res = await fetch(`/api/docuhub/access/${grant.id}`, { method: 'DELETE' })
    if (res.ok) setGrants(p => p.filter(g => g.id !== grant.id))
  }

  if (!checked) return null

  if (tier !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), sans-serif' }}>
        <NavBar module={MOD_DOCUHUB} homeHref="/docuhub" />
        <div style={{ maxWidth: '480px', margin: '80px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F1923', marginBottom: '8px' }}>DocuHub admin access required</div>
          <div style={{ fontSize: '13px', color: '#5B7080' }}>Ask a current DocuHub admin to grant you access.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <NavBar module={MOD_DOCUHUB} homeHref="/docuhub" subtitle="Settings" />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', margin: '0 0 20px' }}>DocuHub Settings</h1>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {([{ key: 'types', label: 'Document Types' }, { key: 'access', label: 'Access' }, { key: 'activity', label: 'Recent Activity' }] as { key: typeof tab; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${tab === t.key ? 'rgba(217,119,6,0.4)' : '#DDE8EE'}`, background: tab === t.key ? 'rgba(217,119,6,0.08)' : '#FFFFFF', color: tab === t.key ? '#B45309' : '#5B7080', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'types' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Document Types</div>
              <button onClick={() => setShowNewType(true)} style={{ padding: '8px 14px', borderRadius: '9px', border: 'none', background: '#D97706', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>+ New Type</button>
            </div>

            {showNewType && (
              <div style={{ background: '#FFFFFF', border: '1px solid rgba(217,119,6,0.25)', borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <input value={newType.key} onChange={e => setNewType(p => ({ ...p, key: e.target.value }))} placeholder="key (e.g. marketing_brief)"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                  <input value={newType.label} onChange={e => setNewType(p => ({ ...p, label: e.target.value }))} placeholder="Label (e.g. Marketing Brief)"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                  <input value={newType.slug_prefix} onChange={e => setNewType(p => ({ ...p, slug_prefix: e.target.value }))} placeholder="slug-prefix"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newType.requires_event_attribution} onChange={e => setNewType(p => ({ ...p, requires_event_attribution: e.target.checked }))} />
                    Requires event attribution
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newType.supports_expiry} onChange={e => setNewType(p => ({ ...p, supports_expiry: e.target.checked }))} />
                    Supports expiry date
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923' }}>
                    Default visibility:
                    <select value={newType.default_visibility} onChange={e => setNewType(p => ({ ...p, default_visibility: e.target.value }))} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                      <option value="internal">Internal</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '14px', marginBottom: '12px' }}>
                  {['file', 'link'].map(f => (
                    <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newType.allowed_formats.includes(f)}
                        onChange={e => setNewType(p => ({ ...p, allowed_formats: e.target.checked ? [...p.allowed_formats, f] : p.allowed_formats.filter(x => x !== f) }))} />
                      Allow {f === 'file' ? 'File upload' : 'Link'}
                    </label>
                  ))}
                </div>
                {typeMsg && <div style={{ fontSize: '13px', color: '#FF6B6B', marginBottom: '10px' }}>{typeMsg}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={createType} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Create</button>
                  <button onClick={() => { setShowNewType(false); setTypeMsg('') }} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {docTypes.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '10px' }}>
                  <button onClick={() => toggleTypeActive(t)} title={t.is_active ? 'Active — click to disable' : 'Disabled — click to enable'}
                    style={{ width: '10px', height: '10px', borderRadius: '50%', border: 'none', background: t.is_active ? '#3D6B00' : '#DDE8EE', cursor: 'pointer', flexShrink: 0, padding: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{t.label}</span>
                  <span style={{ fontSize: '13px', color: '#5B7080', fontFamily: 'monospace' }}>/{t.slug_prefix}/</span>
                  <span style={{ fontSize: '13px', color: '#5B7080', flex: 1 }}>
                    {t.requires_event_attribution ? 'Event-linked · ' : ''}{t.supports_expiry ? 'Expires · ' : ''}{t.default_visibility} · {t.allowed_formats.join('/')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'access' && (
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
              <button onClick={grantAccess} style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: '#D97706', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Grant</button>
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
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {audit.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', textTransform: 'capitalize' }}>{a.action}</span>
                <span style={{ fontSize: '13px', color: '#5B7080', flex: 1 }}>{a.docuhub_documents?.title ?? 'Deleted document'}</span>
                <span style={{ fontSize: '13px', color: '#5B7080' }}>{a.staff_members?.name ?? 'Unknown'} ({a.actor_tier})</span>
                <span style={{ fontSize: '13px', color: '#5B7080' }}>{new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
            {audit.length === 0 && <div style={{ fontSize: '13px', color: '#5B7080' }}>No activity yet.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
