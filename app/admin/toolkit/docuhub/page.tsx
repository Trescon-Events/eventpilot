'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import LocationSelect from '@/app/components/LocationSelect'
import { KNOWN_CITIES, COUNTRIES } from '@/app/lib/docuhub/locations'
import { docuhubDomain } from '@/app/lib/docuhub/domain'

const EVENT_TYPES = [
  { value: 'managed', label: 'Managed' },
  { value: 'signature', label: 'Signature' },
  { value: 'bespoke', label: 'Bespoke' },
]

const EVENT_FORMATS = [
  { value: 'in_person', label: 'In-person' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'hybrid', label: 'Hybrid' },
]

type DocType = {
  id: string; key: string; label: string; slug_prefix: string
  requires_event_attribution: boolean; requires_client_attribution: boolean; supports_expiry: boolean
  default_visibility: string; allowed_formats: string[]
}
type StaffOption = { id: string; name: string; email: string }
type DocRow = {
  id: string; title: string; slug: string; format: string
  object_key: string | null; external_url: string | null
  visibility: string; event_id: string | null; event_label: string | null
  event_type: string | null; event_start_date: string | null; event_end_date: string | null
  event_city: string | null; event_country: string | null; event_venue: string | null
  series: string | null; event_format: string | null; event_region: string | null
  client_name: string | null; owner_staff_id: string | null
  link_expires_at: string | null; description: string | null
  uploaded_by: string; created_at: string
  doc_types: { key: string; label: string; slug_prefix: string }
}

function permalinkFor(doc: DocRow): string {
  return `https://${docuhubDomain(doc.visibility)}/${doc.doc_types.slug_prefix}/${doc.slug}`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const [yyyy, mm, dd] = d.slice(0, 10).split('-')
  return `${dd}-${mm}-${yyyy}`
}

const FORMAT_LABEL: Record<string, string> = { virtual: 'Virtual', hybrid: 'Hybrid', in_person: 'In-person' }
const EVENT_TYPE_LABEL: Record<string, string> = { managed: 'Managed', signature: 'Signature', bespoke: 'Bespoke' }

/** Everything shown in the "Details" column — only what's actually populated on this document. */
function detailsFor(doc: DocRow, staffOptions: StaffOption[]): string[] {
  const parts: string[] = []
  if (doc.event_label) {
    if (doc.event_start_date) {
      parts.push(doc.event_end_date && doc.event_end_date !== doc.event_start_date
        ? `${fmtDate(doc.event_start_date)} – ${fmtDate(doc.event_end_date)}`
        : fmtDate(doc.event_start_date))
    }
    if (doc.event_city) parts.push(doc.event_city)
    if (doc.event_region) parts.push(doc.event_region)
    if (doc.event_format && doc.event_format !== 'in_person') parts.push(FORMAT_LABEL[doc.event_format])
    if (doc.series) parts.push(doc.series)
  }
  if (doc.client_name) {
    if (doc.event_type) parts.push(EVENT_TYPE_LABEL[doc.event_type] ?? doc.event_type)
    if (doc.owner_staff_id) parts.push(staffOptions.find(s => s.id === doc.owner_staff_id)?.name ?? 'Owner assigned')
  }
  return parts
}

export default function DocuHubPage() {
  const [sid, setSid] = useState('')
  const [tier, setTier] = useState<'none' | 'user' | 'admin'>('none')
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
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
  const [deletingDoc, setDeletingDoc] = useState<DocRow | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => { if (s?.sid) setSid(s.sid) })
    fetch('/api/docuhub/access/me').then(r => r.json()).then(d => setTier(d.tier ?? 'none'))
    fetch('/api/docuhub/doc-types').then(r => r.json()).then(d => setDocTypes(Array.isArray(d) ? d : []))
    fetch('/api/staff-list').then(r => r.json()).then(d => setStaffOptions(Array.isArray(d) ? d : [])).catch(() => {})
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
      event_type: doc.event_type ?? '',
      event_start_date: doc.event_start_date ?? '',
      event_end_date: doc.event_end_date ?? '',
      event_city: doc.event_city ?? '',
      event_country: doc.event_country ?? '',
      event_venue: doc.event_venue ?? '',
      series: doc.series ?? '',
      event_format: doc.event_format ?? '',
      event_region: doc.event_region ?? '',
      client_name: doc.client_name ?? '',
      owner_staff_id: doc.owner_staff_id ?? '',
      link_expires_at: doc.link_expires_at ? doc.link_expires_at.slice(0, 10) : '',
    })
    setMsg('')
  }

  async function saveEdit(doc: DocRow) {
    const res = await fetch(`/api/docuhub/documents/${doc.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editForm.title, description: editForm.description, visibility: editForm.visibility,
        event_label: editForm.event_label || null, event_type: editForm.event_type || null,
        event_start_date: editForm.event_start_date || null, event_end_date: editForm.event_end_date || null,
        event_city: editForm.event_city || null, event_country: editForm.event_country || null,
        event_venue: editForm.event_venue || null, series: editForm.series || null,
        event_format: editForm.event_format || null, event_region: editForm.event_region || null,
        client_name: editForm.client_name || null, owner_staff_id: editForm.owner_staff_id || null,
        link_expires_at: editForm.link_expires_at ? new Date(editForm.link_expires_at).toISOString() : null,
      }),
    })
    if (res.ok) { setEditingId(null); fetchDocs() } else {
      const data = await res.json().catch(() => ({}))
      setMsg(data.error ?? 'Could not save changes.')
    }
  }

  async function confirmDelete() {
    if (!deletingDoc || deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    const res = await fetch(`/api/docuhub/documents/${deletingDoc.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { setDeletingDoc(null); setDeleteConfirmText(''); fetchDocs() }
    else { const data = await res.json().catch(() => ({})); setMsg(data.error ?? 'Could not delete.') }
  }

  function copyLink(doc: DocRow) {
    navigator.clipboard.writeText(permalinkFor(doc))
    setMsg('Link copied.')
    setTimeout(() => setMsg(''), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <PageHeader
        eyebrow="DocuHub"
        title={`Documents (${total})`}
        actions={<>
          <Link href="/admin/toolkit/knowledge-assistant" style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid var(--teal-border)', background: 'var(--teal-light)', color: 'var(--teal-mid)', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
            Knowledge Assistant
          </Link>
          {tier !== 'none' && (
            <Link href="/admin/toolkit/docuhub/upload" style={{ padding: '8px 16px', borderRadius: '9px', border: 'none', background: 'var(--amber)', color: 'var(--amber-light)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
              + Upload
            </Link>
          )}
        </>}
      />

      <div style={{ maxWidth: '1320px', margin: '0 auto', padding: '24px' }}>
        {tier === 'none' && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px', fontSize: '13px', color: 'var(--ink3)' }}>
            You can browse documents here, but you don&rsquo;t have upload access yet. Ask a DocuHub admin to grant you access.
          </div>
        )}

        {msg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', marginBottom: '16px' }}>{msg}</div>}

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or event…"
            style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', minWidth: '220px' }} />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
            <option value="">All Types</option>
            {docTypes.map(t => <option key={t.id} value={t.key}>{t.label}</option>)}
          </select>
          <select value={filterVisibility} onChange={e => setFilterVisibility(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
            <option value="">All Visibility</option>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={filterMine} onChange={e => setFilterMine(e.target.checked)} />
            Mine only
          </label>
        </div>

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
        ) : docs.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No documents match these filters.</div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '30%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--card-hi)', borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Type', 'Event / Client', 'Details', 'Visibility', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => {
                  const isOwner = doc.uploaded_by === sid
                  const canEdit = isOwner || tier === 'admin'
                  const canDelete = tier === 'admin'
                  const expired = doc.link_expires_at ? new Date(doc.link_expires_at) <= new Date() : false
                  const primary = doc.event_label ?? doc.client_name
                  const details = detailsFor(doc, staffOptions)
                  return (
                    <Fragment key={doc.id}>
                      <tr style={{ borderBottom: editingId === doc.id ? 'none' : '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: '13px', fontWeight: 800, color: 'var(--ink)', wordBreak: 'normal', overflowWrap: 'anywhere' }}>
                          {doc.title}
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                          <span style={{ display: 'inline-block', fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'var(--amber-light)', color: 'var(--amber)', whiteSpace: 'nowrap' }}>{doc.doc_types.label}</span>
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: '13px', color: 'var(--ink)', wordBreak: 'normal', overflowWrap: 'anywhere' }}>
                          {primary ?? <span style={{ color: 'var(--ink4)' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: '12.5px', color: 'var(--ink3)' }}>
                          {details.length ? details.join(' · ') : <span style={{ color: 'var(--ink4)' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: doc.visibility === 'public' ? 'var(--lime)' : 'var(--ink3)', background: doc.visibility === 'public' ? 'var(--lime-light)' : 'var(--card-hi)', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                              {doc.visibility === 'public' ? 'Public' : 'Internal'}
                            </span>
                            {doc.link_expires_at && (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: expired ? 'var(--red)' : 'var(--amber)', background: expired ? 'var(--red-light)' : 'var(--amber-light)', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                                {expired ? 'Expired' : `Exp. ${fmtDate(doc.link_expires_at)}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                            <a href={permalinkFor(doc)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)', textDecoration: 'none' }}>Link ↗</a>
                            <button onClick={() => copyLink(doc)} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Copy</button>
                            {canEdit && (
                              <button onClick={() => editingId === doc.id ? setEditingId(null) : startEdit(doc)} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--purple)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                                {editingId === doc.id ? 'Cancel' : 'Edit'}
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => { setDeletingDoc(doc); setDeleteConfirmText('') }} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Delete</button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {editingId === doc.id && (
                        <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td colSpan={6} style={{ padding: '0 14px 16px' }}>
                            <div style={{ padding: '14px', background: 'var(--card-hi)', borderRadius: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Title</label>
                          <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Visibility</label>
                          <select value={editForm.visibility} onChange={e => setEditForm(p => ({ ...p, visibility: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
                            <option value="public">Public</option>
                            <option value="internal">Internal</option>
                          </select>
                        </div>
                      </div>
                      {(doc.event_label !== null || doc.event_id) && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <input value={editForm.event_label} onChange={e => setEditForm(p => ({ ...p, event_label: e.target.value }))} placeholder="Event name"
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                            <select value={editForm.event_type} onChange={e => setEditForm(p => ({ ...p, event_type: e.target.value }))}
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
                              <option value="">Event type…</option>
                              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <input type="date" value={editForm.event_start_date} onChange={e => setEditForm(p => ({ ...p, event_start_date: e.target.value }))}
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                            <input type="date" value={editForm.event_end_date} onChange={e => setEditForm(p => ({ ...p, event_end_date: e.target.value }))}
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <LocationSelect value={editForm.event_city} onChange={v => setEditForm(p => ({ ...p, event_city: v }))} options={KNOWN_CITIES.map(c => c.city)} placeholder="City" />
                            <LocationSelect value={editForm.event_country} onChange={v => setEditForm(p => ({ ...p, event_country: v }))} options={COUNTRIES} placeholder="Country" />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <input value={editForm.event_venue} onChange={e => setEditForm(p => ({ ...p, event_venue: e.target.value }))} placeholder="Venue (optional)"
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                            <input value={editForm.series} onChange={e => setEditForm(p => ({ ...p, series: e.target.value }))} placeholder="Series (only if multi-edition)"
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <select value={editForm.event_format} onChange={e => setEditForm(p => ({ ...p, event_format: e.target.value }))}
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
                              <option value="">Format…</option>
                              {EVENT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            <input value={editForm.event_region} onChange={e => setEditForm(p => ({ ...p, event_region: e.target.value }))} placeholder="Region (e.g. ASEAN)"
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                          </div>
                        </div>
                      )}
                      {(doc.client_name !== null || doc.owner_staff_id !== null) && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <input value={editForm.client_name} onChange={e => setEditForm(p => ({ ...p, client_name: e.target.value }))} placeholder="Client (organisation name)"
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                            <select value={editForm.owner_staff_id} onChange={e => setEditForm(p => ({ ...p, owner_staff_id: e.target.value }))}
                              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
                              <option value="">Owner…</option>
                              {staffOptions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
                            </select>
                          </div>
                          <select value={editForm.event_type} onChange={e => setEditForm(p => ({ ...p, event_type: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
                            <option value="">Event type…</option>
                            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                      )}
                      {doc.link_expires_at !== undefined && (
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Link expires</label>
                          <input type="date" value={editForm.link_expires_at} onChange={e => setEditForm(p => ({ ...p, link_expires_at: e.target.value }))}
                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }} />
                        </div>
                      )}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Description</label>
                        <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={2}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
                      </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => saveEdit(doc)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                <button onClick={() => setEditingId(null)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deletingDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ background: 'var(--card)', borderRadius: '16px', padding: '28px', maxWidth: '440px', width: '100%' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>Delete this document?</div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '16px' }}>
              This permanently deletes <strong>&ldquo;{deletingDoc.title}&rdquo;</strong> and its permanent link. This can&rsquo;t be undone from here.
              Type <strong>DELETE</strong> below to confirm.
            </div>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '16px' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setDeletingDoc(null); setDeleteConfirmText('') }}
                style={{ padding: '10px 16px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleteConfirmText !== 'DELETE' || deleting}
                style={{ padding: '10px 16px', borderRadius: '9px', border: 'none', background: 'var(--red)', color: 'var(--red-light)', opacity: deleteConfirmText !== 'DELETE' || deleting ? 0.5 : 1, fontSize: '13px', fontWeight: 800, cursor: deleteConfirmText !== 'DELETE' || deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
