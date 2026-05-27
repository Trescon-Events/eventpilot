'use client'

import { useState, useEffect } from 'react'
import React from 'react'
import Link from 'next/link'

interface Tool {
  id: string
  tool_key: string
  display_name: string
  is_active: boolean
  maintenance_message: string | null
  requires_api_key: string | null
  credits_per_use: number
  api_key_configured: boolean
}

interface Limit {
  job_level: string
  daily_limit: number
}

const TOOL_DESCRIPTIONS: Record<string, { desc: string; icon: string }> = {
  linkedin_enricher: {
    desc: 'Enrich contact and company data from LinkedIn profiles using Lusha API. Get email, phone, title, location, and more.',
    icon: 'linkedin',
  },
  smart_lookup: {
    desc: 'Quick single-person lookup by LinkedIn URL or name + company. Ideal for individual prospect research.',
    icon: 'search',
  },
  website_finder: {
    desc: 'Find company websites from a list of company names. Useful when you have company names but no domains.',
    icon: 'globe',
  },
  email_verifier: {
    desc: 'Verify email addresses using MillionVerifier. Marks emails as valid, catch-all, or invalid to reduce bounce rate.',
    icon: 'mail',
  },
  lead_finder: {
    desc: 'AI-powered conversational lead search. Describe your ICP and the AI builds a structured query, then executes via Apollo.',
    icon: 'target',
  },
  email_guesser: {
    desc: 'Guess email addresses from name + company domain using common patterns, then verify with MillionVerifier.',
    icon: 'wand',
  },
}

function ToolIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    linkedin: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>,
    search:   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
    globe:    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    mail:     <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    target:   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    wand:     <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>,
  }
  return icons[name] ?? icons.search
}

function LinkedInEnrichForm() {
  const [url, setUrl]       = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<any>(null)
  const [error, setError]     = useState('')

  const run = async () => {
    if (!url.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res  = await fetch('/api/data/enrich/linkedin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedin_url: url.trim() }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setResult(data)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()} placeholder="https://www.linkedin.com/in/username/" style={{ flex: 1, padding: '10px 14px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923', outline: 'none', background: '#F8FAFB' }} />
        <button onClick={run} disabled={loading || !url.trim()} style={{ padding: '10px 20px', borderRadius: '9px', background: loading ? 'rgba(0,165,163,0.2)' : '#00A5A3', color: loading ? '#9CA3AF' : '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
          {loading ? 'Enriching…' : 'Enrich'}
        </button>
      </div>
      {error && <div style={{ marginTop: '10px', fontSize: '13px', color: '#F87171', background: 'rgba(248,113,113,0.08)', padding: '8px 12px', borderRadius: '8px' }}>{error}</div>}
      {result && (
        <div style={{ marginTop: '12px', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#34D399', marginBottom: '8px' }}>Enriched — {result.fields_enriched} fields</div>
          {Object.entries(result.contact?.property_values ?? {}).filter(([, v]) => v).slice(0, 8).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: '12px', padding: '4px 0', fontSize: '13px' }}>
              <span style={{ color: '#9CA3AF', minWidth: '120px' }}>{k}</span>
              <span style={{ color: '#0F1923', fontWeight: 500 }}>{Array.isArray(v) ? (v as any[]).join(', ') : String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmailVerifyForm() {
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<any>(null)
  const [error, setError]     = useState('')

  const run = async () => {
    if (!email.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res  = await fetch('/api/data/enrich/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setResult(data)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()} placeholder="email@company.com" type="email" style={{ flex: 1, padding: '10px 14px', borderRadius: '9px', border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923', outline: 'none', background: '#F8FAFB' }} />
        <button onClick={run} disabled={loading || !email.trim()} style={{ padding: '10px 20px', borderRadius: '9px', background: loading ? 'rgba(0,165,163,0.2)' : '#00A5A3', color: loading ? '#9CA3AF' : '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </div>
      {error && <div style={{ marginTop: '10px', fontSize: '13px', color: '#F87171', background: 'rgba(248,113,113,0.08)', padding: '8px 12px', borderRadius: '8px' }}>{error}</div>}
      {result && (
        <div style={{ marginTop: '12px', background: result.valid ? 'rgba(52,211,153,0.05)' : 'rgba(248,113,113,0.05)', border: `1px solid ${result.valid ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius: '10px', padding: '14px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: result.valid ? '#34D399' : '#F87171', flexShrink: 0 }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: result.valid ? '#34D399' : '#F87171' }}>{result.valid ? 'Valid Email' : 'Invalid Email'}</span>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>{result.result}</span>
            <span style={{ fontSize: '12px', color: '#9CA3AF', marginLeft: 'auto' }}>Quality: {result.quality_score}/100</span>
          </div>
          {result.free && <div style={{ fontSize: '12px', color: '#FBBF24', marginTop: '6px' }}>Free email provider</div>}
          {result.role && <div style={{ fontSize: '12px', color: '#FBBF24', marginTop: '6px' }}>Role-based address (info@, contact@, etc.)</div>}
        </div>
      )}
    </div>
  )
}

export default function ToolsPage() {
  const [tools, setTools]   = useState<Tool[]>([])
  const [limits, setLimits] = useState<Limit[]>([])
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>('linkedin_enricher')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/data/tools').then(r => r.json()).then(d => {
      setTools(d.tools ?? [])
      setLimits(d.limits ?? [])
      setKeyStatus(d.key_status ?? {})
      setLoading(false)
    })
  }, [])

  const toggleTool = async (tool: Tool) => {
    setToggling(tool.tool_key)
    await fetch('/api/data/tools', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_key: tool.tool_key, is_active: !tool.is_active }),
    })
    setTools(prev => prev.map(t => t.tool_key === tool.tool_key ? { ...t, is_active: !t.is_active } : t))
    setToggling(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Tool Settings</span>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Configure API keys and tool limits</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '900px' }}>
        {/* API Keys Status */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '14px' }}>API Key Status</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {Object.entries(keyStatus).map(([key, configured]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', background: configured ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)', border: `1px solid ${configured ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: configured ? '#34D399' : '#F87171', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>{key}</div>
                  <div style={{ fontSize: '12px', color: configured ? '#34D399' : '#F87171' }}>{configured ? 'Configured' : 'Not configured — add to .env.local'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Credit Limits */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '14px' }}>Daily Credit Limits</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {limits.map(l => (
              <div key={l.job_level} style={{ padding: '10px 16px', borderRadius: '10px', background: '#F8FAFB', border: '1px solid #DDE8EE', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923' }}>{l.daily_limit === 999 ? '∞' : l.daily_limit}</div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>{l.job_level.replace('_', ' ')}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tools list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '15px' }}>Loading tools…</div>
          ) : tools.map(tool => {
            const info = TOOL_DESCRIPTIONS[tool.tool_key]
            const isExpanded = expanded === tool.tool_key
            return (
              <div key={tool.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : tool.tool_key)}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: tool.is_active ? 'rgba(0,165,163,0.1)' : 'rgba(74,85,104,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tool.is_active ? '#00A5A3' : '#9CA3AF', flexShrink: 0 }}>
                    <ToolIcon name={info?.icon ?? 'search'} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{tool.display_name}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: tool.is_active ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)', color: tool.is_active ? '#34D399' : '#F87171' }}>
                        {tool.is_active ? 'Active' : 'Disabled'}
                      </span>
                      {!tool.api_key_configured && (
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'rgba(251,191,36,0.1)', color: '#FBBF24' }}>
                          API Key Missing
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>{info?.desc ?? ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {tool.credits_per_use > 0 && (
                      <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{tool.credits_per_use} credit{tool.credits_per_use !== 1 ? 's' : ''}/use</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); toggleTool(tool) }}
                      disabled={toggling === tool.tool_key}
                      style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: '1px solid #DDE8EE', background: '#F8FAFB', cursor: 'pointer', color: tool.is_active ? '#F87171' : '#34D399' }}
                    >
                      {tool.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <svg width="16" height="16" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 20px 20px', borderTop: '1px solid #DDE8EE' }}>
                    {tool.tool_key === 'linkedin_enricher' && <LinkedInEnrichForm />}
                    {tool.tool_key === 'email_verifier' && <EmailVerifyForm />}
                    {tool.tool_key === 'lead_finder' && (
                      <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(0,165,163,0.06)', borderRadius: '10px', border: '1px solid rgba(0,165,163,0.2)' }}>
                        <div style={{ fontSize: '13px', color: '#0F1923' }}>Use the <Link href="/data/lead-finder" style={{ color: '#00A5A3', fontWeight: 700 }}>Lead Finder AI</Link> page for the full conversational ICP experience.</div>
                      </div>
                    )}
                    {(tool.tool_key === 'smart_lookup' || tool.tool_key === 'website_finder' || tool.tool_key === 'email_guesser') && (
                      <div style={{ marginTop: '16px', padding: '14px', background: '#F8FAFB', borderRadius: '10px', border: '1px solid #DDE8EE' }}>
                        <div style={{ fontSize: '13px', color: '#6B7280' }}>
                          {tool.api_key_configured
                            ? 'This tool is configured and ready. Use it from the Contacts view on individual records.'
                            : `Requires ${tool.requires_api_key} in your .env.local file.`
                          }
                        </div>
                      </div>
                    )}
                    {tool.maintenance_message && (
                      <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(251,191,36,0.06)', borderRadius: '8px', fontSize: '13px', color: '#FBBF24' }}>
                        {tool.maintenance_message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
