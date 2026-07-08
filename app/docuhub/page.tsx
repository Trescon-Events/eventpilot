'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import NavBar, { MOD_DOCUHUB } from '@/app/components/NavBar'

type DocType = {
  id: string; key: string; label: string; slug_prefix: string
  requires_event_attribution: boolean; supports_expiry: boolean
  default_visibility: string; allowed_formats: string[]
}
type DocRow = {
  id: string; title: string; slug: string; format: string
  object_key: string | null; external_url: string | null
  visibility: string; event_id: string | null; event_label: string | null
  event_date: string | null; event_venue: string | null
  link_expires_at: string | null; description: string | null
  uploaded_by: string; created_at: string
  doc_types: { key: string; label: string; slug_prefix: string }
}

const DOCUHUB_DOMAIN = 'docuhub.tresconglobal.com'

function permalinkFor(doc: DocRow): string {
  return `https://${DOCUHUB_DOMAIN}/${doc.doc_types.slug_prefix}/${doc.slug}`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DocuHubPage() {
  const [sid, setSid] = useState('')
  const [tier, setTier] = useState<'none' | 'user' | 'admin'>('none')
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [docs, setDocs] = useState<DocRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterVisibility, setFilterVisibility] = useState('')
  const [filterMine, setFilterMine] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => { if (s?.sid) setSid(s.sid) })
    fetch('/api/docuhub/access/me').then(r => r.json()).then(d => setTier(d.tier ?? 'none'))
    fetch('/api/docuhub/doc-types').then(r => r.json()).then(d => setDocTypes(Array.isArray(d) ? d : []))
  }, [])

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterType) params.set('doc_type', filterType)
    if (filterVisibility) params.set('visibility', filterVisibility)
    if (filterMine) params.set('mine', 'true')
    if (search) params.set('q', search)
    const res = await fetch(`/api/docuhub/documents?${params}`)
    const data = await res.json()
    setDocs(data.documents ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [filterType, filterVisibility, filterMine, search])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  function startEdit(doc: DocRow) {
    setEditingId(doc.id)
    setEditForm({
      title: doc.title,
      description: doc.description ?? '',
      visibility: doc.visibility,
      event_label: doc.event_label ?? '',
      event_date: doc.event_date ?? '',
      event_venue: doc.event_venue ?? '',
      link_expires_at: doc.link_expires_at ? doc.link_expires_at.slice(0, 10) : '',
    })
    setMsg('')
  }

  async function saveEdit(doc: DocRow) {
    const res = await fetch(`/api/docuhub/documents/${doc.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editForm.title, description: editForm.description, visibility: editForm.visibility,
        event_label: editForm.event_label || null, event_date: editForm.event_date || null,
        event_venue: editForm.event_venue || null,
        link_expires_at: editForm.link_expires_at ? new Date(editForm.link_expires_at).toISOString() : null,
      }),
    })
    if (res.ok) { setEditingId(null); fetchDocs() } else {
      const data = await res.json().catch(() => ({}))
      setMsg(data.error ?? 'Could not save changes.')
    }
  }

  async function deleteDoc(doc: DocRow) {
    if (!confirm(`Delete "${doc.title}"? This can't be undone from here.`)) return
    const res = await fetch(`/api/docuhub/documents/${doc.id}`, { method: 'DELETE' })
    if (res.ok) fetchDocs()
    else { const data = await res.json().catch(() => ({})); setMsg(data.error ?? 'Could not delete.') }
  }

  function copyLink(doc: DocRow) {
    navigator.clipboard.writeText(permalinkFor(doc))
    setMsg('Link copied.')
    setTimeout(() => setMsg(''), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <NavBar module={MOD_DOCUHUB} homeHref="/docuhub" rightSlot={
        <div style={{ display: 'flex', gap: '8px' }}>
          {tier === 'admin' && (
            <Link href="/docuhub/settings" style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
              Settings
            </Link>
          )}
          {tier !== 'none' && (
            <>
              <Link href="/docuhub/bulk" style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                Bulk Upload
              </Link>
              <Link href="/docuhub/upload" style={{ padding: '8px 16px', borderRadius: '9px', border: 'none', background: '#D97706', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                + Upload
              </Link>
            </>
          )}
        </div>
      } />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#B45309', marginBottom: '6px' }}>DocuHub</div>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', margin: '0 0 20px' }}>Documents ({total})</h1>

        {tier === 'none' && (
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '16px', marginBottom: '20px', fontSize: '13px', color: '#5B7080' }}>
            You can browse documents here, but you don&rsquo;t have upload access yet. Ask a DocuHub admin to grant you access.
          </div>
        )}

        {msg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', color: '#B45309', marginBottom: '16px' }}>{msg}</div>}

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or event…"
            style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', minWidth: '220px' }} />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
            <option value="">All Types</option>
            {docTypes.map(t => <option key={t.id} value={t.key}>{t.label}</option>)}
          </select>
          <select value={filterVisibility} onChange={e => setFilterVisibility(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
            <option value="">All Visibility</option>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#5B7080', cursor: 'pointer' }}>
            <input type="checkbox" checked={filterMine} onChange={e => setFilterMine(e.target.checked)} />
            Mine only
          </label>
        </div>

        {loading ? (
          <div style={{ fontSize: '13px', color: '#5B7080' }}>Loading…</div>
        ) : docs.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#5B7080' }}>No documents match these filters.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {docs.map(doc => {
              const isOwner = doc.uploaded_by === sid
              const canEdit = isOwner || tier === 'admin'
              const canDelete = tier === 'admin'
              const expired = doc.link_expires_at ? new Date(doc.link_expires_at) <= new Date() : false
              return (
                <div key={doc.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'rgba(217,119,6,0.1)', color: '#B45309' }}>{doc.doc_types.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', flex: 1 }}>{doc.title}</span>
                    {doc.event_label && <span style={{ fontSize: '13px', color: '#5B7080' }}>{doc.event_label}{doc.event_date ? ` · ${fmtDate(doc.event_date)}` : ''}</span>}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: doc.visibility === 'public' ? '#3D6B00' : '#5B7080', background: doc.visibility === 'public' ? 'rgba(61,107,0,0.1)' : '#E8EEF4', padding: '2px 8px', borderRadius: '10px' }}>
                      {doc.visibility === 'public' ? 'Public' : 'Internal'}
                    </span>
                    {doc.link_expires_at && (
                      <span style={{ fontSize: '13px', fontWeight: 700, color: expired ? '#8B1A1A' : '#92400E', background: expired ? 'rgba(139,26,26,0.1)' : 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: '10px' }}>
                        {expired ? 'Expired' : `Expires ${fmtDate(doc.link_expires_at)}`}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                    <a href={`https://${DOCUHUB_DOMAIN}/${doc.doc_types.slug_prefix}/${doc.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#B45309', textDecoration: 'none', fontFamily: 'monospace' }}>
                      /{doc.doc_types.slug_prefix}/{doc.slug}
                    </a>
                    <button onClick={() => copyLink(doc)} style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Copy Link</button>
                    {canEdit && editingId !== doc.id && (
                      <button onClick={() => startEdit(doc)} style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                    )}
                    {canDelete && (
                      <button onClick={() => deleteDoc(doc)} style={{ fontSize: '13px', fontWeight: 700, color: '#FF6B6B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                    )}
                  </div>

                  {editingId === doc.id && (
                    <div style={{ marginTop: '12px', padding: '14px', background: '#E8EEF4', borderRadius: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>Title</label>
                          <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>Visibility</label>
                          <select value={editForm.visibility} onChange={e => setEditForm(p => ({ ...p, visibility: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                            <option value="public">Public</option>
                            <option value="internal">Internal</option>
                          </select>
                        </div>
                      </div>
                      {(doc.event_label !== null || doc.event_id) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <input value={editForm.event_label} onChange={e => setEditForm(p => ({ ...p, event_label: e.target.value }))} placeholder="Event name"
                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                          <input type="date" value={editForm.event_date} onChange={e => setEditForm(p => ({ ...p, event_date: e.target.value }))}
                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                          <input value={editForm.event_venue} onChange={e => setEditForm(p => ({ ...p, event_venue: e.target.value }))} placeholder="Venue"
                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                        </div>
                      )}
                      {doc.link_expires_at !== undefined && (
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>Link expires</label>
                          <input type="date" value={editForm.link_expires_at} onChange={e => setEditForm(p => ({ ...p, link_expires_at: e.target.value }))}
                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                        </div>
                      )}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>Description</label>
                        <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={2}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => saveEdit(doc)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
