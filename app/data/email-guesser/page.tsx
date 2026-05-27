'use client'

import { useState } from 'react'

interface GuessResult {
  email: string
  confidence: string
  pattern: string
  verified?: boolean
  quality_score?: number
}

export default function EmailGuesserPage() {
  const [company, setCompany]     = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [domain, setDomain]       = useState('')
  const [running, setRunning]     = useState(false)
  const [results, setResults]     = useState<GuessResult[]>([])
  const [error, setError]         = useState('')
  const [setupRequired, setSetupRequired] = useState(false)

  const run = async () => {
    if (!firstName.trim() || !lastName.trim() || (!company.trim() && !domain.trim())) return
    setRunning(true)
    setError('')
    setResults([])
    setSetupRequired(false)
    try {
      const res  = await fetch('/api/data/enrich/email-guess', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          company: company.trim(),
          domain:  domain.trim(),
          first_name: firstName.trim(),
          last_name:  lastName.trim(),
        }),
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

  const canRun = firstName.trim() && lastName.trim() && (company.trim() || domain.trim())

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '9px',
    border: '1px solid #DDE8EE', fontSize: '14px', color: '#0F1923',
    background: '#F8FAFB', outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 700, color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px',
    display: 'block',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>
          <path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/>
          <path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Email Guesser</span>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Find likely email addresses from name + company</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '720px' }}>

        {setupRequired && (
          <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '12px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <svg width="20" height="20" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FBBF24', marginBottom: '6px' }}>Apollo API Not Configured</div>
              <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.6 }}>
                Email guessing requires an Apollo API key. Add <code style={{ background: 'rgba(251,191,36,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#FBBF24', fontSize: '12px' }}>APOLLO_API_KEY</code> to your .env.local file, then restart.
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#9CA3AF' }}>
                Get your API key at <span style={{ color: '#00A5A3' }}>apollo.io/settings/api</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '24px' }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>Find Email Address</div>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>
              Enter a person's name and their company or domain. Apollo will guess likely email patterns and verify them.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="John"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Smith"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Company Name</label>
              <input
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="Acme Corporation"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Domain (optional)</label>
              <input
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="acme.com"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ padding: '10px 14px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.1)', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#00A5A3' }}>
            <strong>How it works:</strong> <span style={{ color: '#6B7280' }}>Apollo generates common patterns (first.last@, f.last@, first@, etc.) and verifies which one is deliverable.</span>
          </div>

          <button
            onClick={run}
            disabled={!canRun || running}
            style={{
              width: '100%', padding: '12px 24px', borderRadius: '10px',
              background: !canRun || running ? 'rgba(0,165,163,0.2)' : '#00A5A3',
              color: !canRun || running ? '#9CA3AF' : '#FFFFFF',
              border: 'none', cursor: !canRun || running ? 'default' : 'pointer',
              fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'background 0.15s',
            }}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            {running ? 'Guessing email…' : 'Guess Email →'}
          </button>

          {error && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', fontSize: '13px', color: '#F87171' }}>
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ marginTop: '20px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #DDE8EE' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>Guessed Emails</span>
            </div>

            {results.map((r, i) => (
              <div key={i} style={{
                padding: '14px 20px', borderBottom: i < results.length - 1 ? '1px solid #DDE8EE' : 'none',
                display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                    background: r.verified ? '#34D399' : r.confidence === 'high' ? '#00A5A3' : '#9CA3AF',
                  }} />
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F1923' }}>{r.email}</div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>{r.pattern}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {r.verified && (
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: 'rgba(52,211,153,0.1)', color: '#34D399' }}>Verified</span>
                  )}
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px',
                    background: r.confidence === 'high' ? 'rgba(96,165,250,0.1)' : r.confidence === 'medium' ? 'rgba(251,191,36,0.1)' : 'rgba(74,85,104,0.2)',
                    color: r.confidence === 'high' ? '#00A5A3' : r.confidence === 'medium' ? '#FBBF24' : '#6B7280',
                  }}>
                    {r.confidence}
                  </span>
                  {r.quality_score != null && (
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Q: {r.quality_score}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
