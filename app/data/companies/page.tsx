'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Company {
  id: string
  name: string
  domain: string | null
  website: string | null
  property_values: Record<string, any>
  last_enriched_at: string | null
  source_tool: string | null
  created_at: string
}

const NAV = [
  { label: 'Contacts', href: '/data' },
  { label: 'Companies', href: '/data/companies', active: true },
  { label: 'Lead Finder', href: '/data/lead-finder' },
  { label: 'Tools', href: '/data/tools' },
  { label: 'Analytics', href: '/data/analytics' },
]

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [total, setTotal]         = useState(0)
  const [pages, setPages]         = useState(1)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ]                 = useState('')
  const [hasWebsite, setHasWebsite] = useState('')
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const fetchCompanies = useCallback(async (pg = 1) => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(pg), limit: '25',
      ...(q && { q }),
      ...(hasWebsite && { has_website: hasWebsite }),
    })
    try {
      const res = await fetch(`/api/data/companies?${params}`).then(r => r.json())
      setCompanies(res.companies ?? [])
      setTotal(res.total ?? 0)
      setPages(res.pages ?? 1)
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }, [q, hasWebsite])

  useEffect(() => { fetchCompanies(1) }, [fetchCompanies])

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setQ(searchInput) }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const exportCSV = async () => {
    setExporting(true)
    try {
      const res  = await fetch('/api/data/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'companies', ids: selected.size > 0 ? Array.from(selected) : undefined }),
      })
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `companies-${new Date().toISOString().split('T')[0]}.csv`; a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Nav */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Data Intelligence</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
          {NAV.map(tab => (
            <Link key={tab.href} href={tab.href} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: (tab as any).active ? 700 : 500, background: (tab as any).active ? 'rgba(0,165,163,0.1)' : 'transparent', color: (tab as any).active ? '#00A5A3' : '#6B7280', textDecoration: 'none' }}>{tab.label}</Link>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#6B7280' }}>{total.toLocaleString()} companies</span>
          <button onClick={exportCSV} disabled={exporting} style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, background: exporting ? '#F3F4F6' : '#0F1923', color: exporting ? '#9CA3AF' : '#FFFFFF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {exporting ? 'Exporting…' : selected.size > 0 ? `Export ${selected.size}` : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '12px 24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', flex: 1, maxWidth: '400px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" fill="none" stroke="#9CA3AF" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search company name, domain, industry…" style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', outline: 'none', background: '#FAFBFC', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" style={{ padding: '8px 14px', borderRadius: '8px', background: '#00A5A3', color: '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>Search</button>
        </form>
        <select value={hasWebsite} onChange={e => setHasWebsite(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', background: '#FAFBFC', cursor: 'pointer' }}>
          <option value="">All Companies</option>
          <option value="true">Has Website</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 160px 160px 100px 120px', padding: '10px 16px', background: '#F8FAFB', borderBottom: '1px solid #DDE8EE' }}>
            <div><input type="checkbox" checked={selected.size === companies.length && companies.length > 0} onChange={() => { selected.size === companies.length ? setSelected(new Set()) : setSelected(new Set(companies.map(c => c.id))) }} style={{ cursor: 'pointer' }} /></div>
            {['Company', 'Industry', 'Country', 'Source', 'Last Updated'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>Loading companies…</div>
          ) : companies.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>No companies found.</div>
          ) : companies.map(c => {
            const pv = c.property_values
            return (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 160px 160px 100px 120px', padding: '12px 16px', borderBottom: '1px solid #F3F4F6', background: selected.has(c.id) ? 'rgba(0,165,163,0.04)' : '#FFFFFF', cursor: 'default' }}
                onMouseEnter={e => { if (!selected.has(c.id)) (e.currentTarget as HTMLElement).style.background = '#FAFBFC' }}
                onMouseLeave={e => { if (!selected.has(c.id)) (e.currentTarget as HTMLElement).style.background = '#FFFFFF' }}
              >
                <div onClick={() => toggleSelect(c.id)} style={{ cursor: 'pointer' }}><input type="checkbox" checked={selected.has(c.id)} onChange={() => {}} style={{ cursor: 'pointer' }} /></div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      {c.domain ? (
                        <img src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=32`} width="20" height="20" style={{ borderRadius: '4px' }} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <svg width="14" height="14" fill="none" stroke="#9CA3AF" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{c.name}</div>
                      <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{c.domain ?? pv.website ?? ''}</div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280', alignSelf: 'center' }}>{pv.industry ?? '—'}</div>
                <div style={{ fontSize: '13px', color: '#6B7280', alignSelf: 'center' }}>{pv.companyCountry ?? pv.hqCountry ?? '—'}</div>
                <div style={{ alignSelf: 'center' }}>
                  {c.source_tool && <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '8px', background: '#F3F4F6', color: '#6B7280', fontWeight: 600 }}>{c.source_tool.replace('_', ' ')}</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', alignSelf: 'center' }}>
                  {c.last_enriched_at ? new Date(c.last_enriched_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                </div>
              </div>
            )
          })}
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
            <button onClick={() => fetchCompanies(page - 1)} disabled={page === 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: page === 1 ? 'default' : 'pointer', fontSize: '13px', color: page === 1 ? '#D1D5DB' : '#0F1923' }}>Previous</button>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>Page {page} of {pages}</span>
            <button onClick={() => fetchCompanies(page + 1)} disabled={page === pages} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', cursor: page === pages ? 'default' : 'pointer', fontSize: '13px', color: page === pages ? '#D1D5DB' : '#0F1923' }}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}
