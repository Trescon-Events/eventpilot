'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/app/components/PageHeader'
import AccessTab from '@/app/components/AccessTab'

type DocType = {
  id: string; key: string; label: string; slug_prefix: string
  requires_event_attribution: boolean; supports_expiry: boolean
  default_visibility: string; allowed_formats: string[]; is_active: boolean; sort_order: number
}
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

  const [audit, setAudit] = useState<AuditEntry[]>([])

  useEffect(() => {
    fetch('/api/module-access/dochub/me').then(r => r.json()).then(d => { setTier(d.tier ?? 'none'); setChecked(true) })
  }, [])

  useEffect(() => {
    if (tier !== 'admin') return
    fetch('/api/docuhub/doc-types').then(r => r.json()).then(d => setDocTypes(Array.isArray(d) ? d : []))
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

  if (!checked) return null

  if (tier !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope), sans-serif' }}>
        <PageHeader eyebrow="DocuHub" title="Settings" />
        <div style={{ maxWidth: '480px', margin: '80px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>DocuHub admin access required</div>
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Ask a current DocuHub admin to grant you access.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <PageHeader eyebrow="DocuHub" title="Settings" />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {([{ key: 'types', label: 'Document Types' }, { key: 'access', label: 'Access' }, { key: 'activity', label: 'Recent Activity' }] as { key: typeof tab; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${tab === t.key ? 'var(--amber-border)' : 'var(--border)'}`, background: tab === t.key ? 'var(--amber-light)' : 'var(--card)', color: tab === t.key ? 'var(--amber)' : 'var(--ink3)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'types' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Document Types</div>
              <button onClick={() => setShowNewType(true)} style={{ padding: '8px 14px', borderRadius: '9px', border: 'none', background: 'var(--amber)', color: 'var(--amber-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>+ New Type</button>
            </div>

            {showNewType && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--amber-border)', borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <input value={newType.key} onChange={e => setNewType(p => ({ ...p, key: e.target.value }))} placeholder="key (e.g. marketing_brief)"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                  <input value={newType.label} onChange={e => setNewType(p => ({ ...p, label: e.target.value }))} placeholder="Label (e.g. Marketing Brief)"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                  <input value={newType.slug_prefix} onChange={e => setNewType(p => ({ ...p, slug_prefix: e.target.value }))} placeholder="slug-prefix"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newType.requires_event_attribution} onChange={e => setNewType(p => ({ ...p, requires_event_attribution: e.target.checked }))} />
                    Requires event attribution
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newType.supports_expiry} onChange={e => setNewType(p => ({ ...p, supports_expiry: e.target.checked }))} />
                    Supports expiry date
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)' }}>
                    Default visibility:
                    <select value={newType.default_visibility} onChange={e => setNewType(p => ({ ...p, default_visibility: e.target.value }))} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
                      <option value="internal">Internal</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '14px', marginBottom: '12px' }}>
                  {['file', 'link'].map(f => (
                    <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newType.allowed_formats.includes(f)}
                        onChange={e => setNewType(p => ({ ...p, allowed_formats: e.target.checked ? [...p.allowed_formats, f] : p.allowed_formats.filter(x => x !== f) }))} />
                      Allow {f === 'file' ? 'File upload' : 'Link'}
                    </label>
                  ))}
                </div>
                {typeMsg && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{typeMsg}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={createType} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Create</button>
                  <button onClick={() => { setShowNewType(false); setTypeMsg('') }} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {docTypes.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <button onClick={() => toggleTypeActive(t)} title={t.is_active ? 'Active — click to disable' : 'Disabled — click to enable'}
                    style={{ width: '10px', height: '10px', borderRadius: '50%', border: 'none', background: t.is_active ? 'var(--lime)' : 'var(--border)', cursor: 'pointer', flexShrink: 0, padding: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{t.label}</span>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)', fontFamily: 'monospace' }}>/{t.slug_prefix}/</span>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)', flex: 1 }}>
                    {t.requires_event_attribution ? 'Event-linked · ' : ''}{t.supports_expiry ? 'Expires · ' : ''}{t.default_visibility} · {t.allowed_formats.join('/')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'access' && <AccessTab moduleKey="dochub" moduleLabel="DocuHub" />}

        {tab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {audit.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' }}>{a.action}</span>
                <span style={{ fontSize: '13px', color: 'var(--ink3)', flex: 1 }}>{a.docuhub_documents?.title ?? 'Deleted document'}</span>
                <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{a.staff_members?.name ?? 'Unknown'} ({a.actor_tier})</span>
                <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
            {audit.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No activity yet.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
