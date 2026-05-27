'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

/* ── shared styles ── */
const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #DDE8EE',
  borderRadius: '14px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const dropZone = (active: boolean): React.CSSProperties => ({
  border: `1px dashed ${active ? '#00A5A3' : '#DDE8EE'}`,
  background: active ? 'rgba(0,165,163,0.05)' : '#FAFBFC',
  borderRadius: '10px',
  padding: '32px 24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'all 0.15s',
})

const btn = (disabled: boolean): React.CSSProperties => ({
  padding: '11px 20px',
  borderRadius: '9px',
  background: disabled ? '#F3F4F6' : '#00A5A3',
  color: disabled ? '#9CA3AF' : '#FFFFFF',
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '14px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  width: '100%',
  marginTop: 'auto',
})

const STEPS = [
  { label: 'Lead Extraction', href: '/data/extract/file', active: true },
  { label: 'LinkedIn Targeting', href: '/data/extract/detail', active: false },
  { label: 'Data Enrichment', href: '/data/enrichment', active: false },
  { label: 'Email Guesser', href: '/data/email-guesser', active: false },
]

export default function LeadExtractionPage() {
  /* ── File Extractor state ── */
  const [file1, setFile1]         = useState<File | null>(null)
  const [drag1, setDrag1]         = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [fileRes, setFileRes]     = useState<any[]>([])
  const fileRef1                  = useRef<HTMLInputElement>(null)

  /* ── URL Extractor state ── */
  const [urlText, setUrlText]       = useState('')
  const [extracting, setExtracting] = useState(false)
  const [urlRes, setUrlRes]         = useState<any[]>([])
  const [urlSetup, setUrlSetup]     = useState(false)

  /* ── Website Finder — Company Names state ── */
  const [file2, setFile2]         = useState<File | null>(null)
  const [drag2, setDrag2]         = useState(false)
  const [finding, setFinding]     = useState(false)
  const [findRes, setFindRes]     = useState<any[]>([])
  const fileRef2                  = useRef<HTMLInputElement>(null)

  /* ── Website Finder — Directory URLs state ── */
  const [dirText, setDirText]       = useState('')
  const [dirExtracting, setDirExtracting] = useState(false)
  const [dirRes, setDirRes]         = useState<any[]>([])
  const [dirSetup, setDirSetup]     = useState(false)

  /* ── handlers ── */
  const analyzeFile = async (f: File | null, setter: (v: any[]) => void, setLoading: (v: boolean) => void) => {
    if (!f) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', f)
      const res  = await fetch('/api/data/extract/file', { method: 'POST', body: form })
      const data = await res.json()
      setter(data.results ?? [])
    } finally { setLoading(false) }
  }

  const extractUrls = async (text: string, setter: (v: any[]) => void, setLoading: (v: boolean) => void, setSetup: (v: boolean) => void) => {
    const urls = text.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setLoading(true)
    setSetup(false)
    try {
      const res  = await fetch('/api/data/extract/url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      const data = await res.json()
      if (data.setup_required) { setSetup(true); return }
      setter(data.results ?? [])
    } finally { setLoading(false) }
  }

  const allResults = [...fileRes, ...urlRes, ...findRes, ...dirRes]

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>

      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '16px 28px' }}>
        {/* Flow breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => (
            <div key={s.href} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Link href={s.href} style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: s.active ? 700 : 500,
                background: s.active ? '#00A5A3' : 'transparent',
                color: s.active ? '#FFFFFF' : '#9CA3AF',
                textDecoration: 'none', border: s.active ? 'none' : '1px solid #DDE8EE',
              }}>
                {s.label}
              </Link>
              {i < STEPS.length - 1 && (
                <svg width="14" height="14" fill="none" stroke="#DDE8EE" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F1923', marginBottom: '4px' }}>Lead Extraction</div>
        <div style={{ fontSize: '15px', color: '#6B7280' }}>Extract company names and website URLs from multiple sources</div>
      </div>

      {/* 2×2 grid */}
      <div style={{ padding: '24px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', maxWidth: '1100px' }}>

        {/* Card 1 — Company & URL Finder - Files */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(0,165,163,0.08)', border: '1px solid rgba(0,165,163,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Company & URL Finder — Files</div>
              <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>PDF, Image, Excel, Word files</div>
            </div>
          </div>

          <input ref={fileRef1} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => setFile1(e.target.files?.[0] ?? null)} />

          <div
            style={dropZone(drag1)}
            onDragOver={e => { e.preventDefault(); setDrag1(true) }}
            onDragLeave={() => setDrag1(false)}
            onDrop={e => { e.preventDefault(); setDrag1(false); setFile1(e.dataTransfer.files[0] ?? null) }}
            onClick={() => fileRef1.current?.click()}
          >
            <svg width="28" height="28" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '10px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {file1 ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F1923' }}>{file1.name}</div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '3px' }}>Click to change</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '14px', color: '#0F1923', fontWeight: 500 }}>Drop file here</div>
                <div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '3px' }}>or click to browse</div>
              </div>
            )}
          </div>

          <button onClick={() => analyzeFile(file1, setFileRes, setAnalyzing)} disabled={!file1 || analyzing} style={btn(!file1 || analyzing)}>
            {analyzing ? 'Analyzing…' : 'Analyze File →'}
          </button>
          {fileRes.length > 0 && <div style={{ fontSize: '13px', color: '#059669', fontWeight: 600 }}>{fileRes.length} records extracted</div>}
        </div>

        {/* Card 2 — URL Extractor */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(0,165,163,0.08)', border: '1px solid rgba(0,165,163,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>URL Extractor</div>
              <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>Extract from web pages</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>Paste URLs (one per line):</div>
            <textarea
              value={urlText}
              onChange={e => setUrlText(e.target.value)}
              placeholder={'https://event.com/sponsors\nhttps://conference.io/exhibitors'}
              rows={7}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '10px',
                border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923',
                background: '#FAFBFC', resize: 'vertical', outline: 'none',
                fontFamily: 'system-ui', lineHeight: 1.6, boxSizing: 'border-box',
              }}
            />
          </div>

          {urlSetup && (
            <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '9px', fontSize: '13px', color: '#92400E' }}>
              Add <code style={{ background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: '4px' }}>FIRECRAWL_API_KEY</code> to .env.local to enable URL scraping.
            </div>
          )}

          <button onClick={() => extractUrls(urlText, setUrlRes, setExtracting, setUrlSetup)} disabled={!urlText.trim() || extracting} style={btn(!urlText.trim() || extracting)}>
            {extracting ? 'Extracting…' : 'Extract Companies →'}
          </button>
          {urlRes.length > 0 && <div style={{ fontSize: '13px', color: '#059669', fontWeight: 600 }}>{urlRes.length} companies extracted</div>}
        </div>

        {/* Card 3 — Website Finder from Company Names */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(0,165,163,0.08)', border: '1px solid rgba(0,165,163,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Website Finder — From Company Names</div>
              <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>Finds Company URLs of submitted company names using online/AI search</div>
            </div>
          </div>

          <input ref={fileRef2} type="file" accept=".xlsx,.xls,.csv,.txt,.docx,.doc" style={{ display: 'none' }} onChange={e => setFile2(e.target.files?.[0] ?? null)} />

          <div
            style={{ ...dropZone(drag2), padding: '24px' }}
            onDragOver={e => { e.preventDefault(); setDrag2(true) }}
            onDragLeave={() => setDrag2(false)}
            onDrop={e => { e.preventDefault(); setDrag2(false); setFile2(e.dataTransfer.files[0] ?? null) }}
            onClick={() => fileRef2.current?.click()}
          >
            <svg width="22" height="22" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '8px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ fontSize: '14px', color: '#0F1923', fontWeight: 500 }}>
              {file2 ? file2.name : <>Drop file or <span style={{ color: '#00A5A3', fontWeight: 600 }}>browse</span></>}
            </span>
            <span style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>Excel, CSV, or Word</span>
          </div>

          <div style={{ fontSize: '13px', color: '#9CA3AF' }}>Supports company lists with optional Country column for better accuracy</div>

          <button onClick={() => analyzeFile(file2, setFindRes, setFinding)} disabled={!file2 || finding} style={btn(!file2 || finding)}>
            {finding ? 'Finding…' : 'Analyze File →'}
          </button>
          {findRes.length > 0 && <div style={{ fontSize: '13px', color: '#059669', fontWeight: 600 }}>{findRes.length} websites found</div>}
        </div>

        {/* Card 4 — Website Finder from Directory URLs */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(0,165,163,0.08)', border: '1px solid rgba(0,165,163,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Website Finder — From Directory URLs</div>
              <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>Finds Company URLs from company details pages of directories / Exhibitor lists</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F1923', marginBottom: '4px' }}>Upload Excel with URLs</div>
            <div style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '12px' }}>Company detail page links</div>
            <div
              style={{ ...dropZone(false), padding: '24px', cursor: 'default' }}
            >
              <svg width="22" height="22" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '8px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span style={{ fontSize: '14px', color: '#0F1923', fontWeight: 500 }}>Upload Excel with URLs</span>
              <span style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>Company detail page links</span>
            </div>
          </div>

          {dirSetup && (
            <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '9px', fontSize: '13px', color: '#92400E' }}>
              Add <code style={{ background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: '4px' }}>FIRECRAWL_API_KEY</code> to enable directory scraping.
            </div>
          )}

          <button onClick={() => extractUrls(dirText, setDirRes, setDirExtracting, setDirSetup)} disabled={!dirText.trim() || dirExtracting} style={btn(!dirText.trim() || dirExtracting)}>
            {dirExtracting ? 'Extracting…' : 'Extract from Pages →'}
          </button>
          {dirRes.length > 0 && <div style={{ fontSize: '13px', color: '#059669', fontWeight: 600 }}>{dirRes.length} companies extracted</div>}
        </div>
      </div>

      {/* Combined results */}
      {allResults.length > 0 && (
        <div style={{ padding: '0 28px 32px', maxWidth: '1100px' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #DDE8EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Extraction Results</span>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>{allResults.length} records</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '10px 20px', background: '#F8FAFB', borderBottom: '1px solid #DDE8EE' }}>
              {['Company', 'Website'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
              ))}
            </div>
            {allResults.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '11px 20px', borderBottom: i < allResults.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ fontSize: '14px', color: '#0F1923', fontWeight: 500 }}>{r.name || '—'}</div>
                <div style={{ fontSize: '14px', color: '#00A5A3' }}>{r.website || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
