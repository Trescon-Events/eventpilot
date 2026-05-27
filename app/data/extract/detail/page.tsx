'use client'

import { useState } from 'react'

interface EnrichedPerson {
  linkedin_url: string
  firstName?: string
  lastName?: string
  title?: string
  email?: string
  phone?: string
  company?: string
  location?: string
  error?: string
}

export default function DetailExtractorPage() {
  const [urlText, setUrlText]       = useState('')
  const [running, setRunning]       = useState(false)
  const [results, setResults]       = useState<EnrichedPerson[]>([])
  const [error, setError]           = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [saved, setSaved]           = useState(0)

  const run = async () => {
    const urls = urlText.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setRunning(true)
    setError('')
    setResults([])
    setSetupRequired(false)
    setSaved(0)
    try {
      const res  = await fetch('/api/data/enrich/linkedin-bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ urls }),
      })
      const data = await res.json()
      if (data.setup_required) { setSetupRequired(true); return }
      if (data.error) { setError(data.error); return }
      setResults(data.results ?? [])
      setSaved(data.saved ?? 0)
    } catch {
      setError('Request failed.')
    } finally {
      setRunning(false)
    }
  }

  const urlCount = urlText.split('\n').filter(u => u.trim()).length

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Detail Extractor</span>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Enrich LinkedIn profiles via Lusha — get email, phone, title</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '860px' }}>

        {setupRequired && (
          <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '12px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <svg width="20" height="20" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FBBF24', marginBottom: '6px' }}>Lusha API Not Configured</div>
              <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.6 }}>
                Detail extraction requires a Lusha API key. Add <code style={{ background: 'rgba(251,191,36,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#FBBF24', fontSize: '12px' }}>LUSHA_API_KEY</code> to your .env.local file.
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#9CA3AF' }}>
                Get your API key at <span style={{ color: '#00A5A3' }}>lusha.com/developers</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>Paste LinkedIn Profile URLs</div>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>
              One URL per line. Each profile will be looked up via Lusha to retrieve email, phone, title, and location.
            </div>
          </div>

          <textarea
            value={urlText}
            onChange={e => setUrlText(e.target.value)}
            placeholder={'https://www.linkedin.com/in/john-smith-cto\nhttps://www.linkedin.com/in/jane-doe-cxo\nhttps://www.linkedin.com/in/alex-kumar-vp'}
            rows={10}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: '10px',
              border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923',
              background: '#F8FAFB', resize: 'vertical', outline: 'none',
              fontFamily: 'monospace', lineHeight: 1.7, boxSizing: 'border-box',
            }}
          />

          {/* Info bar */}
          <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.1)', borderRadius: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#00A5A3' }}>
              <strong>1 Lusha credit</strong> per profile
            </span>
            <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
              {urlCount} URL{urlCount !== 1 ? 's' : ''} queued · ~{urlCount} credits
            </span>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={run}
              disabled={!urlText.trim() || running}
              style={{
                padding: '10px 24px', borderRadius: '9px',
                background: !urlText.trim() || running ? 'rgba(0,165,163,0.2)' : '#00A5A3',
                color: !urlText.trim() || running ? '#9CA3AF' : '#FFFFFF',
                border: 'none', cursor: !urlText.trim() || running ? 'default' : 'pointer',
                fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              {running ? 'Enriching…' : 'Enrich Profiles →'}
            </button>
          </div>

          {error && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', fontSize: '13px', color: '#F87171' }}>
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #DDE8EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>Enriched Profiles</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {saved > 0 && <span style={{ fontSize: '12px', color: '#34D399', fontWeight: 600 }}>{saved} saved to contacts</span>}
                <span style={{ fontSize: '13px', color: '#6B7280' }}>{results.length} profiles</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 100px', padding: '10px 20px', background: '#FFFFFF', borderBottom: '1px solid #DDE8EE' }}>
              {['Name / Title', 'Company', 'Email', 'Phone', 'Location'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
              ))}
            </div>

            {results.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 100px', padding: '12px 20px', borderBottom: i < results.length - 1 ? '1px solid #DDE8EE' : 'none', background: r.error ? 'rgba(248,113,113,0.04)' : 'transparent' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>
                    {[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>{r.title || ''}</div>
                  {r.error && <div style={{ fontSize: '11px', color: '#F87171', marginTop: '2px' }}>{r.error}</div>}
                </div>
                <div style={{ fontSize: '13px', color: '#0F1923', alignSelf: 'center' }}>{r.company || '—'}</div>
                <div style={{ fontSize: '12px', color: r.email ? '#00A5A3' : '#9CA3AF', alignSelf: 'center' }}>{r.email || '—'}</div>
                <div style={{ fontSize: '12px', color: '#6B7280', alignSelf: 'center' }}>{r.phone || '—'}</div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', alignSelf: 'center' }}>{r.location || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
