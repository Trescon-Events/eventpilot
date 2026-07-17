'use client'

import { useState } from 'react'

interface Contact {
  id:              string
  property_values: Record<string, string>
  linkedin_url?:   string | null
}

interface Brief {
  brief:        string
  opening_line: string
  fit_score:    number
  fit_reasons:  string[]
  flags:        string[]
}

function scoreColor(s: number) {
  if (s >= 75) return 'var(--success)'
  if (s >= 50) return 'var(--amber)'
  if (s >= 25) return 'var(--orange)'
  return 'var(--red)'
}

function scoreLabel(s: number) {
  if (s >= 75) return 'Strong fit'
  if (s >= 50) return 'Good fit'
  if (s >= 25) return 'Weak fit'
  return 'Poor fit'
}

export default function ScoringPage() {
  const [search,    setSearch]    = useState('')
  const [contacts,  setContacts]  = useState<Contact[]>([])
  const [searching, setSearching] = useState(false)

  const [selected, setSelected] = useState<Contact | null>(null)
  const [event,    setEvent]    = useState('')
  const [brief,    setBrief]    = useState<Brief | null>(null)
  const [running,  setRunning]  = useState(false)
  const [error,    setError]    = useState('')

  async function doSearch() {
    if (!search.trim()) return
    setSearching(true)
    const res  = await fetch(`/api/data/contacts?q=${encodeURIComponent(search)}&limit=8`).then(r => r.json()).catch(() => ({ contacts: [] }))
    setContacts(res.contacts ?? [])
    setSearching(false)
  }

  async function runBrief() {
    if (!selected) return
    setRunning(true)
    setError('')
    setBrief(null)
    const res  = await fetch('/api/data/research-brief', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contact: selected, event_name: event.trim() || undefined }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setRunning(false); return }
    setBrief(data)
    setRunning(false)
  }

  function pick(c: Contact) {
    setSelected(c)
    setContacts([])
    setSearch('')
    setBrief(null)
    setError('')
  }

  const pv = selected?.property_values ?? {}
  const selName = [pv.firstName, pv.lastName].filter(Boolean).join(' ') || pv.email || 'Unknown'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1px solid var(--border)',
    borderRadius: '9px', fontSize: '14px', color: 'var(--ink)',
    background: 'var(--surface)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Contact Scoring</span>
        <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>AI fit score + research brief for any contact</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px' }}>

        {/* Contact search */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '12px' }}>Select Contact</div>

          {selected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'rgba(18,201,189,0.06)', border: '1px solid rgba(18,201,189,0.2)', borderRadius: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{selName}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '2px' }}>
                  {[pv.title, pv.companyName].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button onClick={() => { setSelected(null); setBrief(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', fontSize: '13px' }}>Change</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                  placeholder="Search by name, email or company…"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={doSearch} disabled={searching} style={{ padding: '10px 16px', borderRadius: '9px', border: 'none', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {searching ? '…' : 'Search'}
                </button>
              </div>
              {contacts.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 10, overflow: 'hidden' }}>
                  {contacts.map((c, i) => {
                    const cv = c.property_values ?? {}
                    const n  = [cv.firstName, cv.lastName].filter(Boolean).join(' ') || cv.email || 'Unknown'
                    return (
                      <div
                        key={c.id}
                        onClick={() => pick(c)}
                        style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: i < contacts.length - 1 ? '1px solid var(--border)' : 'none' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{n}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{[cv.title, cv.companyName].filter(Boolean).join(' · ')}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1.5px', display: 'block', marginBottom: '6px' }}>Event Context (optional)</label>
              <input
                value={event}
                onChange={e => setEvent(e.target.value)}
                placeholder="e.g. AI2047 Dubai Summit"
                style={inputStyle}
              />
            </div>
          )}

          {selected && (
            <button
              onClick={runBrief}
              disabled={running}
              style={{ marginTop: '14px', width: '100%', padding: '11px', borderRadius: '10px', border: 'none', background: running ? 'rgba(18,201,189,0.3)' : 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '14px', fontWeight: 700, cursor: running ? 'default' : 'pointer' }}
            >
              {running ? 'Analysing contact…' : 'Run AI Scoring'}
            </button>
          )}

          {error && (
            <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(241,102,122,0.06)', border: '1px solid rgba(241,102,122,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>
          )}
        </div>

        {/* Brief results */}
        {brief && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Score */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="8"/>
                  <circle cx="40" cy="40" r="34" fill="none" stroke={scoreColor(brief.fit_score)} strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - brief.fit_score / 100)}`}
                    transform="rotate(-90 40 40)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px', fontWeight: 800, color: scoreColor(brief.fit_score) }}>
                  {brief.fit_score}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>{scoreLabel(brief.fit_score)}</div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5 }}>{brief.brief}</div>
              </div>
            </div>

            {/* Opening line */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>Suggested Opening Line</div>
              <div style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.6, fontStyle: 'italic' }}>"{brief.opening_line}"</div>
              <button
                onClick={() => navigator.clipboard.writeText(brief.opening_line)}
                style={{ marginTop: '10px', padding: '5px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '11px', color: 'var(--ink3)', cursor: 'pointer', fontWeight: 600 }}
              >
                Copy
              </button>
            </div>

            {/* Reasons */}
            {brief.fit_reasons?.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Why this score</div>
                {brief.fit_reasons.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                      <svg width="8" height="8" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5 }}>{r}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Flags */}
            {brief.flags?.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid rgba(245,185,77,0.2)', borderRadius: '14px', padding: '18px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Flags</div>
                {brief.flags.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(245,185,77,0.1)', border: '1px solid rgba(245,185,77,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                      <svg width="8" height="8" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="15"/><line x1="12" y1="19" x2="12.01" y2="19"/></svg>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5 }}>{f}</div>
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
