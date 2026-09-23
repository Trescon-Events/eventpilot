'use client'

import { useEffect, useState } from 'react'
import { Card, Button, Input } from '@/app/components/ui'
import RestoreConfirmModal from './RestoreConfirmModal'

/* Cancelled speakers — restore view for the guarded Cancel flow
   (2026-09-23, see CancelSpeakerModal.tsx for the full rationale). Modeled
   directly on DeletedTab.tsx's structure, but speakers-only — confirmation_
   status doesn't exist on event_sponsors/partners — and fetching via the
   new ?confirmation_status=Cancelled override (see .../speakers/route.ts's
   own comment) rather than DeletedTab's ?status=archived.

   Unlike DeletedTab's own Restore (single click, justified there as a fully
   reversible no-op), this Restore is deliberately double-confirmed — per
   Madhu, every action in this new Cancel/Restore flow needs a real confirm
   step, never one click. See RestoreConfirmModal.tsx. */

type CancelledSpeaker = {
  id: string; full_name: string; job_title: string; company_name: string
  photo_processed_url: string | null; photo_url: string | null
  konfhub_speaker_removed_at: string | null; konfhub_registration_cancel_requested_at: string | null
}

export default function CancelledTab({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const [items, setItems] = useState<CancelledSpeaker[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [restoreConfirm, setRestoreConfirm] = useState<CancelledSpeaker | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)

  async function fetchCancelled() {
    setLoading(true)
    const res = await fetch(`/api/events/stakeholders/speakers?event_id=${eventId}&confirmation_status=Cancelled`)
    const speakers: CancelledSpeaker[] = await res.json().catch(() => [])
    setItems(speakers)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches DeletedTab's own fetchDeleted effect
  useEffect(() => { fetchCancelled() }, [eventId])

  async function performRestore() {
    if (!restoreConfirm) return
    setRestoring(true)
    await fetch(`/api/events/stakeholders/speakers/${restoreConfirm.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation_status: null }),
    })
    setRestoring(false)
    setRestoreConfirm(null)
    await fetchCancelled()
    // Restored speaker needs to reappear in the parent's Overview roster
    // (and the nav badge count needs to drop) — both live in page.tsx's own
    // `speakers`/`cancelledCount` state, untouched by this tab's own fetch.
    onChanged()
  }

  // Same standalone "the manual KonfHub-dashboard cancellation actually
  // happened, clear the to-do flag" action DeletedTab already has — a
  // cancelled speaker can carry this same flag (see CancelSpeakerModal's
  // registration-acknowledgment gate), so it needs the same clearing UI here.
  async function markRegistrationCancelled(item: CancelledSpeaker) {
    setMarkingId(item.id)
    await fetch(`/api/events/stakeholders/speakers/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ also_mark_konfhub_registration_cancelled: true }),
    })
    await fetchCancelled()
    setMarkingId(null)
  }

  const q = search.trim().toLowerCase()
  const filtered = q ? items.filter(i => `${i.full_name} ${i.company_name}`.toLowerCase().includes(q)) : items

  return (
    <div>
      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cancelled speakers…" style={{ width: '320px', marginBottom: '16px' }} />

      {loading ? (
        <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '30px 0', textAlign: 'center' }}>
          {items.length === 0 ? 'No cancelled speakers.' : 'No cancelled speakers match your search.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filtered.map(item => {
            const thumb = item.photo_processed_url || item.photo_url
            const subtitle = item.job_title && item.company_name ? `${item.job_title} · ${item.company_name}` : (item.company_name || '')
            return (
              <Card key={item.id} padded>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border-light)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {thumb ? <img src={thumb} alt={item.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '16px', color: 'var(--ink4)' }}>{item.full_name?.[0]}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>{item.full_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{subtitle}</div>
                    {(item.konfhub_speaker_removed_at || item.konfhub_registration_cancel_requested_at) && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {item.konfhub_speaker_removed_at && (
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '2px 7px' }}>
                            Removed from KonfHub listing
                          </span>
                        )}
                        {item.konfhub_registration_cancel_requested_at && (
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#E07B2C', background: 'color-mix(in srgb, #E07B2C 10%, transparent)', border: '1px solid color-mix(in srgb, #E07B2C 35%, transparent)', borderRadius: '6px', padding: '2px 7px' }}>
                            ⚠ Needs manual KonfHub registration cancellation
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {item.konfhub_registration_cancel_requested_at && (
                      <Button variant="ghost" onClick={() => markRegistrationCancelled(item)} disabled={markingId === item.id}>
                        Mark cancelled
                      </Button>
                    )}
                    <Button variant="teal" onClick={() => setRestoreConfirm(item)}>
                      Restore
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {restoreConfirm && (
        <RestoreConfirmModal
          speakerName={restoreConfirm.full_name}
          restoring={restoring}
          onConfirm={performRestore}
          onClose={() => setRestoreConfirm(null)}
        />
      )}
    </div>
  )
}
