'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

/* ── Types ── */
interface Contact {
  id: string
  linkedin_url: string | null
  property_values: Record<string, any>
  company_record_id: string | null
  last_enriched_at: string | null
  source_tool: string | null
  created_at: string
  sd_company_records?: { name: string; domain: string | null; property_values: Record<string, any> } | null
}

interface ContactsResponse {
  contacts: Contact[]
  total: number
  page: number
  pages: number
}

interface Brief {
  brief: string
  opening_line: string
  fit_score: number
  fit_reasons: string[]
  flags: string[]
}

/* ── Helpers ── */
const TOOL_LABELS: Record<string, string> = {
  linkedin_enricher: 'LinkedIn',
  smart_lookup:      'Smart Lookup',
  website_finder:    'Website Finder',
  lead_finder:       'Lead Finder',
  email_verifier:    'Email Verifier',
  manual:            'Manual',
}

const SENIORITY_OPTS = ['c_suite', 'vp', 'head', 'director', 'manager', 'individual_contributor']
const TARGET_OPTS    = ['vendorTarget', 'delegateTarget', 'speakerTarget', 'partnershipTarget', 'investorTarget', 'mediaTarget']

function getInitials(pv: Record<string, any>) {
  const f = (pv.firstName ?? '').charAt(0)
  const l = (pv.lastName  ?? '').charAt(0)
  return (f + l).toUpperCase() || '?'
}

function avatarColor(id: string) {
  const colors = ['var(--teal-mid)', 'var(--indigo)', 'var(--amber)', 'var(--success)', 'var(--red)', 'var(--purple)', '#F472B6', 'var(--info)']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

function SeniorityBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    c_suite:  { label: 'C-Suite', color: 'var(--purple)',   bg: 'var(--purple-light)' },
    vp:       { label: 'VP',      color: 'var(--teal-mid)', bg: 'var(--teal-light)' },
    head:     { label: 'Head',    color: 'var(--amber)',    bg: 'var(--amber-light)' },
    director: { label: 'Director', color: 'var(--success)', bg: 'var(--success-light)' },
    manager:  { label: 'Manager', color: 'var(--red)',      bg: 'var(--red-light)' },
  }
  const { label, color, bg } = map[s] ?? { label: s, color: 'var(--ink3)', bg: 'rgba(255,255,255,0.06)' }
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: bg, color }}>
      {label}
    </span>
  )
}

/* ── Contact Detail Panel ── */
function ContactPanel({
  contact, onClose, onUpdate,
}: {
  contact: Contact
  onClose: () => void
  onUpdate: () => void
}) {
  const pv = contact.property_values
  const name = [pv.firstName, pv.lastName].filter(Boolean).join(' ') || 'No name'
  const [brief, setBrief]     = useState<Brief | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'pipeline' | 'history'>('details')
  const [history, setHistory] = useState<any[]>([])
  const [pipeline, setPipeline] = useState<any[]>([])
  const [detailLoaded, setDetailLoaded] = useState(false)

  useEffect(() => {
    if (detailLoaded) return
    fetch(`/api/data/contacts/${contact.id}`)
      .then(r => r.json())
      .then(d => {
        setHistory(d.audit ?? [])
        setPipeline(d.pipeline ?? [])
        setDetailLoaded(true)
      })
  }, [contact.id, detailLoaded])

  const generateBrief = async () => {
    setBriefLoading(true)
    try {
      const res  = await fetch('/api/data/research-brief', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contact }),
      })
      const data = await res.json()
      setBrief(data)
    } finally {
      setBriefLoading(false)
    }
  }

  const fieldRow = (label: string, value: any) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null
    const display = Array.isArray(value) ? value.join(', ') : String(value)
    return (
      <div key={label} style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '13px', color: 'var(--ink3)', minWidth: '130px', flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500, wordBreak: 'break-word' }}>{display}</span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px',
      background: 'var(--card)', borderLeft: '1px solid var(--border)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
      zIndex: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: avatarColor(contact.id),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', fontWeight: 800, color: 'var(--surface)', flexShrink: 0,
            }}>
              {getInitials(pv)}
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>{name}</div>
              <div style={{ fontSize: '13px', color: 'var(--ink2)', marginTop: '2px' }}>{pv.title ?? ''}</div>
              <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>{pv.companyName ?? ''}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--ink3)' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
          {pv.seniority && <SeniorityBadge s={pv.seniority} />}
          {pv.email && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: 'var(--success-light)', color: 'var(--success)' }}>
              Has Email
            </span>
          )}
          {pv.phoneNumber1 && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: 'var(--info-light)', color: 'var(--info)' }}>
              Has Phone
            </span>
          )}
          {contact.source_tool && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--ink3)' }}>
              {TOOL_LABELS[contact.source_tool] ?? contact.source_tool}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
        {(['details', 'pipeline', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px', fontSize: '13px', fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? 'var(--teal-mid)' : 'var(--ink3)',
              background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? 'var(--teal-mid)' : 'transparent'}`,
              cursor: 'pointer', textTransform: 'capitalize', transition: 'color 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '20px 24px', flex: 1 }}>
        {activeTab === 'details' && (
          <>
            <div style={{ marginBottom: '20px' }}>
              {!brief ? (
                <button
                  onClick={generateBrief}
                  disabled={briefLoading}
                  style={{
                    width: '100%', padding: '10px 16px',
                    background: briefLoading ? 'rgba(255,255,255,0.06)' : 'var(--teal-light)',
                    border: '1px solid var(--teal-border)',
                    borderRadius: '10px', cursor: briefLoading ? 'default' : 'pointer',
                    fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  {briefLoading ? 'Generating AI Brief…' : 'Generate AI Research Brief'}
                </button>
              ) : (
                <div style={{ background: 'var(--teal-light)', border: '1px solid var(--teal-border)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <svg width="14" height="14" fill="none" stroke="var(--teal-mid)" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal-mid)', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Research Brief</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>Fit score</span>
                      <span style={{
                        fontSize: '13px', fontWeight: 800,
                        color: brief.fit_score >= 70 ? 'var(--success)' : brief.fit_score >= 50 ? 'var(--amber)' : 'var(--red)',
                      }}>{brief.fit_score}/100</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.65, marginBottom: '12px' }}>{brief.brief}</p>
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Suggested opening</span>
                    <p style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '4px', fontStyle: 'italic', lineHeight: 1.6 }}>"{brief.opening_line}"</p>
                  </div>
                  {brief.flags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {brief.flags.map((f, i) => (
                        <span key={i} style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: 'var(--amber-light)', color: 'var(--amber)', fontWeight: 600 }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Contact Info</div>
              {fieldRow('Email', pv.email)}
              {fieldRow('Phone 1', pv.phoneNumber1)}
              {fieldRow('Phone 2', pv.phoneNumber2)}
              {fieldRow('LinkedIn', pv.personLinkedinUrl ?? contact.linkedin_url)}
              {fieldRow('City', pv.contactCity)}
              {fieldRow('Country', pv.contactCountry)}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Professional</div>
              {fieldRow('Title', pv.title)}
              {fieldRow('Seniority', pv.seniority)}
              {fieldRow('Departments', pv.departments)}
              {fieldRow('Industry L2', pv.contactL2)}
              {fieldRow('Company', pv.companyName)}
            </div>

            {TARGET_OPTS.some(t => pv[t]?.length > 0) && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '10px' }}>Event Tags</div>
                {TARGET_OPTS.map(t => {
                  const arr: string[] = pv[t] ?? []
                  if (!arr.length) return null
                  const label = t.replace('Target', ' Target').replace(/([A-Z])/g, ' $1').trim()
                  return (
                    <div key={t} style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '4px' }}>{label}</div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {arr.map(v => (
                          <span key={v} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'var(--teal-light)', color: 'var(--teal-mid)', fontWeight: 600 }}>
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'pipeline' && (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '16px' }}>
              Pipeline entries track this contact's progress per event.
            </div>
            {pipeline.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink3)', fontSize: '15px' }}>
                No pipeline entries yet.<br/>
                <span style={{ fontSize: '13px' }}>Add this contact to an event pipeline from the main view.</span>
              </div>
            ) : pipeline.map((p: any) => (
              <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', marginBottom: '10px', background: 'var(--card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{p.event_name ?? 'General'}</div>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                    background: p.stage === 'attended' ? 'var(--success-light)' : p.stage === 'registered' ? 'var(--info-light)' : 'rgba(255,255,255,0.06)',
                    color: p.stage === 'attended' ? 'var(--success)' : p.stage === 'registered' ? 'var(--info)' : 'var(--ink3)',
                  }}>
                    {p.stage}
                  </span>
                </div>
                {p.notes && <p style={{ fontSize: '13px', color: 'var(--ink2)', marginTop: '6px' }}>{p.notes}</p>}
                {p.next_action_date && (
                  <div style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '4px' }}>
                    Next action: {new Date(p.next_action_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '16px' }}>
              Field-level change history from all enrichment tools.
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink3)', fontSize: '15px' }}>
                No enrichment history yet.
              </div>
            ) : history.slice(0, 30).map((h: any) => (
              <div key={h.id} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                <div style={{ minWidth: '8px', height: '8px', borderRadius: '50%', background: 'var(--teal-mid)', marginTop: '5px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>{h.field_key}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink2)' }}>
                    {h.old_value ? `${h.old_value} → ` : ''}
                    <span style={{ color: 'var(--success)' }}>{h.new_value}</span>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                  {TOOL_LABELS[h.source_tool] ?? h.source_tool}<br/>
                  {new Date(h.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main Page ── */
export default function ContactsPage() {
  const [contacts, setContacts]       = useState<Contact[]>([])
  const [total, setTotal]             = useState(0)
  const [pages, setPages]             = useState(1)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [q, setQ]                     = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [country, setCountry]         = useState('')
  const [seniority, setSeniority]     = useState('')
  const [source, setSource]           = useState('')
  const [hasEmail, setHasEmail]       = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [exporting, setExporting]     = useState(false)

  const fetchContacts = useCallback(async (pg = 1) => {
    setLoading(true)
    const params = new URLSearchParams({
      page:  String(pg),
      limit: '25',
      ...(q         && { q }),
      ...(country   && { country }),
      ...(seniority && { seniority }),
      ...(source    && { source }),
      ...(hasEmail  && { has_email: hasEmail }),
    })
    try {
      const res: ContactsResponse = await fetch(`/api/data/contacts?${params}`).then(r => r.json())
      setContacts(res.contacts ?? [])
      setTotal(res.total ?? 0)
      setPages(res.pages ?? 1)
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }, [q, country, seniority, source, hasEmail])

  useEffect(() => { fetchContacts(1) }, [fetchContacts])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setQ(searchInput)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const selectAll = () => {
    if (selected.size === contacts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(contacts.map(c => c.id)))
    }
  }

  const exportCSV = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/data/export', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type: 'contacts',
          ids:  selected.size > 0 ? Array.from(selected) : undefined,
        }),
      })
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const filterCount = [country, seniority, source, hasEmail].filter(Boolean).length

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px 8px 32px', borderRadius: '8px',
    border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
    outline: 'none', background: 'var(--card)', boxSizing: 'border-box',
    width: '100%',
  }

  const selectStyle: React.CSSProperties = {
    padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)',
    fontSize: '13px', color: 'var(--ink)', background: 'var(--card)', cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Contacts</span>
          <span style={{ fontSize: '13px', color: 'var(--ink3)', marginLeft: '4px' }}>{total.toLocaleString()} records</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={exportCSV}
            disabled={exporting}
            style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              background: exporting ? 'rgba(255,255,255,0.06)' : 'var(--teal-mid)',
              color: exporting ? 'var(--ink3)' : 'var(--teal-light)',
              border: 'none', cursor: exporting ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {exporting ? 'Exporting…' : selected.size > 0 ? `Export ${selected.size}` : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Search + Filters bar */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', flex: '1', minWidth: '280px', maxWidth: '400px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="14" height="14" fill="none" stroke="var(--ink3)" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search name, email, title, company…"
              style={inputStyle}
            />
          </div>
          <button type="submit" style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--teal-mid)', color: 'var(--teal-light)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }}>
            Search
          </button>
        </form>

        <select value={seniority} onChange={e => setSeniority(e.target.value)} style={selectStyle}>
          <option value="">All Seniority</option>
          {SENIORITY_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={source} onChange={e => setSource(e.target.value)} style={selectStyle}>
          <option value="">All Sources</option>
          {Object.entries(TOOL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={hasEmail} onChange={e => setHasEmail(e.target.value)} style={selectStyle}>
          <option value="">All Emails</option>
          <option value="true">Has Email</option>
          <option value="false">No Email</option>
        </select>

        {filterCount > 0 && (
          <button onClick={() => { setCountry(''); setSeniority(''); setSource(''); setHasEmail('') }} style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--red-light)', color: 'var(--red)', border: '1px solid var(--red-border)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            Clear {filterCount} filter{filterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 140px 100px 100px', gap: '0', padding: '10px 16px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
            <div>
              <input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={selectAll} style={{ cursor: 'pointer', accentColor: 'var(--teal-mid)' }} />
            </div>
            {['Name / Title', 'Company', 'Email / Phone', 'Event Tags', 'Source', 'Enriched'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink3)', fontSize: '15px' }}>Loading contacts…</div>
          ) : contacts.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink3)', fontSize: '15px' }}>
              {q || filterCount > 0 ? 'No contacts match your search.' : 'No contacts yet. Run an extraction tool or use Lead Finder to add contacts.'}
            </div>
          ) : contacts.map(c => {
            const pv   = c.property_values
            const name = [pv.firstName, pv.lastName].filter(Boolean).join(' ') || 'No name'
            const tags: string[] = [
              ...(pv.vendorTarget ?? []),
              ...(pv.delegateTarget ?? []),
              ...(pv.speakerTarget ?? []),
            ].slice(0, 3)

            return (
              <div
                key={c.id}
                onClick={() => setSelectedContact(c)}
                style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 140px 100px 100px',
                  padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: selected.has(c.id) ? 'var(--teal-light)' : selectedContact?.id === c.id ? 'var(--card-hi)' : 'var(--card)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!selected.has(c.id) && selectedContact?.id !== c.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { if (!selected.has(c.id) && selectedContact?.id !== c.id) (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
              >
                <div onClick={e => { e.stopPropagation(); toggleSelect(c.id) }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => {}} style={{ cursor: 'pointer', accentColor: 'var(--teal-mid)' }} />
                </div>

                {/* Name / Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', background: avatarColor(c.id),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 800, color: 'var(--surface)', flexShrink: 0,
                  }}>
                    {getInitials(pv)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pv.title ?? ''}</div>
                  </div>
                </div>

                {/* Company */}
                <div style={{ fontSize: '13px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                  {pv.companyName ?? c.sd_company_records?.name ?? '—'}
                  {pv.contactCountry && <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{pv.contactCountry}</div>}
                </div>

                {/* Email / Phone */}
                <div style={{ alignSelf: 'center' }}>
                  {pv.email ? (
                    <div style={{ fontSize: '12px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pv.email}</div>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--red)', background: 'var(--red-light)', padding: '1px 6px', borderRadius: '6px' }}>No email</span>
                  )}
                  {pv.phoneNumber1 && <div style={{ fontSize: '12px', color: 'var(--ink2)' }}>{pv.phoneNumber1}</div>}
                </div>

                {/* Event Tags */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignSelf: 'center' }}>
                  {tags.length > 0 ? tags.map(t => (
                    <span key={t} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: 'var(--teal-light)', color: 'var(--teal-mid)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {t.length > 12 ? t.slice(0, 12) + '…' : t}
                    </span>
                  )) : <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>—</span>}
                </div>

                {/* Source */}
                <div style={{ alignSelf: 'center' }}>
                  {c.source_tool && (
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'var(--ink3)', fontWeight: 600 }}>
                      {TOOL_LABELS[c.source_tool] ?? c.source_tool}
                    </span>
                  )}
                </div>

                {/* Last enriched */}
                <div style={{ fontSize: '12px', color: 'var(--ink3)', alignSelf: 'center' }}>
                  {c.last_enriched_at ? new Date(c.last_enriched_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
            <button onClick={() => fetchContacts(page - 1)} disabled={page === 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', cursor: page === 1 ? 'default' : 'pointer', fontSize: '13px', color: page === 1 ? 'var(--ink4)' : 'var(--ink)' }}>
              Previous
            </button>
            <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>Page {page} of {pages}</span>
            <button onClick={() => fetchContacts(page + 1)} disabled={page === pages} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', cursor: page === pages ? 'default' : 'pointer', fontSize: '13px', color: page === pages ? 'var(--ink4)' : 'var(--ink)' }}>
              Next
            </button>
          </div>
        )}
      </div>

      {/* Contact detail panel */}
      {selectedContact && (
        <>
          <div onClick={() => setSelectedContact(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }} />
          <ContactPanel
            contact={selectedContact}
            onClose={() => setSelectedContact(null)}
            onUpdate={() => fetchContacts(page)}
          />
        </>
      )}
    </div>
  )
}
