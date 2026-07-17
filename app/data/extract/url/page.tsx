'use client'

import { useState } from 'react'

interface UrlResult {
  url: string
  companies: { name?: string; website?: string }[]
  error?: string
}

export default function UrlExtractorPage() {
  const [urlText, setUrlText]       = useState('')
  const [running, setRunning]       = useState(false)
  const [results, setResults]       = useState<UrlResult[]>([])
  const [error, setError]           = useState('')
  const [setupRequired, setSetupRequired] = useState(false)

  const run = async () => {
    const urls = urlText.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setRunning(true)
    setError('')
    setResults([])
    setSetupRequired(false)
    try {
      const res  = await fetch('/api/data/extract/url', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ urls }),
      })
      const data = await res.json()
      if (data.setup_required) { setSetupRequired(true); return }
      if (data.error) { setError(data.error); return }
      setResults(data.results ?? [])
    } catch {
      setError('Request failed.')
    } finally {
      setRunning(false)
    }
  }

  const urlCount = urlText.split('\n').filter(u => u.trim()).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>URL Extractor</span>
        <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>Scrape event / directory pages to extract company names</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '860px' }}>

        {setupRequired && (
          <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'rgba(245,185,77,0.06)', border: '1px solid rgba(245,185,77,0.25)', borderRadius: '12px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <svg width="20" height="20" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--amber)', marginBottom: '6px' }}>Firecrawl API Not Configured</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                URL scraping requires a Firecrawl API key. Add <code style={{ background: 'rgba(245,185,77,0.1)', padding: '2px 6px', borderRadius: '4px', color: 'var(--amber)', fontSize: '12px' }}>FIRECRAWL_API_KEY</code> to your <code style={{ background: 'rgba(245,185,77,0.1)', padding: '2px 6px', borderRadius: '4px', color: 'var(--amber)', fontSize: '12px' }}>.env.local</code> file, then restart the dev server.
              </div>
              <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--ink4)' }}>
                Get your API key at <span style={{ color: 'var(--teal-mid)' }}>firecrawl.dev</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>Paste URLs (one per line)</div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>
              Paste sponsor pages, exhibitor lists, partner directories — Firecrawl will scrape and extract companies.
            </div>
          </div>

          <textarea
            value={urlText}
            onChange={e => setUrlText(e.target.value)}
            placeholder={'https://worldcxsummit.com/sponsors\nhttps://conference.io/exhibitors\nhttps://summit.co/partners'}
            rows={10}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: '10px',
              border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
              background: 'var(--surface)', resize: 'vertical', outline: 'none',
              fontFamily: 'monospace', lineHeight: 1.7, boxSizing: 'border-box',
            }}
          />

          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>
              {urlCount > 0 ? `${urlCount} URL${urlCount !== 1 ? 's' : ''} queued` : 'No URLs entered'}
            </span>
            <button
              onClick={run}
              disabled={!urlText.trim() || running}
              style={{
                padding: '10px 24px', borderRadius: '9px',
                background: !urlText.trim() || running ? 'rgba(18,201,189,0.2)' : 'var(--teal-mid)',
                color: !urlText.trim() || running ? 'var(--ink4)' : 'var(--teal-light)',
                border: 'none', cursor: !urlText.trim() || running ? 'default' : 'pointer',
                fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              {running ? 'Extracting…' : 'Extract Companies →'}
            </button>
          </div>

          {error && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(241,102,122,0.08)', border: '1px solid rgba(241,102,122,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Extracted Results</span>
              <span style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>{results.reduce((a, r) => a + r.companies.length, 0)} companies found</span>
            </div>

            {results.map((r, ri) => (
              <div key={ri} style={{ borderBottom: ri < results.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ padding: '10px 20px', background: 'rgba(90,169,242,0.04)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--teal-mid)', fontFamily: 'monospace' }}>{r.url}</div>
                  {r.error && <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '4px' }}>{r.error}</div>}
                </div>
                {r.companies.map((c, ci) => (
                  <div key={ci} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '10px 20px', borderBottom: ci < r.companies.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: '13px', color: 'var(--ink)' }}>{c.name || '—'}</div>
                    <div style={{ fontSize: '13px', color: 'var(--teal-mid)' }}>{c.website || '—'}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
