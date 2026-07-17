'use client'

import { useState, useEffect, useCallback } from 'react'

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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px 8px 32px', borderRadius: '8px',
    border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
    outline: 'none', background: 'var(--card)', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Companies</span>
          <span style={{ fontSize: '13px', color: 'var(--ink4)', marginLeft: '4px' }}>{total.toLocaleString()} records</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={exportCSV} disabled={exporting} style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, background: exporting ? 'rgba(18,201,189,0.2)' : 'var(--teal-mid)', color: exporting ? 'var(--ink4)' : 'var(--teal-light)', border: 'none', cursor: exporting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {exporting ? 'Exporting…' : selected.size > 0 ? `Export ${selected.size}` : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', flex: 1, maxWidth: '400px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="14" height="14" fill="none" stroke="var(--ink4)" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search company name, domain, industry…" style={inputStyle} />
          </div>
          <button type="submit" style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--teal-mid)', color: 'var(--teal-light)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>Search</button>
        </form>
        <select value={hasWebsite} onChange={e => setHasWebsite(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)', background: 'var(--card)', cursor: 'pointer' }}>
          <option value="">All Companies</option>
          <option value="true">Has Website</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 160px 160px 100px 120px', padding: '10px 16px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
            <div><input type="checkbox" checked={selected.size === companies.length && companies.length > 0} onChange={() => { selected.size === companies.length ? setSelected(new Set()) : setSelected(new Set(companies.map(c => c.id))) }} style={{ cursor: 'pointer', accentColor: 'var(--teal-mid)' }} /></div>
            {['Company', 'Industry', 'Country', 'Source', 'Last Updated'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)', fontSize: '15px' }}>Loading companies…</div>
          ) : companies.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)', fontSize: '15px' }}>No companies found.</div>
          ) : companies.map(c => {
            const pv = c.property_values
            return (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 160px 160px 100px 120px', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: selected.has(c.id) ? 'rgba(18,201,189,0.06)' : 'var(--card)' }}
                onMouseEnter={e => { if (!selected.has(c.id)) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { if (!selected.has(c.id)) (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
              >
                <div onClick={() => toggleSelect(c.id)} style={{ cursor: 'pointer' }}><input type="checkbox" checked={selected.has(c.id)} onChange={() => {}} style={{ cursor: 'pointer', accentColor: 'var(--teal-mid)' }} /></div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      {c.domain ? (
                        <img src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=32`} width="20" height="20" style={{ borderRadius: '4px' }} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <svg width="14" height="14" fill="none" stroke="var(--ink4)" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>{c.domain ?? pv.website ?? ''}</div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', alignSelf: 'center' }}>{pv.industry ?? '—'}</div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', alignSelf: 'center' }}>{pv.companyCountry ?? pv.hqCountry ?? '—'}</div>
                <div style={{ alignSelf: 'center' }}>
                  {c.source_tool && <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'var(--ink3)', fontWeight: 600 }}>{c.source_tool.replace('_', ' ')}</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink4)', alignSelf: 'center' }}>
                  {c.last_enriched_at ? new Date(c.last_enriched_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                </div>
              </div>
            )
          })}
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
            <button onClick={() => fetchCompanies(page - 1)} disabled={page === 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', cursor: page === 1 ? 'default' : 'pointer', fontSize: '13px', color: page === 1 ? 'var(--border)' : 'var(--ink)' }}>Previous</button>
            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Page {page} of {pages}</span>
            <button onClick={() => fetchCompanies(page + 1)} disabled={page === pages} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', cursor: page === pages ? 'default' : 'pointer', fontSize: '13px', color: page === pages ? 'var(--border)' : 'var(--ink)' }}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}
