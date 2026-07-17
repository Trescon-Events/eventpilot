'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: string
}

interface Search {
  id: string
  name: string
  status: string
  results_count: number | null
  created_at: string
  final_icp_json: any
}

function IcpPreview({ icp }: { icp: any }) {
  if (!icp) return null
  const fields = [
    { label: 'Job Titles',     value: icp.person_titles?.join(', ') },
    { label: 'Seniority',      value: icp.person_seniorities?.join(', ') },
    { label: 'Locations',      value: icp.organization_locations?.join(', ') },
    { label: 'Employee Range', value: icp.organization_num_employees_ranges?.join(', ') },
    { label: 'Industries',     value: icp.industries?.join(', ') },
    { label: 'Keywords',       value: icp.q_keywords },
    { label: 'Exclude',        value: icp.negative_keywords?.join(', ') },
    { label: 'Summary',        value: icp.summary_message ?? icp.intent?.context },
  ].filter(f => f.value)

  return (
    <div style={{ background: 'rgba(18,201,189,0.06)', border: '1px solid rgba(18,201,189,0.2)', borderRadius: '12px', padding: '16px', margin: '12px 0' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal-mid)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>ICP Ready — Preview</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {fields.map(f => (
          <div key={f.label} style={{ display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink4)', minWidth: '120px', flexShrink: 0 }}>{f.label}</span>
            <span style={{ fontSize: '12px', color: 'var(--ink)', fontWeight: 500 }}>{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LeadFinderPage() {
  const [searches, setSearches]     = useState<Search[]>([])
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [transcript, setTranscript] = useState<Message[]>([])
  const [icpJson, setIcpJson]       = useState<any>(null)
  const [status, setStatus]         = useState<string>('drafting')
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [executing, setExecuting]   = useState(false)
  const [execResult, setExecResult] = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadSearches() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript])

  const loadSearches = async () => {
    const data = await fetch('/api/data/lead-finder').then(r => r.json())
    setSearches(data ?? [])
  }

  const startNew = () => {
    setActiveId(null); setTranscript([]); setIcpJson(null)
    setStatus('drafting'); setExecResult(null)
  }

  const loadSearch = async (s: Search) => {
    setActiveId(s.id); setIcpJson(s.final_icp_json); setStatus(s.status); setExecResult(null)
    const res = await fetch(`/api/data/lead-finder?search_id=${s.id}`).then(r => r.json())
    if (Array.isArray(res)) {
      const found = res.find((d: any) => d.id === s.id)
      if (found?.conversation_transcript) setTranscript(found.conversation_transcript)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || sending) return
    const msg = input.trim()
    setInput(''); setSending(true)
    const userMsg: Message = { role: 'user', content: msg, ts: new Date().toISOString() }
    setTranscript(prev => [...prev, userMsg])
    try {
      const res  = await fetch('/api/data/lead-finder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ search_id: activeId, message: msg, user_name: 'You' }),
      })
      const data = await res.json()
      if (data.error) {
        setTranscript(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}`, ts: new Date().toISOString() }])
        return
      }
      setActiveId(data.search_id); setTranscript(data.transcript ?? [])
      setIcpJson(data.icp_json ?? null); setStatus(data.status)
      if (data.icp_ready) await loadSearches()
    } finally { setSending(false) }
  }

  const executeSearch = async () => {
    if (!activeId || !icpJson) return
    setExecuting(true)
    try {
      const res  = await fetch('/api/data/lead-finder/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ search_id: activeId, per_page: 25 }),
      })
      const data = await res.json()
      setExecResult(data)
      if (!data.error) { setStatus('exported'); await loadSearches() }
    } finally { setExecuting(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const STATUS_COLORS: Record<string, string> = {
    drafting:     'var(--ink4)',
    preview:      'var(--amber)',
    sample_ready: 'var(--teal-mid)',
    exported:     'var(--success)',
    failed:       'var(--red)',
  }

  return (
    <div style={{ height: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Lead Finder AI</span>
        <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>Conversational ICP builder · Apollo execution</span>
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar — search history */}
        {sidebarOpen && (
          <div style={{ width: '260px', borderRight: '1px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Search History</span>
              <button onClick={startNew} style={{ padding: '5px 10px', borderRadius: '7px', background: 'var(--teal-mid)', color: 'var(--teal-light)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                + New
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {searches.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>
                  No searches yet.<br/>Start a conversation to find leads.
                </div>
              ) : searches.map(s => (
                <div
                  key={s.id}
                  onClick={() => loadSearch(s)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    background: activeId === s.id ? 'rgba(18,201,189,0.08)' : 'transparent',
                    borderLeft: activeId === s.id ? '2px solid var(--teal-mid)' : '2px solid transparent',
                  }}
                  onMouseEnter={e => { if (activeId !== s.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { if (activeId !== s.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: STATUS_COLORS[s.status] ?? 'var(--ink4)', textTransform: 'capitalize' }}>{s.status}</span>
                    <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>{new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  {s.results_count != null && (
                    <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>{s.results_count.toLocaleString()} results</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Chat header */}
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setSidebarOpen(p => !p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', padding: '4px' }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                {activeId ? 'Continue Search' : 'New Lead Search'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>
                AI asks 4–6 questions then generates your ICP
              </div>
            </div>
            {icpJson && (
              <div style={{ marginLeft: 'auto' }}>
                <button
                  onClick={executeSearch}
                  disabled={executing}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                    background: executing ? 'rgba(18,201,189,0.2)' : 'var(--teal-mid)',
                    color: executing ? 'var(--ink4)' : 'var(--teal-light)',
                    border: 'none', cursor: executing ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  {executing ? 'Searching Apollo…' : 'Execute Search'}
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--surface)' }}>
            {transcript.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 24px', maxWidth: '500px', margin: '0 auto' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(18,201,189,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="24" height="24" fill="none" stroke="var(--teal-mid)" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>Find Your Ideal Leads</div>
                <div style={{ fontSize: '15px', color: 'var(--ink3)', lineHeight: 1.65 }}>
                  Describe who you want to find in plain English. The AI will ask a few questions and build a precise ICP, then search Apollo.
                </div>
                <div style={{ marginTop: '24px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {[
                    'CX Directors in Bangalore for World CX Summit',
                    'CFOs in Dubai for Finance 2045',
                    'CTOs in Indonesia for World AI Show',
                  ].map(ex => (
                    <button key={ex} onClick={() => setInput(ex)} style={{
                      padding: '8px 14px', borderRadius: '20px', border: '1px solid var(--border)',
                      background: 'var(--card)', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal-mid)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >{ex}</button>
                  ))}
                </div>
              </div>
            )}

            {transcript.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(18,201,189,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '10px', marginTop: '4px' }}>
                    <svg width="14" height="14" fill="none" stroke="var(--teal-mid)" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  </div>
                )}
                <div style={{ maxWidth: '70%' }}>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user' ? 'var(--teal-mid)' : 'var(--card)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                    fontSize: '15px', color: msg.role === 'user' ? 'var(--teal-light)' : 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content.replace(/```json[\s\S]*?```/g, '').trim()}
                  </div>
                  {msg.role === 'assistant' && msg.content.includes('```json') && (
                    <IcpPreview icp={icpJson} />
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(18,201,189,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" fill="none" stroke="var(--teal-mid)" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--teal-mid)', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {execResult && (
              <div style={{
                background: execResult.error ? 'rgba(241,102,122,0.06)' : 'rgba(52,211,153,0.06)',
                border: `1px solid ${execResult.error ? 'rgba(241,102,122,0.2)' : 'rgba(52,211,153,0.2)'}`,
                borderRadius: '12px', padding: '16px',
              }}>
                {execResult.error ? (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', marginBottom: '4px' }}>Search Failed</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{execResult.error}</div>
                    {execResult.setup_required && (
                      <div style={{ fontSize: '13px', color: 'var(--amber)', marginTop: '8px', background: 'rgba(245,185,77,0.08)', padding: '8px 12px', borderRadius: '8px' }}>
                        Add APOLLO_API_KEY to your .env.local to execute Apollo searches.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--success)', marginBottom: '8px' }}>Search Complete</div>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <div><div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)' }}>{execResult.total_in_apollo?.toLocaleString()}</div><div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Total in Apollo</div></div>
                      <div><div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)' }}>{execResult.inserted}</div><div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Added to Event Pilot</div></div>
                      <div><div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)' }}>{execResult.duplicates}</div><div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Duplicates</div></div>
                    </div>
                    <Link href="/data/contacts" style={{ display: 'inline-block', marginTop: '12px', padding: '8px 16px', borderRadius: '8px', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                      View in Contacts
                    </Link>
                  </>
                )}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe who you're looking for… (Enter to send, Shift+Enter for new line)"
                rows={2}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)',
                  fontSize: '15px', color: 'var(--ink)', resize: 'none', outline: 'none',
                  background: 'var(--card)', fontFamily: 'inherit', lineHeight: 1.5,
                }}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                style={{
                  width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                  background: !input.trim() || sending ? 'rgba(90,169,242,0.2)' : 'var(--teal-mid)',
                  border: 'none', cursor: !input.trim() || sending ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="16" height="16" fill="none" stroke={!input.trim() || sending ? 'var(--ink4)' : 'var(--teal-light)'} strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
