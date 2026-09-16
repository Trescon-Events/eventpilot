'use client'

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Input } from '@/app/components/ui'

type ContactRow = {
  id: string; email: string | null; first_name: string | null; last_name: string | null
  linkedin_url: string | null; hubspot_contact_id: string | null; created_at: string
  bio: string | null; photo_url: string | null
  crm_companies: { id: string; name: string; domain: string | null } | null
}
type EventLink = { id: string; role: string; created_at: string; events: { id: string; name: string; city: string | null } | null }
type ContactDetail = ContactRow & { event_links: EventLink[] }

export default function CrmContactsPage() {
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ContactDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    const res = await fetch(`/api/crm/contacts?search=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({ contacts: [], total: 0 }))
    setContacts(res.contacts ?? [])
    setTotal(res.total ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search, load])

  async function openContact(id: string) {
    setDetailLoading(true)
    const res = await fetch(`/api/crm/contacts/${id}`).then(r => r.json()).catch(() => null)
    setSelected(res)
    setDetailLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="CRM Admin / Contacts"
        title="Contacts"
        description="Every person onboarded across all events — deduped by email. Click a row to see which events they're linked to and in what role."
        backHref="/admin/crm"
        backLabel="Back to CRM Admin"
      />
      <div style={{ padding: '24px 32px', maxWidth: '1100px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: '14px', width: '100%' }} />
          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
          ) : contacts.length === 0 ? (
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No contacts yet. New speaker/sponsor-contact onboardings will appear here automatically.</div>
          ) : (
            <div style={{ display: 'grid', gap: '6px' }}>
              {contacts.map(c => (
                <div key={c.id} onClick={() => openContact(c.id)} style={{ cursor: 'pointer', borderRadius: '12px', outline: selected?.id === c.id ? '1.5px solid var(--teal-mid)' : 'none' }}>
                  <Card padded>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '(no name)'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{c.email ?? 'no email captured'}{c.crm_companies ? ` · ${c.crm_companies.name}` : ''}</div>
                      </div>
                      {c.hubspot_contact_id && <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>HubSpot synced</span>}
                    </div>
                  </Card>
                </div>
              ))}
              {total > contacts.length && <div style={{ fontSize: '11px', color: 'var(--ink4)', textAlign: 'center', padding: '8px' }}>{contacts.length} of {total} shown — refine your search to narrow further.</div>}
            </div>
          )}
        </div>

        <div style={{ width: '360px', flexShrink: 0, position: 'sticky', top: '24px' }}>
          {detailLoading ? (
            <Card padded><div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Loading…</div></Card>
          ) : selected ? (
            <Card padded>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                {selected.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-only detail panel, not worth next/image's config for a single thumbnail
                  <img src={selected.photo_url} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>{[selected.first_name, selected.last_name].filter(Boolean).join(' ') || '(no name)'}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '2px' }}>{selected.email ?? 'no email captured'}</div>
                  {selected.crm_companies && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '2px' }}>{selected.crm_companies.name}{selected.crm_companies.domain ? ` (${selected.crm_companies.domain})` : ''}</div>}
                  {selected.linkedin_url && <a href={selected.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', color: 'var(--teal-mid)' }}>LinkedIn ↗</a>}
                </div>
              </div>

              {selected.bio && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '0.6px', textTransform: 'uppercase', margin: '16px 0 6px' }}>Master Bio</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>{selected.bio}</div>
                </>
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
            <Card padded><div style={{ fontSize: '12px', color: 'var(--ink4)' }}>Select a contact to see details.</div></Card>
          )}
        </div>
      </div>
    </div>
  )
}
