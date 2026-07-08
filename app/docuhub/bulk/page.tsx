'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import NavBar, { MOD_DOCUHUB } from '@/app/components/NavBar'

type DocType = {
  id: string; key: string; label: string; slug_prefix: string
  requires_event_attribution: boolean; supports_expiry: boolean
  default_visibility: string; allowed_formats: string[]
}
type Row = {
  file: File; title: string; doc_type_id: string
  object_key: string | null; uploading: boolean; uploadError: string | null
  visibility: string; event_label: string; event_date: string; event_venue: string
  link_expires_at: string
}

export default function DocuHubBulkPage() {
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [publishing, setPublishing] = useState(false)
  const [resultMsg, setResultMsg] = useState('')

  useEffect(() => {
    fetch('/api/docuhub/doc-types').then(r => r.json()).then(d => setDocTypes(Array.isArray(d) ? d : []))
  }, [])

  async function addFiles(files: FileList | null) {
    if (!files) return
    const newRows: Row[] = Array.from(files).map(file => ({
      file, title: file.name.replace(/\.[^.]+$/, ''), doc_type_id: '',
      object_key: null, uploading: true, uploadError: null,
      visibility: 'internal', event_label: '', event_date: '', event_venue: '', link_expires_at: '',
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
        event_date: type?.requires_event_attribution ? r.event_date : undefined,
        event_venue: type?.requires_event_attribution ? r.event_venue : undefined,
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <input value={row.event_label} onChange={e => updateRow(i, { event_label: e.target.value })} placeholder="Event name"
                        style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                      <input type="date" value={row.event_date} onChange={e => updateRow(i, { event_date: e.target.value })}
                        style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                      <input value={row.event_venue} onChange={e => updateRow(i, { event_venue: e.target.value })} placeholder="Venue"
                        style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
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
