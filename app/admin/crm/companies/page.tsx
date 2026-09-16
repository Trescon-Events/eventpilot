'use client'

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Input } from '@/app/components/ui'

type CompanyRow = { id: string; name: string; domain: string | null; website: string | null; hubspot_company_id: string | null; created_at: string }
type EventLink = { id: string; role: string; created_at: string; events: { id: string; name: string; city: string | null } | null }
type ContactRow = { id: string; email: string | null; first_name: string | null; last_name: string | null }
type CompanyDetail = CompanyRow & { event_links: EventLink[]; contacts: ContactRow[] }

export default function CrmCompaniesPage() {
  const [search, setSearch] = useState('')
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CompanyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    const res = await fetch(`/api/crm/companies?search=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({ companies: [], total: 0 }))
    setCompanies(res.companies ?? [])
    setTotal(res.total ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search, load])

  async function openCompany(id: string) {
    setDetailLoading(true)
    const res = await fetch(`/api/crm/companies/${id}`).then(r => r.json()).catch(() => null)
    setSelected(res)
    setDetailLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="CRM Admin / Companies"
        title="Companies"
        description="Every organization linked to an event — deduped by domain. Click a row to see which events and contacts it's linked to."
        backHref="/admin/crm"
        backLabel="Back to CRM Admin"
      />
      <div style={{ padding: '24px 32px', maxWidth: '1100px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input placeholder="Search by name or domain…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: '14px', width: '100%' }} />
          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
          ) : companies.length === 0 ? (
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No companies yet. New sponsor/partner onboardings will appear here automatically.</div>
          ) : (
            <div style={{ display: 'grid', gap: '6px' }}>
              {companies.map(c => (
                <div key={c.id} onClick={() => openCompany(c.id)} style={{ cursor: 'pointer', borderRadius: '12px', outline: selected?.id === c.id ? '1.5px solid var(--teal-mid)' : 'none' }}>
                  <Card padded>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{c.domain ?? 'no domain captured'}</div>
                      </div>
                      {c.hubspot_company_id && <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>HubSpot synced</span>}
                    </div>
                  </Card>
                </div>
              ))}
              {total > companies.length && <div style={{ fontSize: '11px', color: 'var(--ink4)', textAlign: 'center', padding: '8px' }}>{companies.length} of {total} shown — refine your search to narrow further.</div>}
            </div>
          )}
        </div>

        <div style={{ width: '360px', flexShrink: 0, position: 'sticky', top: '24px' }}>
          {detailLoading ? (
            <Card padded><div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Loading…</div></Card>
          ) : selected ? (
            <Card padded>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>{selected.name}</div>
              {selected.website && <a href={selected.website} target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', color: 'var(--teal-mid)' }}>{selected.domain ?? selected.website} ↗</a>}

              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '0.6px', textTransform: 'uppercase', margin: '16px 0 8px' }}>Contacts</div>
              {selected.contacts.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>No linked contacts.</div>
              ) : (
                <div style={{ display: 'grid', gap: '4px', marginBottom: '4px' }}>
                  {selected.contacts.map(p => (
                    <div key={p.id} style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>{[p.first_name, p.last_name].filter(Boolean).join(' ') || p.email}</div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '0.6px', textTransform: 'uppercase', margin: '16px 0 8px' }}>Events</div>
              {selected.event_links.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>Not linked to any event yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {selected.event_links.map(l => (
                    <div key={l.id} style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>
                      <strong>{l.events?.name ?? 'Unknown event'}</strong> — {l.role}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <Card padded><div style={{ fontSize: '12px', color: 'var(--ink4)' }}>Select a company to see details.</div></Card>
          )}
        </div>
      </div>
    </div>
  )
}
