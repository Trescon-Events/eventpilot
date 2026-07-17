'use client'

import { useState, useRef } from 'react'

interface WebsiteResult {
  company: string
  website?: string
  confidence?: string
  source?: string
}

const card: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
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
    color: active ? 'var(--teal-mid)' : 'var(--ink4)',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? 'var(--teal-mid)' : 'transparent'}`,
    cursor: 'pointer',
    transition: 'color 0.15s',
  })

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '10px 24px',
    borderRadius: '9px',
    background: disabled ? 'rgba(18,201,189,0.2)' : 'var(--teal-mid)',
    color: disabled ? 'var(--ink4)' : 'var(--teal-light)',
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
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Website Finder</span>
        <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>Find company websites from names or directory pages</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '900px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
          <button style={tabStyle(activeTab === 'names')} onClick={() => setActiveTab('names')}>From Company Names</button>
          <button style={tabStyle(activeTab === 'directory')} onClick={() => setActiveTab('directory')}>From Directory URLs</button>
        </div>

        {activeTab === 'names' && (
          <div style={card}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>Upload Company Names File</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Upload an Excel or CSV file with a "Company Name" column. Gemini AI will search for each company's website.</div>
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
                border: `1px dashed ${namesDragging ? 'var(--teal-mid)' : 'var(--border)'}`,
                background: namesDragging ? 'rgba(90,169,242,0.07)' : 'rgba(18,201,189,0.03)',
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
              <svg width="28" height="28" fill="none" stroke="var(--teal-mid)" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '10px', opacity: 0.7 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <polyline points="9 15 12 12 15 15"/>
              </svg>
              {namesFile ? (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{namesFile.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>Click to change file</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>Drop Excel or CSV here, or click to browse</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '4px' }}>Column required: Company Name</div>
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
              <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(241,102,122,0.08)', border: '1px solid rgba(241,102,122,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)' }}>
                {namesError}
              </div>
            )}
          </div>
        )}

        {activeTab === 'directory' && (
          <div style={card}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>Paste Directory Page URLs</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Paste sponsor/exhibitor/partner directory pages — Firecrawl will scrape each page and extract company names and websites.</div>
            </div>

            {setupRequired && (
              <div style={{ marginBottom: '14px', padding: '12px 16px', background: 'rgba(245,185,77,0.06)', border: '1px solid rgba(245,185,77,0.25)', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)', marginBottom: '4px' }}>Firecrawl API Not Configured</div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Add <code style={{ background: 'rgba(245,185,77,0.1)', padding: '1px 5px', borderRadius: '4px', color: 'var(--amber)', fontSize: '12px' }}>FIRECRAWL_API_KEY</code> to your .env.local to enable URL scraping.</div>
              </div>
            )}

            <textarea
              value={dirUrls}
              onChange={e => setDirUrls(e.target.value)}
              placeholder={'https://worldcxsummit.com/sponsors\nhttps://conference.io/exhibitors'}
              rows={8}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '10px',
                border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
                background: 'var(--surface)', resize: 'vertical', outline: 'none',
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
              <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(241,102,122,0.08)', border: '1px solid rgba(241,102,122,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)' }}>
                {dirError}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div style={{ marginTop: '24px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Results</span>
              <span style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>{results.length} companies</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 20px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
              {['Company', 'Website', 'Source'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
              ))}
            </div>

            {results.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '11px 20px', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500 }}>{r.company || '—'}</div>
                <div style={{ fontSize: '13px', color: 'var(--teal-mid)' }}>{r.website || '—'}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
