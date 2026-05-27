'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  const colors = ['#00A5A3', '#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#0EA5E9']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

function SeniorityBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    c_suite:  { label: 'C-Suite', color: '#6D28D9', bg: 'rgba(109,40,217,0.1)' },
    vp:       { label: 'VP',      color: '#2563EB', bg: 'rgba(37,99,235,0.1)' },
    head:     { label: 'Head',    color: '#D97706', bg: 'rgba(217,119,6,0.1)' },
    director: { label: 'Director', color: '#059669', bg: 'rgba(5,150,105,0.1)' },
    manager:  { label: 'Manager', color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
  }
  const { label, color, bg } = map[s] ?? { label: s, color: '#6B7280', bg: '#F3F4F6' }
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
      <div key={label} style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
        <span style={{ fontSize: '13px', color: '#6B7280', minWidth: '130px', flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: '13px', color: '#0F1923', fontWeight: 500, wordBreak: 'break-word' }}>{display}</span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px',
      background: '#FFFFFF', borderLeft: '1px solid #DDE8EE',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
      zIndex: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDE8EE', background: '#FAFBFC' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: avatarColor(contact.id),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', fontWeight: 800, color: '#FFFFFF', flexShrink: 0,
            }}>
              {getInitials(pv)}
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F1923' }}>{name}</div>
              <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>{pv.title ?? ''}</div>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>{pv.companyName ?? ''}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#6B7280' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Quick badges */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
          {pv.seniority && <SeniorityBadge s={pv.seniority} />}
          {pv.email && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
              Has Email
            </span>
          )}
          {pv.phoneNumber1 && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', color: '#2563EB' }}>
              Has Phone
            </span>
          )}
          {contact.source_tool && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: '#F3F4F6', color: '#6B7280' }}>
              {TOOL_LABELS[contact.source_tool] ?? contact.source_tool}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #DDE8EE', padding: '0 24px' }}>
        {(['details', 'pipeline', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px', fontSize: '13px', fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? '#00A5A3' : '#6B7280',
              background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? '#00A5A3' : 'transparent'}`,
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
            {/* AI Research Brief */}
            <div style={{ marginBottom: '20px' }}>
              {!brief ? (
                <button
                  onClick={generateBrief}
                  disabled={briefLoading}
                  style={{
                    width: '100%', padding: '10px 16px',
                    background: briefLoading ? '#F3F4F6' : 'rgba(0,165,163,0.08)',
                    border: '1px solid rgba(0,165,163,0.3)',
                    borderRadius: '10px', cursor: briefLoading ? 'default' : 'pointer',
                    fontSize: '13px', fontWeight: 700, color: '#00A5A3',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  {briefLoading ? 'Generating AI Brief…' : 'Generate AI Research Brief'}
                </button>
              ) : (
                <div style={{ background: 'rgba(0,165,163,0.05)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <svg width="14" height="14" fill="none" stroke="#00A5A3" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#00A5A3', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Research Brief</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>Fit score</span>
                      <span style={{
                        fontSize: '13px', fontWeight: 800,
                        color: brief.fit_score >= 70 ? '#059669' : brief.fit_score >= 50 ? '#D97706' : '#DC2626',
                      }}>{brief.fit_score}/100</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '13px', color: '#0F1923', lineHeight: 1.65, marginBottom: '12px' }}>{brief.brief}</p>
                  <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px' }}>Suggested opening</span>
                    <p style={{ fontSize: '13px', color: '#0F1923', marginTop: '4px', fontStyle: 'italic', lineHeight: 1.6 }}>"{brief.opening_line}"</p>
                  </div>
                  {brief.flags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {brief.flags.map((f, i) => (
                        <span key={i} style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', color: '#D97706', fontWeight: 600 }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Contact info */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6B7280', marginBottom: '8px' }}>Contact Info</div>
              {fieldRow('Email', pv.email)}
              {fieldRow('Phone 1', pv.phoneNumber1)}
              {fieldRow('Phone 2', pv.phoneNumber2)}
              {fieldRow('LinkedIn', pv.personLinkedinUrl ?? contact.linkedin_url)}
              {fieldRow('City', pv.contactCity)}
              {fieldRow('Country', pv.contactCountry)}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6B7280', marginBottom: '8px' }}>Professional</div>
              {fieldRow('Title', pv.title)}
              {fieldRow('Seniority', pv.seniority)}
              {fieldRow('Departments', pv.departments)}
              {fieldRow('Industry L2', pv.contactL2)}
              {fieldRow('Company', pv.companyName)}
            </div>

            {/* Event tags */}
            {TARGET_OPTS.some(t => pv[t]?.length > 0) && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6B7280', marginBottom: '10px' }}>Event Tags</div>
                {TARGET_OPTS.map(t => {
                  const arr: string[] = pv[t] ?? []
                  if (!arr.length) return null
                  const label = t.replace('Target', ' Target').replace(/([A-Z])/g, ' $1').trim()
                  return (
                    <div key={t} style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>{label}</div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {arr.map(v => (
                          <span key={v} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(0,165,163,0.1)', color: '#00A5A3', fontWeight: 600 }}>
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
            <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '16px' }}>
              Pipeline entries track this contact's progress per event.
            </div>
            {pipeline.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#6B7280', fontSize: '14px' }}>
                No pipeline entries yet.<br/>
                <span style={{ fontSize: '13px' }}>Add this contact to an event pipeline from the main view.</span>
              </div>
            ) : pipeline.map((p: any) => (
              <div key={p.id} style={{ border: '1px solid #DDE8EE', borderRadius: '10px', padding: '12px 16px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{p.event_name ?? 'General'}</div>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                    background: p.stage === 'attended' ? 'rgba(16,185,129,0.1)' : p.stage === 'registered' ? 'rgba(59,130,246,0.1)' : '#F3F4F6',
                    color: p.stage === 'attended' ? '#059669' : p.stage === 'registered' ? '#2563EB' : '#6B7280',
                  }}>
                    {p.stage}
                  </span>
                </div>
                {p.notes && <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '6px' }}>{p.notes}</p>}
                {p.next_action_date && (
                  <div style={{ fontSize: '12px', color: '#D97706', marginTop: '4px' }}>
                    Next action: {new Date(p.next_action_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '16px' }}>
              Field-level change history from all enrichment tools.
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#6B7280', fontSize: '14px' }}>
                No enrichment history yet.
              </div>
            ) : history.slice(0, 30).map((h: any) => (
              <div key={h.id} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F3F4F6', alignItems: 'flex-start' }}>
                <div style={{ minWidth: '8px', height: '8px', borderRadius: '50%', background: '#00A5A3', marginTop: '5px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F1923' }}>{h.field_key}</div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    {h.old_value ? `${h.old_value} → ` : ''}
                    <span style={{ color: '#059669' }}>{h.new_value}</span>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
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
export default function DataPage() {
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

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top nav */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Data Intelligence</span>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
          {[
            { label: 'Contacts', href: '/data', active: true },
            { label: 'Companies', href: '/data/companies', active: false },
            { label: 'Lead Finder', href: '/data/lead-finder', active: false },
            { label: 'Tools', href: '/data/tools', active: false },
            { label: 'Analytics', href: '/data/analytics', active: false },
          ].map(tab => (
            <Link key={tab.href} href={tab.href} style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: tab.active ? 700 : 500,
              background: tab.active ? 'rgba(0,165,163,0.1)' : 'transparent',
              color: tab.active ? '#00A5A3' : '#6B7280',
              textDecoration: 'none', transition: 'background 0.15s',
            }}>
              {tab.label}
            </Link>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#6B7280' }}>
            {total.toLocaleString()} contacts
          </span>
          <button
            onClick={exportCSV}
            disabled={exporting}
            style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              background: exporting ? '#F3F4F6' : '#0F1923', color: exporting ? '#9CA3AF' : '#FFFFFF',
              border: 'none', cursor: exporting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
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
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '12px 24px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', flex: '1', minWidth: '280px', maxWidth: '400px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" fill="none" stroke="#9CA3AF" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search name, email, title, company…"
              style={{
                width: '100%', padding: '8px 10px 8px 32px', borderRadius: '8px',
                border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923',
                outline: 'none', background: '#FAFBFC', boxSizing: 'border-box',
              }}
            />
          </div>
          <button type="submit" style={{ padding: '8px 14px', borderRadius: '8px', background: '#00A5A3', color: '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }}>
            Search
          </button>
        </form>

        {/* Filters */}
        <select value={seniority} onChange={e => setSeniority(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923', background: '#FAFBFC', cursor: 'pointer' }}>
          <option value="">All Seniority</option>
          {SENIORITY_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={source} onChange={e => setSource(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923', background: '#FAFBFC', cursor: 'pointer' }}>
          <option value="">All Sources</option>
          {Object.entries(TOOL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={hasEmail} onChange={e => setHasEmail(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', color: '#0F1923', background: '#FAFBFC', cursor: 'pointer' }}>
          <option value="">All Emails</option>
          <option value="true">Has Email</option>
          <option value="false">No Email</option>
        </select>

        {filterCount > 0 && (
          <button onClick={() => { setCountry(''); setSeniority(''); setSource(''); setHasEmail('') }} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            Clear {filterCount} filter{filterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 140px 100px 100px', gap: '0', padding: '10px 16px', background: '#F8FAFB', borderBottom: '1px solid #DDE8EE' }}>
            <div>
              <input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={selectAll} style={{ cursor: 'pointer' }} />
            </div>
            {['Name / Title', 'Company', 'Email / Phone', 'Event Tags', 'Source', 'Enriched'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>Loading contacts…</div>
          ) : contacts.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>
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
                  padding: '12px 16px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer',
                  background: selected.has(c.id) ? 'rgba(0,165,163,0.04)' : selectedContact?.id === c.id ? '#FAFBFC' : '#FFFFFF',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!selected.has(c.id) && selectedContact?.id !== c.id) (e.currentTarget as HTMLElement).style.background = '#FAFBFC' }}
                onMouseLeave={e => { if (!selected.has(c.id) && selectedContact?.id !== c.id) (e.currentTarget as HTMLElement).style.background = '#FFFFFF' }}
              >
                <div onClick={e => { e.stopPropagation(); toggleSelect(c.id) }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => {}} style={{ cursor: 'pointer' }} />
                </div>

                {/* Name / Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', background: avatarColor(c.id),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 800, color: '#FFFFFF', flexShrink: 0,
                  }}>
                    {getInitials(pv)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pv.title ?? ''}</div>
                  </div>
                </div>

                {/* Company */}
                <div style={{ fontSize: '13px', color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                  {pv.companyName ?? c.sd_company_records?.name ?? '—'}
                  {pv.contactCountry && <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{pv.contactCountry}</div>}
                </div>

                {/* Email / Phone */}
                <div style={{ alignSelf: 'center' }}>
                  {pv.email ? (
                    <div style={{ fontSize: '12px', color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pv.email}</div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#DC2626', background: 'rgba(239,68,68,0.08)', padding: '1px 6px', borderRadius: '6px' }}>No email</span>
                  )}
                  {pv.phoneNumber1 && <div style={{ fontSize: '12px', color: '#6B7280' }}>{pv.phoneNumber1}</div>}
                </div>

                {/* Event Tags */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignSelf: 'center' }}>
                  {tags.length > 0 ? tags.map(t => (
                    <span key={t} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: 'rgba(0,165,163,0.1)', color: '#00A5A3', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {t.length > 12 ? t.slice(0, 12) + '…' : t}
                    </span>
                  )) : <span style={{ fontSize: '12px', color: '#D1D5DB' }}>—</span>}
                </div>

                {/* Source */}
                <div style={{ alignSelf: 'center' }}>
                  {c.source_tool && (
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '8px', background: '#F3F4F6', color: '#6B7280', fontWeight: 600 }}>
                      {TOOL_LABELS[c.source_tool] ?? c.source_tool}
                    </span>
                  )}
                </div>

                {/* Last enriched */}
                <div style={{ fontSize: '12px', color: '#9CA3AF', alignSelf: 'center' }}>
                  {c.last_enriched_at ? new Date(c.last_enriched_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
            <button onClick={() => fetchContacts(page - 1)} disabled={page === 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: page === 1 ? 'default' : 'pointer', fontSize: '13px', color: page === 1 ? '#D1D5DB' : '#0F1923' }}>
              Previous
            </button>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>Page {page} of {pages}</span>
            <button onClick={() => fetchContacts(page + 1)} disabled={page === pages} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: page === pages ? 'default' : 'pointer', fontSize: '13px', color: page === pages ? '#D1D5DB' : '#0F1923' }}>
              Next
            </button>
          </div>
        )}
      </div>

      {/* Contact detail panel */}
      {selectedContact && (
        <>
          <div onClick={() => setSelectedContact(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 199 }} />
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
