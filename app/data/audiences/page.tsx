'use client'

import { useState, useEffect } from 'react'

interface Audience {
  id:             string
  name:           string
  description?:   string | null
  results_count:  number
  last_run_at?:   string | null
  created_at:     string
  updated_at:     string
  final_icp_json: Record<string, unknown>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AudiencesPage() {
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState<string | null>(null)

  // Import modal state
  const [showImport, setShowImport] = useState(false)
  const [importName, setImportName] = useState('')
  const [importDesc, setImportDesc] = useState('')
  const [importJson, setImportJson] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saveErr,    setSaveErr]    = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await fetch('/api/data/audiences').then(r => r.json()).catch(() => [])
    setAudiences(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function remove(id: string) {
    setDeleting(id)
    await fetch(`/api/data/audiences?id=${id}`, { method: 'DELETE' })
    setAudiences(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
  }

  async function save() {
    if (!importName.trim() || !importJson.trim()) return
    setSaving(true)
    setSaveErr('')
    let json: unknown
    try { json = JSON.parse(importJson) } catch { setSaveErr('Invalid JSON.'); setSaving(false); return }
    const res  = await fetch('/api/data/audiences', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: importName, description: importDesc, final_icp_json: json }),
    })
    const data = await res.json()
    if (data.error) { setSaveErr(data.error); setSaving(false); return }
    setAudiences(prev => [data, ...prev])
    setShowImport(false)
    setImportName('')
    setImportDesc('')
    setImportJson('')
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Saved Audiences</span>
        <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Reusable ICP definitions for lead searches</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowImport(true)}
          style={{ padding: '7px 16px', borderRadius: '9px', border: 'none', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Audience
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: '900px' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px', color: 'var(--ink3)', fontSize: '15px' }}>Loading audiences…</div>
        ) : audiences.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '8px' }}>No saved audiences yet</div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '20px' }}>
              Save an ICP from the Lead Finder, or paste an ICP JSON to create an audience.
            </div>
            <button onClick={() => setShowImport(true)} style={{ padding: '8px 20px', borderRadius: '9px', background: 'var(--teal-mid)', color: 'var(--teal-light)', border: 'none', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              Create First Audience
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {audiences.map(a => {
              const icp = a.final_icp_json ?? {}
              const summary = (icp as any).summary_message
              const titles  = ((icp as any).person_titles ?? []).slice(0, 3).join(', ')
              const locs    = ((icp as any).organization_locations ?? []).slice(0, 2).join(', ')
              const isOpen  = expanded === a.id
              return (
                <div key={a.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                  {/* Card header */}
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '3px' }}>{a.name}</div>
                      {a.description && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '4px' }}>{a.description}</div>}
                      {summary && <div style={{ fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.5 }}>{summary}</div>}
                      {(titles || locs) && (
                        <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {titles && <span style={{ fontSize: '11px', color: 'var(--teal-mid)', background: 'var(--teal-light)', padding: '1px 8px', borderRadius: '6px' }}>{titles}</span>}
                          {locs   && <span style={{ fontSize: '11px', color: 'var(--ink3)', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', padding: '1px 8px', borderRadius: '6px' }}>{locs}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>Created {formatDate(a.created_at)}</div>
                      {a.results_count > 0 && (
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--teal-mid)' }}>{a.results_count.toLocaleString()} contacts</div>
                      )}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setExpanded(isOpen ? null : a.id)}
                          style={{ padding: '4px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '11px', color: 'var(--ink2)', cursor: 'pointer', fontWeight: 600 }}
                        >
                          {isOpen ? 'Hide ICP' : 'View ICP'}
                        </button>
                        <button
                          onClick={() => remove(a.id)}
                          disabled={deleting === a.id}
                          style={{ padding: '4px 10px', borderRadius: '7px', border: '1px solid var(--red-border)', background: 'var(--red-light)', fontSize: '11px', color: 'var(--red)', cursor: 'pointer', fontWeight: 600 }}
                        >
                          {deleting === a.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ICP JSON expand */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--surface)' }}>
                      <pre style={{ margin: 0, fontSize: '11px', color: 'var(--ink2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                        {JSON.stringify(a.final_icp_json, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New Audience modal */}
      {showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: 'var(--card)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '560px', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '20px' }}>New Saved Audience</div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1.5px', display: 'block', marginBottom: '6px' }}>Audience Name *</label>
              <input value={importName} onChange={e => setImportName(e.target.value)} placeholder="e.g. CISOs in UAE FinTech" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '14px', color: 'var(--ink)', background: 'var(--surface)', boxSizing: 'border-box', outline: 'none' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1.5px', display: 'block', marginBottom: '6px' }}>Description</label>
              <input value={importDesc} onChange={e => setImportDesc(e.target.value)} placeholder="Optional note about this audience" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '14px', color: 'var(--ink)', background: 'var(--surface)', boxSizing: 'border-box', outline: 'none' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1.5px', display: 'block', marginBottom: '6px' }}>ICP JSON *</label>
              <textarea
                value={importJson}
                onChange={e => setImportJson(e.target.value)}
                placeholder={'{\n  "person_titles": ["CTO", "VP Engineering"],\n  "organization_locations": ["Dubai, UAE"],\n  ...\n}'}
                rows={8}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '9px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--ink)', background: 'var(--surface)', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }}
              />
            </div>

            {saveErr && <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--red)', background: 'var(--red-light)', border: '1px solid var(--red-border)', padding: '8px 12px', borderRadius: '8px' }}>{saveErr}</div>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowImport(false); setSaveErr('') }} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '13px', color: 'var(--ink2)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={save} disabled={saving || !importName.trim() || !importJson.trim()} style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: saving ? 'rgba(18,201,189,0.3)' : 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save Audience'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
