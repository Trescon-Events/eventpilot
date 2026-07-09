'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import NavBar, { MOD_DOCUHUB } from '@/app/components/NavBar'
import LocationSelect from '@/app/components/LocationSelect'
import { KNOWN_CITIES, COUNTRIES } from '@/app/lib/docuhub/locations'

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
type Row = {
  file: File; title: string; doc_type_id: string
  object_key: string | null; uploading: boolean; uploadError: string | null
  visibility: string; event_label: string; event_type: string
  event_start_date: string; event_end_date: string
  event_city: string; event_country: string; event_venue: string; series: string
  event_format: string; event_region: string
  client_name: string; owner_staff_id: string
  link_expires_at: string
}

export default function DocuHubBulkPage() {
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [publishing, setPublishing] = useState(false)
  const [resultMsg, setResultMsg] = useState('')

  useEffect(() => {
    fetch('/api/docuhub/doc-types').then(r => r.json()).then(d => setDocTypes(Array.isArray(d) ? d : []))
    fetch('/api/staff-list').then(r => r.json()).then(d => setStaffOptions(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  async function addFiles(files: FileList | null) {
    if (!files) return
    const newRows: Row[] = Array.from(files).map(file => ({
      file, title: file.name.replace(/\.[^.]+$/, ''), doc_type_id: '',
      object_key: null, uploading: true, uploadError: null,
      visibility: 'internal', event_label: '', event_type: '',
      event_start_date: '', event_end_date: '', event_city: '', event_country: '', event_venue: '', series: '',
      event_format: '', event_region: '', client_name: '', owner_staff_id: '',
      link_expires_at: '',
    }))
    setRows(p => [...p, ...newRows])

    newRows.forEach(async (row) => {
      const form = new FormData()
      form.append('file', row.file)
      try {
        const res = await fetch('/api/docuhub/upload', { method: 'POST', body: form })
        const data = await res.json()
        setRows(p => p.map(r => r.file === row.file ? { ...r, uploading: false, object_key: res.ok ? data.object_key : null, uploadError: res.ok ? null : data.error } : r))
      } catch {
        setRows(p => p.map(r => r.file === row.file ? { ...r, uploading: false, uploadError: 'Upload failed' } : r))
      }
    })
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows(p => p.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function removeRow(idx: number) {
    setRows(p => p.filter((_, i) => i !== idx))
  }

  async function publishAll() {
    setPublishing(true); setResultMsg('')
    const payload = rows.map(r => {
      const type = docTypes.find(t => t.id === r.doc_type_id)
      return {
        doc_type_id: r.doc_type_id, title: r.title, object_key: r.object_key,
        visibility: r.visibility,
        event_label: type?.requires_event_attribution ? r.event_label : undefined,
        event_type: (type?.requires_event_attribution || type?.requires_client_attribution) ? r.event_type : undefined,
        event_start_date: type?.requires_event_attribution ? r.event_start_date : undefined,
        event_end_date: type?.requires_event_attribution ? r.event_end_date : undefined,
        event_city: type?.requires_event_attribution ? r.event_city : undefined,
        event_country: type?.requires_event_attribution ? r.event_country : undefined,
        event_venue: type?.requires_event_attribution ? r.event_venue : undefined,
        series: type?.requires_event_attribution ? r.series : undefined,
        event_format: type?.requires_event_attribution ? r.event_format : undefined,
        event_region: type?.requires_event_attribution ? r.event_region : undefined,
        client_name: type?.requires_client_attribution ? r.client_name : undefined,
        owner_staff_id: type?.requires_client_attribution ? r.owner_staff_id : undefined,
        link_expires_at: type?.supports_expiry && r.link_expires_at ? new Date(r.link_expires_at).toISOString() : undefined,
      }
    })
    const res = await fetch('/api/docuhub/documents/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: payload }),
    })
    const data = await res.json()
    if (!res.ok) { setResultMsg(data.error ?? 'Bulk publish failed.'); setPublishing(false); return }
    setResultMsg(`Published ${data.succeeded} of ${rows.length}.${data.failed ? ` ${data.failed} row(s) failed — check details below.` : ''}`)
    if (data.failed) {
      // Keep only the rows that failed (with their error shown) so they can be fixed and retried;
      // drop the ones that published successfully.
      setRows(p => p
        .map((r, i) => {
          const result = data.results.find((x: { index: number; success: boolean }) => x.index === i)
          return result && !result.success ? { ...r, uploadError: result.error } : null
        })
        .filter((r): r is Row => r !== null))
    } else {
      setRows([])
    }
    setPublishing(false)
  }

  const allReady = rows.length > 0 && rows.every(r => r.object_key && r.title.trim() && r.doc_type_id)

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <NavBar module={MOD_DOCUHUB} homeHref="/docuhub" subtitle="Bulk Upload" rightSlot={
        <Link href="/docuhub" style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>Back</Link>
      } />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', margin: '0 0 8px' }}>Bulk Upload</h1>
        <p style={{ fontSize: '13px', color: '#5B7080', margin: '0 0 20px' }}>Select multiple files, fix up the details inline, then publish them all at once.</p>

        <label style={{ display: 'block', padding: '24px', border: '1.5px dashed #DDE8EE', borderRadius: '12px', textAlign: 'center', cursor: 'pointer', marginBottom: '20px', background: '#FFFFFF' }}>
          <input type="file" multiple style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
          <span style={{ fontSize: '13px', color: '#5B7080' }}>Click to select files, or add more anytime</span>
        </label>

        {resultMsg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', color: '#B45309', marginBottom: '16px' }}>{resultMsg}</div>}

        {rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {rows.map((row, i) => {
              const type = docTypes.find(t => t.id === row.doc_type_id)
              return (
                <div key={i} style={{ background: '#FFFFFF', border: `1px solid ${row.uploadError ? 'rgba(255,107,107,0.4)' : '#DDE8EE'}`, borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <input value={row.title} onChange={e => updateRow(i, { title: e.target.value })} placeholder="Title"
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                    <select value={row.doc_type_id} onChange={e => updateRow(i, { doc_type_id: e.target.value })}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                      <option value="">Select type…</option>
                      {docTypes.filter(t => t.allowed_formats.includes('file')).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <select value={row.visibility} onChange={e => updateRow(i, { visibility: e.target.value })}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                      <option value="internal">Internal</option>
                      <option value="public">Public</option>
                    </select>
                    <button onClick={() => removeRow(i)} style={{ fontSize: '13px', fontWeight: 700, color: '#FF6B6B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                  </div>
                  {type?.requires_event_attribution && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <input value={row.event_label} onChange={e => updateRow(i, { event_label: e.target.value })} placeholder="Event name"
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                        <select value={row.event_type} onChange={e => updateRow(i, { event_type: e.target.value })}
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="">Event type…</option>
                          {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <input type="date" value={row.event_start_date} onChange={e => updateRow(i, { event_start_date: e.target.value })}
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                        <input type="date" value={row.event_end_date} onChange={e => updateRow(i, { event_end_date: e.target.value })}
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <LocationSelect value={row.event_city} onChange={v => updateRow(i, { event_city: v })} options={KNOWN_CITIES.map(c => c.city)} placeholder="City" />
                        <LocationSelect value={row.event_country} onChange={v => updateRow(i, { event_country: v })} options={COUNTRIES} placeholder="Country" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <input value={row.event_venue} onChange={e => updateRow(i, { event_venue: e.target.value })} placeholder="Venue (optional)"
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                        <input value={row.series} onChange={e => updateRow(i, { series: e.target.value })} placeholder="Series (only if multi-edition)"
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <select value={row.event_format} onChange={e => updateRow(i, { event_format: e.target.value })}
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="">Format…</option>
                          {EVENT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        <input value={row.event_region} onChange={e => updateRow(i, { event_region: e.target.value })} placeholder="Region (e.g. ASEAN)"
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                    </div>
                  )}
                  {type?.requires_client_attribution && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <input value={row.client_name} onChange={e => updateRow(i, { client_name: e.target.value })} placeholder="Client (organisation name)"
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                        <select value={row.owner_staff_id} onChange={e => updateRow(i, { owner_staff_id: e.target.value })}
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="">Owner…</option>
                          {staffOptions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
                        </select>
                      </div>
                      <select value={row.event_type} onChange={e => updateRow(i, { event_type: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                        <option value="">Event type…</option>
                        {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  )}
                  {type?.supports_expiry && (
                    <input type="date" value={row.link_expires_at} onChange={e => updateRow(i, { link_expires_at: e.target.value })}
                      placeholder="Expires (optional)"
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', marginBottom: '8px' }} />
                  )}
                  <div style={{ fontSize: '13px', color: row.uploadError ? '#FF6B6B' : row.uploading ? '#5B7080' : '#3D6B00' }}>
                    {row.uploadError ? row.uploadError : row.uploading ? 'Uploading…' : `Uploaded — ${row.file.name}`}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {rows.length > 0 && (
          <button onClick={publishAll} disabled={!allReady || publishing}
            style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', background: !allReady || publishing ? '#DDE8EE' : '#D97706', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: !allReady || publishing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {publishing ? 'Publishing…' : `Publish All (${rows.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
