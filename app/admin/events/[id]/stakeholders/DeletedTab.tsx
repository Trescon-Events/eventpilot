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
  konfhubSpeakerRemovedAt: string | null
  konfhubRegistrationCancelRequestedAt: string | null
}

type RawSpeaker = {
  id: string; full_name: string; job_title: string; company_name: string; photo_processed_url: string | null; photo_url: string | null
  konfhub_speaker_removed_at: string | null; konfhub_registration_cancel_requested_at: string | null
}
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
      ...speakers.map((s): DeletedItem => ({
        kind: 'speaker', id: s.id, name: s.full_name, subtitle: s.job_title && s.company_name ? `${s.job_title} · ${s.company_name}` : (s.company_name || ''), thumb: s.photo_processed_url || s.photo_url,
        konfhubSpeakerRemovedAt: s.konfhub_speaker_removed_at, konfhubRegistrationCancelRequestedAt: s.konfhub_registration_cancel_requested_at,
      })),
      ...partners.map((p): DeletedItem => ({ kind: 'partner', id: p.id, name: p.company_name, subtitle: p.partner_type.replace(/_/g, ' '), thumb: p.logo_url, konfhubSpeakerRemovedAt: null, konfhubRegistrationCancelRequestedAt: null })),
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

  // Separate from Restore — for when a producer has actually gone and
  // cancelled the booking by hand in KonfHub's dashboard (no API for that,
  // see DeleteConfirmModal.tsx) and just wants to clear the to-do flag
  // without bringing the speaker back.
  async function markRegistrationCancelled(item: DeletedItem) {
    setRestoringId(item.id)
    await fetch(`/api/events/stakeholders/speakers/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ also_mark_konfhub_registration_cancelled: true }),
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
                  {(item.konfhubSpeakerRemovedAt || item.konfhubRegistrationCancelRequestedAt) && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {item.konfhubSpeakerRemovedAt && (
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '2px 7px' }}>
                          Removed from KonfHub listing
                        </span>
                      )}
                      {item.konfhubRegistrationCancelRequestedAt && (
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#E07B2C', background: 'color-mix(in srgb, #E07B2C 10%, transparent)', border: '1px solid color-mix(in srgb, #E07B2C 35%, transparent)', borderRadius: '6px', padding: '2px 7px' }}>
                          ⚠ Needs manual KonfHub registration cancellation
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {item.konfhubRegistrationCancelRequestedAt && (
                    <Button variant="ghost" onClick={() => markRegistrationCancelled(item)} disabled={restoringId === item.id}>
                      Mark cancelled
                    </Button>
                  )}
                  <Button variant="teal" onClick={() => restore(item)} disabled={restoringId === item.id}>
                    {restoringId === item.id ? 'Restoring…' : 'Restore'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
