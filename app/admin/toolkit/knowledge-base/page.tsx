'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { kbDownloadHref } from '@/app/lib/kb/download-href'

interface DocRow {
  id: string
  title: string
  type: string
  word_count: number
  layer: string
  department: string
  min_level: string
  pilot_use: boolean
  ai_reasoning: string | null
  source_url: string | null
  extracted_text: string
  created_at: string
}

const TYPE_COLOR: Record<string, string> = {
  policy: '#8B1A1A', event_brief: '#00897B', staff_doc: '#3D6B00', onboarding: '#A78BFA',
  event_report: '#60A5FA', proposal: '#F59E0B', tender: '#F59E0B', corporate_profile: '#00695C',
  external_intel: '#6366F1', service_portfolio: '#0E7490', other: '#0F1923',
}

function typeLabel(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function DocumentReader({ doc, staffId, onClose }: { doc: DocRow; staffId: string; onClose: () => void }) {
  const downloadHref = kbDownloadHref(doc.source_url, doc.id, staffId)
  function renderLine(line: string, i: number) {
    if (!line.trim()) return <div key={i} style={{ height: '10px' }} />
    if (line.startsWith('---')) return null
    if (/^#{1,3}\s/.test(line)) {
      return (
        <div key={i} style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', marginTop: '18px', marginBottom: '6px' }}>
          {line.replace(/^#{1,3}\s/, '')}
        </div>
      )
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const parts = line.slice(2).split(/(\*\*[^*]+\*\*)/g)
      return (
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#00897B', marginTop: '9px', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.7 }}>
            {parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j} style={{ color: '#0F1923' }}>{p.slice(2, -2)}</strong> : p)}
          </span>
        </div>
      )
    }
    return <p key={i} style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.7, margin: '0 0 4px' }}>{line}</p>
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '24px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', width: '720px', maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #DDE8EE' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: `${TYPE_COLOR[doc.type] ?? '#0F1923'}18`, color: TYPE_COLOR[doc.type] ?? '#0F1923' }}>
              {typeLabel(doc.type)}
            </span>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F1923', marginTop: '8px' }}>{doc.title}</div>
          </div>
          <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FFFFFF', border: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="14" height="14" fill="none" stroke="#2A3038" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
          {doc.extracted_text.split('\n').map(renderLine)}
        </div>
        {downloadHref && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid #DDE8EE' }}>
            <a href={downloadHref} target="_blank" rel="noopener noreferrer" className="tbtn tbtn-teal" style={{ display: 'inline-flex' }}>
              Download Original
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function KnowledgeContent() {
  const params    = useSearchParams()
  const urlStaffId = params.get('id') ?? ''
  const [staffId, setStaffId] = useState(urlStaffId)

  const [docs,       setDocs]       = useState<DocRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [readDoc,    setReadDoc]    = useState<DocRow | null>(null)
  const [kbTier,     setKbTier]     = useState<'none' | 'user' | 'admin'>('none')

  // Falls back to the session cookie when no ?id= is in the URL — covers
  // landing here from a nav link (breadcrumb, module switcher) rather than
  // a staff-specific dashboard link.
  useEffect(() => {
    if (urlStaffId) return
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(s => { if (s?.sid && s.sid !== 'super-admin') setStaffId(s.sid) })
      .catch(() => {})
  }, [urlStaffId])

  useEffect(() => {
    if (!staffId) return
    fetch(`/api/documents/list?staff_id=${staffId}`)
      .then(r => r.json())
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [staffId])

  useEffect(() => {
    fetch('/api/kb/access/me').then(r => r.json()).then(d => setKbTier(d.tier ?? 'none')).catch(() => {})
  }, [])

  const types = useMemo(() => Array.from(new Set(docs.map(d => d.type))).sort(), [docs])

  const filtered = docs.filter(d => {
    if (typeFilter !== 'all' && d.type !== typeFilter) return false
    if (search.trim() && !d.title.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', color: '#0F1923' }}>
      <PageHeader
        eyebrow="Knowledge Base"
        title="Documents"
        description="Browse company policies, past event reports, and reference material — only what you have access to."
        actions={
          <Link href="/admin/toolkit/knowledge-assistant" style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid rgba(0,165,163,0.35)', background: 'rgba(0,165,163,0.08)', color: '#00695C', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
            Knowledge Assistant
          </Link>
        }
      />

      <div style={{ maxWidth: '1020px', margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title…"
            style={{ padding: '9px 14px', borderRadius: '16px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', minWidth: '220px', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => setTypeFilter('all')} style={{ padding: '7px 14px', borderRadius: '16px', border: `1px solid ${typeFilter === 'all' ? '#00897B' : '#DDE8EE'}`, background: typeFilter === 'all' ? '#00A5A315' : '#FFFFFF', color: typeFilter === 'all' ? '#00897B' : '#2D3E50', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              All ({docs.length})
            </button>
            {types.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '7px 14px', borderRadius: '16px', border: `1px solid ${typeFilter === t ? TYPE_COLOR[t] ?? '#00897B' : '#DDE8EE'}`, background: typeFilter === t ? `${TYPE_COLOR[t] ?? '#00897B'}15` : '#FFFFFF', color: typeFilter === t ? TYPE_COLOR[t] ?? '#00897B' : '#2D3E50', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {typeLabel(t)} ({docs.filter(d => d.type === t).length})
              </button>
            ))}
          </div>
          <div style={{ fontSize: '13px', color: '#2D3E50', marginLeft: 'auto' }}>
            {filtered.length} document{filtered.length !== 1 ? 's' : ''} shown
          </div>
        </div>

        {/* Grid */}
        {!staffId ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#2D3E50', fontSize: '13px' }}>
            Please sign in to view the Knowledge Base.
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #DDE8EE', borderTopColor: '#00897B', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
            <div style={{ color: '#0F1923', fontSize: '13px' }}>Loading Knowledge Base…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#2D3E50', fontSize: '13px' }}>
            {docs.length === 0 ? 'No documents are available to you yet.' : 'No documents match the current filters.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {filtered.map(doc => (
              <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: `${TYPE_COLOR[doc.type] ?? '#0F1923'}18`, color: TYPE_COLOR[doc.type] ?? '#0F1923' }}>
                    {typeLabel(doc.type)}
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '14px', lineHeight: 1.4, flex: 1 }}>{doc.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #DDE8EE', paddingTop: '12px' }}>
                  <span style={{ fontSize: '13px', color: '#2D3E50' }}>
                    {doc.word_count?.toLocaleString()} words · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {kbDownloadHref(doc.source_url, doc.id, staffId) && (
                      <a href={kbDownloadHref(doc.source_url, doc.id, staffId)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 700, color: '#00897B', textDecoration: 'none' }}>
                        Download
                      </a>
                    )}
                    <button onClick={() => setReadDoc(doc)} style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Read →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {readDoc && <DocumentReader doc={readDoc} staffId={staffId} onClose={() => setReadDoc(null)} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function KnowledgePage() {
  return (
    <Suspense>
      <KnowledgeContent />
    </Suspense>
  )
}
