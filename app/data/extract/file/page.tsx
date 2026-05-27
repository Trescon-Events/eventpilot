'use client'

import { useState, useRef } from 'react'

interface ExtractResult {
  name?: string
  website?: string
  raw: string
}

const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #DDE8EE',
  borderRadius: '14px',
  padding: '24px',
  flex: 1,
}

const dropZone: React.CSSProperties = {
  border: '1px dashed #DDE8EE',
  background: 'rgba(0,165,163,0.03)',
  borderRadius: '10px',
  padding: '40px 24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
  textAlign: 'center',
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '9px',
  background: '#00A5A3',
  color: '#FFFFFF',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  justifyContent: 'center',
}

export default function FileExtractorPage() {
  const [file, setFile]         = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [fileResults, setFileResults] = useState<ExtractResult[]>([])
  const [fileError, setFileError]     = useState('')

  const [urlText, setUrlText]     = useState('')
  const [extracting, setExtracting] = useState(false)
  const [urlResults, setUrlResults] = useState<ExtractResult[]>([])
  const [urlError, setUrlError]   = useState('')
  const [setupRequired, setSetupRequired] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  const analyzeFile = async () => {
    if (!file) return
    setAnalyzing(true)
    setFileError('')
    setFileResults([])
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch('/api/data/extract/file', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) { setFileError(data.error); return }
      setFileResults(data.results ?? [])
    } catch {
      setFileError('Failed to analyze file.')
    } finally {
      setAnalyzing(false)
    }
  }

  const extractUrls = async () => {
    const urls = urlText.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setExtracting(true)
    setUrlError('')
    setUrlResults([])
    setSetupRequired(false)
    try {
      const res  = await fetch('/api/data/extract/url', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ urls }),
      })
      const data = await res.json()
      if (data.setup_required) { setSetupRequired(true); return }
      if (data.error) { setUrlError(data.error); return }
      setUrlResults(data.results ?? [])
    } catch {
      setUrlError('Request failed.')
    } finally {
      setExtracting(false)
    }
  }

  const allResults = [...fileResults, ...urlResults]

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>File Extractor</span>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Extract company names and URLs from documents</span>
      </div>

      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>

          {/* Left: File upload */}
          <div style={card}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '4px' }}>Company & URL Finder — Files</div>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>Upload PDF, Excel, Word, or images to extract company names and URLs.</div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />

            <div
              style={{
                ...dropZone,
                borderColor: dragging ? '#00A5A3' : '#DDE8EE',
                background: dragging ? 'rgba(59,130,246,0.07)' : 'rgba(0,165,163,0.03)',
              }}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="32" height="32" fill="none" stroke="#00A5A3" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '12px', opacity: 0.7 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {file ? (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{file.name}</div>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>{(file.size / 1024).toFixed(1)} KB — click to change</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '6px' }}>Drop file here or click to browse</div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF' }}>PDF · Excel · Word · Images · CSV · TXT</div>
                </div>
              )}
            </div>

            <button
              onClick={analyzeFile}
              disabled={!file || analyzing}
              style={{
                ...btnPrimary,
                marginTop: '14px',
                background: !file || analyzing ? 'rgba(0,165,163,0.2)' : '#00A5A3',
                cursor: !file || analyzing ? 'default' : 'pointer',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              {analyzing ? 'Analyzing File…' : 'Analyze File →'}
            </button>

            {fileError && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', fontSize: '13px', color: '#F87171' }}>
                {fileError}
              </div>
            )}

            {fileResults.length > 0 && (
              <div style={{ marginTop: '14px', fontSize: '12px', color: '#34D399', fontWeight: 600 }}>
                {fileResults.length} records extracted from file
              </div>
            )}
          </div>

          {/* Right: URL Extractor */}
          <div style={card}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '4px' }}>URL Extractor</div>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>Paste event or directory URLs to scrape and extract company names.</div>
            </div>

            <textarea
              value={urlText}
              onChange={e => setUrlText(e.target.value)}
              placeholder={'https://event.com/sponsors\nhttps://conference.io/exhibitors\nhttps://summit.co/partners'}
              rows={8}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '10px',
                border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923',
                background: '#F8FAFB', resize: 'vertical', outline: 'none',
                fontFamily: 'monospace', lineHeight: 1.6, boxSizing: 'border-box',
              }}
            />

            <button
              onClick={extractUrls}
              disabled={!urlText.trim() || extracting}
              style={{
                ...btnPrimary,
                marginTop: '12px',
                background: !urlText.trim() || extracting ? 'rgba(0,165,163,0.2)' : '#00A5A3',
                cursor: !urlText.trim() || extracting ? 'default' : 'pointer',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              {extracting ? 'Extracting…' : 'Extract Companies →'}
            </button>

            {setupRequired && (
              <div style={{ marginTop: '12px', padding: '12px 16px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#FBBF24', marginBottom: '4px' }}>Firecrawl API Not Connected</div>
                <div style={{ fontSize: '13px', color: '#6B7280' }}>Add <code style={{ background: 'rgba(251,191,36,0.1)', padding: '1px 5px', borderRadius: '4px', color: '#FBBF24' }}>FIRECRAWL_API_KEY</code> to your <code style={{ background: 'rgba(251,191,36,0.1)', padding: '1px 5px', borderRadius: '4px', color: '#FBBF24' }}>.env.local</code> to enable URL scraping.</div>
              </div>
            )}

            {urlError && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', fontSize: '13px', color: '#F87171' }}>
                {urlError}
              </div>
            )}

            {urlResults.length > 0 && (
              <div style={{ marginTop: '14px', fontSize: '12px', color: '#34D399', fontWeight: 600 }}>
                {urlResults.length} companies extracted from URLs
              </div>
            )}
          </div>
        </div>

        {/* Combined results table */}
        {allResults.length > 0 && (
          <div style={{ marginTop: '24px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #DDE8EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>Extraction Results</span>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>{allResults.length} records</span>
            </div>

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', padding: '10px 20px', background: '#FFFFFF', borderBottom: '1px solid #DDE8EE' }}>
              {['Company', 'Website', 'Source'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
              ))}
            </div>

            {allResults.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', padding: '11px 20px', borderBottom: i < allResults.length - 1 ? '1px solid #DDE8EE' : 'none' }}>
                <div style={{ fontSize: '13px', color: '#0F1923', fontWeight: 500 }}>{r.name || '—'}</div>
                <div style={{ fontSize: '13px', color: '#00A5A3' }}>{r.website || '—'}</div>
                <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{r.raw ? r.raw.slice(0, 40) : '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
