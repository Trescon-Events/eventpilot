'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/app/components/ui'

/* Cancel Speaker (2026-09-23, per Madhu) — the guarded flow behind the
   Overview tab's "Cancel" bulk action. Structurally modeled on
   DeleteConfirmModal.tsx (same dependency-check fetch, same layout), but
   the KonfHub sections here aren't optional opt-in checkboxes like Delete's
   — they're a hard gate: Cancel can't complete while a selected speaker is
   still live on KonfHub, and completing the gate for the Listing half means
   actually firing the real removal call and watching it succeed, not just
   ticking a box.

   Two independent KonfHub surfaces, two different levels of certainty:
   - Speakers-management listing: a real DELETE API exists (deleteKonfhub
     Speaker, reused here via the existing konfhub-remove-listing route —
     same one RemoveFromKonfhubListingModal.tsx already uses). A 200 from
     that route IS the "system is sure it's removed" signal — no extra
     re-check needed.
   - Attendee Registration: KonfHub has NO cancel/remove API at all (only
     create/update — see konfhub-registration-push/route.ts and
     konfhub_speaker_delete_tracking_migration.sql). The system can never be
     literally sure this is gone, so the gate is a required, explicit human
     acknowledgment instead — same copy/pattern DeleteConfirmModal.tsx
     already uses for this exact limitation. Confirmed with Madhu as the
     acceptable compromise.

   The final "Cancel" click doesn't fire immediately either — it reveals one
   more inline yes/no, mirroring the Details page's own two-step reveal
   pattern (secondaryRemoveConfirm), so this is a genuine double-confirm on
   top of the KonfHub gate, not a replacement for one. */

type CancelItem = { id: string; name: string; konfhubSpeakerId?: string | null; konfhubBookingId?: string | null }

type Props = {
  eventId: string
  items: CancelItem[]
  cancelling: boolean
  onConfirm: (registrationAcknowledged: boolean) => void
  onClose: () => void
}

type RemovalStatus = 'idle' | 'removing' | 'done' | 'error'

export default function CancelSpeakerModal({ eventId, items, cancelling, onConfirm, onClose }: Props) {
  const [sessionTitles, setSessionTitles] = useState<string[] | null>(null)
  const [removalStatus, setRemovalStatus] = useState<Record<string, RemovalStatus>>({})
  const [removalError, setRemovalError] = useState<Record<string, string>>({})
  const [removingAll, setRemovingAll] = useState(false)
  const [registrationAck, setRegistrationAck] = useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)

  const listingItems = items.filter(i => !!i.konfhubSpeakerId)
  const registrationItems = items.filter(i => !!i.konfhubBookingId)
  const plural = items.length > 1
  const subject = plural ? `these ${items.length} speakers` : `"${items[0]?.name}"`

  useEffect(() => {
    const ids = items.map(i => i.id).join(',')
    if (!ids || listingItems.length === 0) return
    fetch(`/api/events/stakeholders/speakers/dependencies?event_id=${eventId}&ids=${ids}`)
      .then(r => r.json())
      .then(deps => setSessionTitles([...new Set(Object.values(deps as Record<string, { konfhubSessionTitles?: string[] }>).flatMap(d => d.konfhubSessionTitles ?? []))]))
      .catch(() => setSessionTitles([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- items is the selection, stable for the modal's lifetime
  }, [eventId])

  async function removeAllFromListing() {
    setRemovingAll(true)
    await Promise.all(listingItems.map(async item => {
      setRemovalStatus(s => ({ ...s, [item.id]: 'removing' }))
      const res = await fetch(`/api/events/stakeholders/speakers/${item.id}/konfhub-remove-listing`, { method: 'POST' })
      if (res.ok) {
        setRemovalStatus(s => ({ ...s, [item.id]: 'done' }))
      } else {
        const data = await res.json().catch(() => ({}))
        setRemovalStatus(s => ({ ...s, [item.id]: 'error' }))
        setRemovalError(e => ({ ...e, [item.id]: data.error || 'Failed to remove from KonfHub' }))
      }
    }))
    setRemovingAll(false)
  }

  const listingResolved = listingItems.every(i => removalStatus[i.id] === 'done')
  const listingHasError = listingItems.some(i => removalStatus[i.id] === 'error')
  const canProceed = listingResolved && (registrationItems.length === 0 || registrationAck)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '480px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          Cancel {plural ? `${items.length} speakers` : 'speaker'}?
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          Moves {subject} to the Cancelled tab, out of the main roster. They&apos;re retained (not deleted) and can be restored anytime.
        </div>

        {listingItems.length > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '9px', marginBottom: '10px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
              Still listed on KonfHub&apos;s Speakers page
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '8px' }}>
              {listingItems.map(i => i.name).join(', ')} — {listingResolved ? 'removed.' : 'must be removed from KonfHub before cancelling.'}
            </div>
            {sessionTitles === null ? (
              <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginBottom: '8px' }}>Checking KonfHub session assignments…</div>
            ) : sessionTitles.length > 0 ? (
              <div style={{ padding: '8px 10px', background: 'color-mix(in srgb, #E07B2C 10%, transparent)', border: '1px solid color-mix(in srgb, #E07B2C 35%, transparent)', borderRadius: '8px', marginBottom: '8px', fontSize: '11.5px', color: 'var(--ink)', lineHeight: 1.6 }}>
                ⚠ Actually assigned on KonfHub to: {sessionTitles.map(t => `"${t}"`).join(', ')} — removing the listing drops them from these sessions too.
              </div>
            ) : null}
            {listingHasError && (
              <div style={{ fontSize: '11.5px', color: 'var(--red)', marginBottom: '8px' }}>
                {Object.entries(removalError).map(([id, msg]) => <div key={id}>{listingItems.find(i => i.id === id)?.name}: {msg}</div>)}
              </div>
            )}
            {!listingResolved && (
              <Button variant="red" onClick={removeAllFromListing} disabled={removingAll}>
                {removingAll ? 'Removing…' : 'Remove from KonfHub Listing Now'}
              </Button>
            )}
            {listingResolved && <div style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 700 }}>✓ Removed from KonfHub</div>}
          </div>
        )}

        {registrationItems.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '9px', cursor: 'pointer', marginBottom: '14px' }}>
            <input type="checkbox" checked={registrationAck} onChange={e => setRegistrationAck(e.target.checked)} style={{ marginTop: '2px', width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' }} />
            <span>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>
                {registrationItems.map(i => i.name).join(', ')} — has a live KonfHub Attendee Registration
              </span>
              <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
                KonfHub has no API to cancel a registration — you&apos;ll need to cancel it by hand in KonfHub&apos;s dashboard. Check this box to confirm you have (or will immediately after), so it isn&apos;t forgotten — it stays flagged on the Cancelled tab until you mark it done.
              </span>
            </span>
          </label>
        )}

        {!showFinalConfirm ? (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="red" onClick={() => setShowFinalConfirm(true)} disabled={!canProceed}>
              Cancel {plural ? `${items.length} Speakers` : 'Speaker'}
            </Button>
          </div>
        ) : (
          <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '9px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>
              This moves {subject} to the Cancelled tab. Confirm?
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setShowFinalConfirm(false)} disabled={cancelling}>No, go back</Button>
              <Button variant="red" onClick={() => onConfirm(registrationAck)} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
