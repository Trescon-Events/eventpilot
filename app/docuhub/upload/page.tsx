'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NavBar, { MOD_DOCUHUB } from '@/app/components/NavBar'

type DocType = {
  id: string; key: string; label: string; slug_prefix: string
  requires_event_attribution: boolean; supports_expiry: boolean
  default_visibility: string; allowed_formats: string[]
}
type EventOption = { id: string; name: string; event_date: string | null; venue: string | null; city: string | null }

const DOCUHUB_DOMAIN = 'docuhub.tresconglobal.com'

export default function DocuHubUploadPage() {
  const router = useRouter()
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [selectedType, setSelectedType] = useState<DocType | null>(null)
  const [format, setFormat] = useState<'file' | 'link'>('file')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [externalUrl, setExternalUrl] = useState('')
  const [visibility, setVisibility] = useState('internal')
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState('')
  const [eventLabel, setEventLabel] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventVenue, setEventVenue] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [resultLink, setResultLink] = useState<{ prefix: string; slug: string } | null>(null)

  useEffect(() => {
    fetch('/api/docuhub/doc-types').then(r => r.json()).then(d => setDocTypes(Array.isArray(d) ? d : []))
    fetch('/api/events').then(r => r.json()).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  function pickType(t: DocType) {
    setSelectedType(t)
    setFormat(t.allowed_formats.includes('file') ? 'file' : 'link')
    setVisibility(t.default_visibility)
    setMsg('')
  }

  function pickEvent(id: string) {
    setEventId(id)
    const ev = events.find(e => e.id === id)
    if (ev) {
      setEventLabel(ev.name)
      setEventDate(ev.event_date ?? '')
      setEventVenue(ev.venue ?? ev.city ?? '')
    }
  }

  async function submit() {
    if (!selectedType) return
    if (!title.trim()) { setMsg('Title is required.'); return }
    if (format === 'file' && !file) { setMsg('Please choose a file.'); return }
    if (format === 'link' && !externalUrl.trim()) { setMsg('Please paste a link.'); return }
    if (selectedType.requires_event_attribution && !eventLabel.trim()) { setMsg('Event name is required for this document type.'); return }

    setUploading(true); setMsg('')
    try {
      let objectKey: string | undefined
      if (format === 'file' && file) {
        const form = new FormData()
        form.append('file', file)
        const upRes = await fetch('/api/docuhub/upload', { method: 'POST', body: form })
        const upData = await upRes.json()
        if (!upRes.ok) { setMsg(upData.error ?? 'Upload failed.'); setUploading(false); return }
        objectKey = upData.object_key
      }

      const res = await fetch('/api/docuhub/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type_id: selectedType.id, title, format,
          object_key: objectKey, external_url: format === 'link' ? externalUrl : undefined,
          visibility,
          event_id: eventId || undefined, event_label: eventLabel || undefined,
          event_date: eventDate || undefined, event_venue: eventVenue || undefined,
          link_expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          description: description || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Could not save this document.'); setUploading(false); return }
      setResultLink({ prefix: data.document.doc_types.slug_prefix, slug: data.document.slug })
    } catch {
      setMsg('Could not reach the server.')
    }
    setUploading(false)
  }

  if (resultLink) {
    const link = `https://${DOCUHUB_DOMAIN}/${resultLink.prefix}/${resultLink.slug}`
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), sans-serif' }}>
        <NavBar module={MOD_DOCUHUB} homeHref="/docuhub" />
        <div style={{ maxWidth: '560px', margin: '80px auto', padding: '32px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #DDE8EE', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F1923', marginBottom: '10px' }}>Document published</div>
          <div style={{ fontSize: '13px', color: '#5B7080', marginBottom: '16px' }}>This is its permanent link — it stays the same even if you replace the file later.</div>
          <div style={{ padding: '12px', background: '#E8EEF4', borderRadius: '10px', fontFamily: 'monospace', fontSize: '13px', color: '#B45309', marginBottom: '20px', wordBreak: 'break-all' }}>{link}</div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => { navigator.clipboard.writeText(link) }} style={{ padding: '10px 18px', borderRadius: '9px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Copy Link</button>
            <button onClick={() => router.push('/docuhub')} style={{ padding: '10px 18px', borderRadius: '9px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Back to DocuHub</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <NavBar module={MOD_DOCUHUB} homeHref="/docuhub" subtitle="Upload" />
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', margin: '0 0 20px' }}>Upload a Document</h1>

        {!selectedType ? (
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', marginBottom: '12px' }}>What are you uploading?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {docTypes.map(t => (
                <button key={t.id} onClick={() => pickType(t)}
                  style={{ padding: '18px', borderRadius: '12px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', marginBottom: '4px' }}>{t.label}</div>
                  <div style={{ fontSize: '13px', color: '#5B7080' }}>{t.default_visibility === 'public' ? 'Usually public' : 'Internal only'}{t.supports_expiry ? ' · can expire' : ''}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{selectedType.label}</div>
              <button onClick={() => setSelectedType(null)} style={{ fontSize: '13px', color: '#5B7080', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Change type</button>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '5px' }}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Dubai FinTech Summit 2026 — Post-Event Report"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>

            {selectedType.allowed_formats.length > 1 && (
              <div style={{ marginBottom: '12px', display: 'flex', gap: '14px' }}>
                {selectedType.allowed_formats.map(f => (
                  <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F1923', cursor: 'pointer' }}>
                    <input type="radio" checked={format === f} onChange={() => setFormat(f as 'file' | 'link')} />
                    {f === 'file' ? 'File' : 'Link'}
                  </label>
                ))}
              </div>
            )}

            {format === 'file' ? (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', padding: '18px', border: `1.5px dashed ${file ? 'rgba(217,119,6,0.4)' : '#DDE8EE'}`, borderRadius: '10px', textAlign: 'center', cursor: 'pointer' }}>
                  <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
                  {file ? <span style={{ fontSize: '13px', fontWeight: 700, color: '#B45309' }}>{file.name}</span> : <span style={{ fontSize: '13px', color: '#5B7080' }}>Click to select a file</span>}
                </label>
              </div>
            ) : (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '5px' }}>Link</label>
                <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            )}

            {selectedType.requires_event_attribution && (
              <div style={{ marginBottom: '12px', padding: '12px', background: '#E8EEF4', borderRadius: '10px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '5px' }}>Event (if it already exists in EventPilot)</label>
                <select value={eventId} onChange={e => pickEvent(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', marginBottom: '10px' }}>
                  <option value="">Not in EventPilot / historical — type it below</option>
                  {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <input value={eventLabel} onChange={e => setEventLabel(e.target.value)} placeholder="Event name"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                  <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                  <input value={eventVenue} onChange={e => setEventVenue(e.target.value)} placeholder="Venue"
                    style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: selectedType.supports_expiry ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '5px' }}>Visibility</label>
                <select value={visibility} onChange={e => setVisibility(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit' }}>
                  <option value="public">Public</option>
                  <option value="internal">Internal (Trescon staff only)</option>
                </select>
              </div>
              {selectedType.supports_expiry && (
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '5px' }}>Link expires (optional)</label>
                  <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '5px' }}>Description (optional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            {msg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', color: '#FF6B6B', marginBottom: '12px' }}>{msg}</div>}

            <button onClick={submit} disabled={uploading}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: uploading ? '#DDE8EE' : '#D97706', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {uploading ? 'Publishing…' : 'Publish to DocuHub'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
