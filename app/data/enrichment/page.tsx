'use client'

import { useState, useRef } from 'react'

interface EnrichResult {
  linkedin_url?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  title?: string
  company?: string
  status?: string
  error?: string
}

interface VerifyResult {
  email: string
  valid: boolean
  result: string
  quality_score: number
  free?: boolean
  role?: boolean
  error?: string
}

const TARGET_PROPS = [
  'vendorTarget', 'delegateTarget', 'speakerTarget',
  'partnershipTarget', 'investorTarget', 'mediaTarget',
]

export default function EnrichmentPage() {
  const [activeTab, setActiveTab] = useState<'enricher' | 'verify'>('enricher')

  /* ── LinkedIn Enricher state ── */
  const [urlText, setUrlText]           = useState('')
  const [file, setFile]                 = useState<File | null>(null)
  const [fileDragging, setFileDragging] = useState(false)
  const [mode, setMode]                 = useState<'full' | 'apollo' | 'lusha'>('full')
  const [targetProp, setTargetProp]     = useState('')
  const [findL2, setFindL2]             = useState(false)
  const [forceFresh, setForceFresh]     = useState(false)
  const [zeroBounce, setZeroBounce]     = useState(false)
  const [running, setRunning]           = useState(false)
  const [enrichResults, setEnrichResults] = useState<EnrichResult[]>([])
  const [enrichError, setEnrichError]   = useState('')
  const [setupMissing, setSetupMissing] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Email Verifier state ── */
  const [emailText, setEmailText]   = useState('')
  const [verifying, setVerifying]   = useState(false)
  const [verifyResults, setVerifyResults] = useState<VerifyResult[]>([])
  const [verifyError, setVerifyError] = useState('')

  const runEnrich = async () => {
    const urls = urlText.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length && !file) return
    setRunning(true)
    setEnrichError('')
    setEnrichResults([])
    setSetupMissing([])
    try {
      let body: any = { mode, target_property: targetProp, find_l2: findL2, force_fresh: forceFresh, zero_bounce: zeroBounce }
      if (file) {
        const form = new FormData()
        form.append('file', file)
        form.append('meta', JSON.stringify(body))
        const res  = await fetch('/api/data/enrich/linkedin-bulk', { method: 'POST', body: form })
        const data = await res.json()
        if (data.setup_required) { setSetupMissing(data.missing_keys ?? []); return }
        if (data.error) { setEnrichError(data.error); return }
        setEnrichResults(data.results ?? [])
      } else {
        body.urls = urls
        const res  = await fetch('/api/data/enrich/linkedin-bulk', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
        const data = await res.json()
        if (data.setup_required) { setSetupMissing(data.missing_keys ?? []); return }
        if (data.error) { setEnrichError(data.error); return }
        setEnrichResults(data.results ?? [])
      }
    } catch {
      setEnrichError('Request failed.')
    } finally {
      setRunning(false)
    }
  }

  const runVerify = async () => {
    const emails = emailText.split('\n').map(e => e.trim()).filter(Boolean)
    if (!emails.length) return
    setVerifying(true)
    setVerifyError('')
    setVerifyResults([])
    try {
      const res  = await fetch('/api/data/enrich/email-bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ emails }),
      })
      const data = await res.json()
      if (data.error) { setVerifyError(data.error); return }
      setVerifyResults(data.results ?? [])
    } catch {
      setVerifyError('Request failed.')
    } finally {
      setVerifying(false)
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

  const radioStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '8px 14px', borderRadius: '9px',
    border: `1px solid ${active ? 'var(--teal-mid)' : 'var(--border)'}`,
    background: active ? 'rgba(18,201,189,0.08)' : 'var(--surface)',
    cursor: 'pointer', transition: 'all 0.12s',
  })

  const checkLabel: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '13px', color: 'var(--ink3)', cursor: 'pointer', userSelect: 'none',
  }

  const urlCount  = urlText.split('\n').filter(u => u.trim()).length
  const emailCount = emailText.split('\n').filter(e => e.trim()).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
          <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Data Enrichment</span>
        <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>LinkedIn profiles · Email verification</span>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
          <button style={tabStyle(activeTab === 'enricher')} onClick={() => setActiveTab('enricher')}>LinkedIn Enricher</button>
          <button style={tabStyle(activeTab === 'verify')} onClick={() => setActiveTab('verify')}>Email Verifier</button>
        </div>
      </div>

      <div style={{ padding: '0 24px 24px', maxWidth: '900px' }}>

        {activeTab === 'enricher' && (
          <div>
            {/* Missing keys warning */}
            {setupMissing.length > 0 && (
              <div style={{ marginBottom: '16px', padding: '14px 18px', background: 'rgba(245,185,77,0.06)', border: '1px solid rgba(245,185,77,0.25)', borderRadius: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)', marginBottom: '6px' }}>API Keys Required</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {setupMissing.map(key => (
                    <code key={key} style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245,185,77,0.1)', color: 'var(--amber)' }}>{key}</code>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '6px' }}>Add these to your .env.local and restart the server.</div>
              </div>
            )}

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
              {/* Input */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>LinkedIn URLs</div>
                <textarea
                  value={urlText}
                  onChange={e => setUrlText(e.target.value)}
                  placeholder={'https://www.linkedin.com/in/john-smith-cto\nhttps://www.linkedin.com/in/jane-doe-cxo\nhttps://www.linkedin.com/in/alex-kumar-vp'}
                  rows={6}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: '10px',
                    border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
                    background: 'var(--surface)', resize: 'vertical', outline: 'none',
                    fontFamily: 'monospace', lineHeight: 1.7, boxSizing: 'border-box',
                  }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ink4)' }}>
                  OR
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
                />
                <div
                  style={{
                    marginTop: '8px',
                    border: `1px dashed ${fileDragging ? 'var(--teal-mid)' : 'var(--border)'}`,
                    background: fileDragging ? 'rgba(90,169,242,0.07)' : 'rgba(18,201,189,0.03)',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onDragOver={e => { e.preventDefault(); setFileDragging(true) }}
                  onDragLeave={() => setFileDragging(false)}
                  onDrop={e => { e.preventDefault(); setFileDragging(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]) }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span style={{ fontSize: '13px', color: file ? 'var(--ink)' : 'var(--ink3)' }}>
                    {file ? file.name : 'Drop file (Excel / CSV / TXT) or click to browse'}
                  </span>
                </div>
              </div>

              {/* Enrichment mode */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>ENRICHMENT MODE</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { key: 'full',   label: 'Full Cycle (Apollo + Lusha + MV)' },
                    { key: 'apollo', label: 'Apollo Only' },
                    { key: 'lusha',  label: 'Lusha Only' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setMode(opt.key as any)} style={radioStyle(mode === opt.key)}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: `2px solid ${mode === opt.key ? 'var(--teal-mid)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {mode === opt.key && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal-mid)' }} />}
                      </div>
                      <span style={{ fontSize: '13px', color: mode === opt.key ? 'var(--teal-mid)' : 'var(--ink3)', fontWeight: mode === opt.key ? 600 : 400 }}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Target property */}
              <div style={{ marginBottom: '20px', display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>TARGET PROPERTY</div>
                  <select
                    value={targetProp}
                    onChange={e => setTargetProp(e.target.value)}
                    style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)', background: 'var(--surface)', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="">None</option>
                    {TARGET_PROPS.map(t => <option key={t} value={t}>{t.replace('Target', ' Target')}</option>)}
                  </select>
                </div>
              </div>

              {/* Checkboxes */}
              <div style={{ marginBottom: '24px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <label style={checkLabel}>
                  <input type="checkbox" checked={findL2} onChange={e => setFindL2(e.target.checked)} style={{ accentColor: 'var(--teal-mid)', width: '14px', height: '14px' }} />
                  Find Contact L2s
                </label>
                <label style={checkLabel}>
                  <input type="checkbox" checked={forceFresh} onChange={e => setForceFresh(e.target.checked)} style={{ accentColor: 'var(--teal-mid)', width: '14px', height: '14px' }} />
                  Force fresh lookup (ignore cache)
                </label>
                <label style={checkLabel}>
                  <input type="checkbox" checked={zeroBounce} onChange={e => setZeroBounce(e.target.checked)} style={{ accentColor: 'var(--teal-mid)', width: '14px', height: '14px' }} />
                  Run ZeroBounce Verify+
                </label>
              </div>

              {/* Start button */}
              <button
                onClick={runEnrich}
                disabled={(!urlText.trim() && !file) || running}
                style={{
                  width: '100%', padding: '13px 24px', borderRadius: '10px',
                  background: (!urlText.trim() && !file) || running ? 'rgba(18,201,189,0.2)' : 'var(--teal-mid)',
                  color: (!urlText.trim() && !file) || running ? 'var(--ink4)' : 'var(--teal-light)',
                  border: 'none', cursor: (!urlText.trim() && !file) || running ? 'default' : 'pointer',
                  fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                {running ? `Enriching ${urlCount || '…'} profiles…` : 'Start Enrichment →'}
              </button>

              {enrichError && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(241,102,122,0.08)', border: '1px solid rgba(241,102,122,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)' }}>
                  {enrichError}
                </div>
              )}
            </div>

            {/* Results */}
            {enrichResults.length > 0 && (
              <div style={{ marginTop: '20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Enrichment Results</span>
                  <span style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>{enrichResults.filter(r => !r.error).length} enriched</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px', padding: '10px 20px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                  {['Name / Title', 'Email', 'Company', 'Status'].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
                  ))}
                </div>
                {enrichResults.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px', padding: '11px 20px', borderBottom: i < enrichResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500 }}>{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{r.title || ''}</div>
                    </div>
                    <div style={{ fontSize: '13px', color: r.email ? 'var(--teal-mid)' : 'var(--ink4)', alignSelf: 'center' }}>{r.email || '—'}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', alignSelf: 'center' }}>{r.company || '—'}</div>
                    <div style={{ alignSelf: 'center' }}>
                      {r.error ? (
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '8px', background: 'rgba(241,102,122,0.1)', color: 'var(--red)', fontWeight: 600 }}>Failed</span>
                      ) : (
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '8px', background: 'rgba(52,211,153,0.1)', color: 'var(--success)', fontWeight: 600 }}>Enriched</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'verify' && (
          <div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>Email Addresses</div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Paste email addresses one per line. Each will be verified via MillionVerifier.</div>
              </div>

              <textarea
                value={emailText}
                onChange={e => setEmailText(e.target.value)}
                placeholder={'john.smith@company.com\njane.doe@enterprise.io\nalex.kumar@tech.co'}
                rows={10}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: '10px',
                  border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
                  background: 'var(--surface)', resize: 'vertical', outline: 'none',
                  fontFamily: 'monospace', lineHeight: 1.7, boxSizing: 'border-box',
                }}
              />

              <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>
                  {emailCount > 0 ? `${emailCount} email${emailCount !== 1 ? 's' : ''} queued` : 'No emails entered'}
                </span>
                <button
                  onClick={runVerify}
                  disabled={!emailText.trim() || verifying}
                  style={{
                    padding: '10px 24px', borderRadius: '9px',
                    background: !emailText.trim() || verifying ? 'rgba(18,201,189,0.2)' : 'var(--teal-mid)',
                    color: !emailText.trim() || verifying ? 'var(--ink4)' : 'var(--teal-light)',
                    border: 'none', cursor: !emailText.trim() || verifying ? 'default' : 'pointer',
                    fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  {verifying ? 'Verifying…' : 'Verify Emails →'}
                </button>
              </div>

              {verifyError && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(241,102,122,0.08)', border: '1px solid rgba(241,102,122,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)' }}>
                  {verifyError}
                </div>
              )}
            </div>

            {verifyResults.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Verification Results</span>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--success)' }}>{verifyResults.filter(r => r.valid).length} valid</span>
                    <span style={{ fontSize: '12px', color: 'var(--red)' }}>{verifyResults.filter(r => !r.valid).length} invalid</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', padding: '10px 20px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                  {['Email', 'Status', 'Quality', 'Flags'].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
                  ))}
                </div>
                {verifyResults.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', padding: '11px 20px', borderBottom: i < verifyResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: '13px', color: 'var(--ink)' }}>{r.email}</div>
                    <div>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px',
                        background: r.valid ? 'rgba(52,211,153,0.1)' : 'rgba(241,102,122,0.1)',
                        color: r.valid ? 'var(--success)' : 'var(--red)',
                      }}>
                        {r.valid ? 'Valid' : 'Invalid'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', alignSelf: 'center' }}>{r.quality_score ?? '—'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--amber)', alignSelf: 'center' }}>
                      {r.free ? 'Free' : ''}{r.role ? (r.free ? ' · Role' : 'Role') : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
