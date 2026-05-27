'use client'

import { useState, useRef } from 'react'

interface WebsiteResult {
  company: string
  website?: string
  confidence?: string
  source?: string
}

const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #DDE8EE',
  borderRadius: '14px',
  padding: '24px',
}

export default function WebsiteFinderPage() {
  const [activeTab, setActiveTab] = useState<'names' | 'directory'>('names')

  // Tab 1 — From company names
  const [namesFile, setNamesFile]     = useState<File | null>(null)
  const [namesDragging, setNamesDragging] = useState(false)
  const [namesRunning, setNamesRunning]   = useState(false)
  const [namesResults, setNamesResults]   = useState<WebsiteResult[]>([])
  const [namesError, setNamesError]       = useState('')
  const namesInputRef = useRef<HTMLInputElement>(null)

  // Tab 2 — From directory URLs
  const [dirUrls, setDirUrls]   = useState('')
  const [dirRunning, setDirRunning] = useState(false)
  const [dirResults, setDirResults] = useState<WebsiteResult[]>([])
  const [dirError, setDirError]   = useState('')
  const [setupRequired, setSetupRequired] = useState(false)

  const handleNamesFile = (f: File) => setNamesFile(f)

  const runFromNames = async () => {
    if (!namesFile) return
    setNamesRunning(true)
    setNamesError('')
    setNamesResults([])
    try {
      const form = new FormData()
      form.append('file', namesFile)
      form.append('mode', 'names')
      const res  = await fetch('/api/data/extract/file', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) { setNamesError(data.error); return }
      setNamesResults((data.results ?? []).map((r: any) => ({
        company: r.name ?? r.raw ?? '',
        website: r.website,
        source:  'File',
      })))
    } catch {
      setNamesError('Failed to process file.')
    } finally {
      setNamesRunning(false)
    }
  }

  const runFromDirectory = async () => {
    const urls = dirUrls.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setDirRunning(true)
    setDirError('')
    setDirResults([])
    setSetupRequired(false)
    try {
      const res  = await fetch('/api/data/extract/url', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ urls }),
      })
      const data = await res.json()
      if (data.setup_required) { setSetupRequired(true); return }
      if (data.error) { setDirError(data.error); return }
      const flat: WebsiteResult[] = []
      for (const r of (data.results ?? [])) {
        for (const c of (r.companies ?? [])) {
          flat.push({ company: c.name ?? '', website: c.website, source: r.url })
        }
      }
      setDirResults(flat)
    } catch {
      setDirError('Request failed.')
    } finally {
      setDirRunning(false)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: active ? 700 : 500,
    color: active ? '#00A5A3' : '#9CA3AF',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? '#00A5A3' : 'transparent'}`,
    cursor: 'pointer',
    transition: 'color 0.15s',
  })

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '10px 24px',
    borderRadius: '9px',
    background: disabled ? 'rgba(0,165,163,0.2)' : '#00A5A3',
    color: disabled ? '#9CA3AF' : '#FFFFFF',
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '14px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  })

  const results = activeTab === 'names' ? namesResults : dirResults

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Website Finder</span>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Find company websites from names or directory pages</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '900px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #DDE8EE', marginBottom: '20px' }}>
          <button style={tabStyle(activeTab === 'names')} onClick={() => setActiveTab('names')}>From Company Names</button>
          <button style={tabStyle(activeTab === 'directory')} onClick={() => setActiveTab('directory')}>From Directory URLs</button>
        </div>

        {activeTab === 'names' && (
          <div style={card}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>Upload Company Names File</div>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>Upload an Excel or CSV file with a "Company Name" column. Gemini AI will search for each company's website.</div>
            </div>

            <input
              ref={namesInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleNamesFile(e.target.files[0])}
            />

            <div
              style={{
                border: `1px dashed ${namesDragging ? '#00A5A3' : '#DDE8EE'}`,
                background: namesDragging ? 'rgba(59,130,246,0.07)' : 'rgba(0,165,163,0.03)',
                borderRadius: '10px',
                padding: '36px 24px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
              }}
              onDragOver={e => { e.preventDefault(); setNamesDragging(true) }}
              onDragLeave={() => setNamesDragging(false)}
              onDrop={e => { e.preventDefault(); setNamesDragging(false); if (e.dataTransfer.files[0]) handleNamesFile(e.dataTransfer.files[0]) }}
              onClick={() => namesInputRef.current?.click()}
            >
              <svg width="28" height="28" fill="none" stroke="#00A5A3" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '10px', opacity: 0.7 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <polyline points="9 15 12 12 15 15"/>
              </svg>
              {namesFile ? (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{namesFile.name}</div>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>Click to change file</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '14px', color: '#6B7280' }}>Drop Excel or CSV here, or click to browse</div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>Column required: Company Name</div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={runFromNames} disabled={!namesFile || namesRunning} style={btnStyle(!namesFile || namesRunning)}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                {namesRunning ? 'Finding Websites…' : 'Find Websites →'}
              </button>
            </div>

            {namesError && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', fontSize: '13px', color: '#F87171' }}>
                {namesError}
              </div>
            )}
          </div>
        )}

        {activeTab === 'directory' && (
          <div style={card}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>Paste Directory Page URLs</div>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>Paste sponsor/exhibitor/partner directory pages — Firecrawl will scrape each page and extract company names and websites.</div>
            </div>

            {setupRequired && (
              <div style={{ marginBottom: '14px', padding: '12px 16px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#FBBF24', marginBottom: '4px' }}>Firecrawl API Not Configured</div>
                <div style={{ fontSize: '13px', color: '#6B7280' }}>Add <code style={{ background: 'rgba(251,191,36,0.1)', padding: '1px 5px', borderRadius: '4px', color: '#FBBF24', fontSize: '12px' }}>FIRECRAWL_API_KEY</code> to your .env.local to enable URL scraping.</div>
              </div>
            )}

            <textarea
              value={dirUrls}
              onChange={e => setDirUrls(e.target.value)}
              placeholder={'https://worldcxsummit.com/sponsors\nhttps://conference.io/exhibitors'}
              rows={8}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '10px',
                border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923',
                background: '#F8FAFB', resize: 'vertical', outline: 'none',
                fontFamily: 'monospace', lineHeight: 1.7, boxSizing: 'border-box',
              }}
            />

            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={runFromDirectory} disabled={!dirUrls.trim() || dirRunning} style={btnStyle(!dirUrls.trim() || dirRunning)}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                {dirRunning ? 'Scraping…' : 'Extract Companies →'}
              </button>
            </div>

            {dirError && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', fontSize: '13px', color: '#F87171' }}>
                {dirError}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div style={{ marginTop: '24px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #DDE8EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>Results</span>
              <span style={{ fontSize: '13px', color: '#34D399', fontWeight: 600 }}>{results.length} companies</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 20px', background: '#FFFFFF', borderBottom: '1px solid #DDE8EE' }}>
              {['Company', 'Website', 'Source'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
              ))}
            </div>

            {results.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '11px 20px', borderBottom: i < results.length - 1 ? '1px solid #DDE8EE' : 'none' }}>
                <div style={{ fontSize: '13px', color: '#0F1923', fontWeight: 500 }}>{r.company || '—'}</div>
                <div style={{ fontSize: '13px', color: '#00A5A3' }}>{r.website || '—'}</div>
                <div style={{ fontSize: '11px', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
