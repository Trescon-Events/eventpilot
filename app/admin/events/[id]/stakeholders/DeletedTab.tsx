'use client'

import { useEffect, useState } from 'react'
import { Card, Button, Input } from '@/app/components/ui'

/* Deleted speakers/partners — restore view for the Hub's soft-delete
   (2026-07-28, see DeleteConfirmModal.tsx for the full rationale). Reuses
   the existing announcement_status='archived' + ?status=archived query
   support already in both list routes rather than a new column — restoring
   just PATCHes announcement_status back and re-enables `active` in case
   "Also remove from the live public event website" was checked at delete
   time (also_restore_to_website always sets active:true back regardless,
   so Restore is a full, predictable undo either way). */

type DeletedItem = {
  kind: 'speaker' | 'partner'
  id: string
  name: string
  subtitle: string
  thumb: string | null
}

type RawSpeaker = { id: string; full_name: string; job_title: string; company_name: string; photo_processed_url: string | null; photo_url: string | null }
type RawPartner = { id: string; company_name: string; partner_type: string; logo_url: string | null }

export default function DeletedTab({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<DeletedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  async function fetchDeleted() {
    setLoading(true)
    const [spRes, ptRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}&status=archived`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}&status=archived`),
    ])
    const speakers: RawSpeaker[] = await spRes.json().catch(() => [])
    const partners: RawPartner[] = await ptRes.json().catch(() => [])
    setItems([
      ...speakers.map((s): DeletedItem => ({ kind: 'speaker', id: s.id, name: s.full_name, subtitle: s.job_title && s.company_name ? `${s.job_title} · ${s.company_name}` : (s.company_name || ''), thumb: s.photo_processed_url || s.photo_url })),
      ...partners.map((p): DeletedItem => ({ kind: 'partner', id: p.id, name: p.company_name, subtitle: p.partner_type.replace(/_/g, ' '), thumb: p.logo_url })),
    ])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches the parent page's own fetchAll effect
  useEffect(() => { fetchDeleted() }, [eventId])

  async function restore(item: DeletedItem) {
    setRestoringId(item.id)
    const base = item.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    await fetch(`${base}/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcement_status: 'pending_review', also_restore_to_website: true }),
    })
    await fetchDeleted()
    setRestoringId(null)
  }

  const q = search.trim().toLowerCase()
  const filtered = q ? items.filter(i => `${i.name} ${i.subtitle}`.toLowerCase().includes(q)) : items

  return (
    <div>
      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deleted speakers and partners…" style={{ width: '320px', marginBottom: '16px' }} />

      {loading ? (
        <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '30px 0', textAlign: 'center' }}>
          {items.length === 0 ? 'Nothing deleted yet.' : 'No deleted entries match your search.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filtered.map(item => (
            <Card key={`${item.kind}-${item.id}`} padded>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border-light)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.thumb ? <img src={item.thumb} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '16px', color: 'var(--ink4)' }}>{item.name?.[0]}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>
                    {item.name} <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{item.kind}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{item.subtitle}</div>
                </div>
                <Button variant="teal" onClick={() => restore(item)} disabled={restoringId === item.id}>
                  {restoringId === item.id ? 'Restoring…' : 'Restore'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
