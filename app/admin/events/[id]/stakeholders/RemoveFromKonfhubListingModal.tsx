'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/app/components/ui'

/* "Remove from KonfHub Listing" (2026-09-21, Madhu — "for scenario where
   producer publishes a speaker on konfhub but then realises that its not
   time yet... would want to do it later"). Distinct from the full Delete
   Speaker flow's own KonfHub checkbox (DeleteConfirmModal.tsx) — this
   keeps the EventPilot record fully active/untouched, only pulling the
   public KonfHub listing back down. Reuses the exact same dependency
   check that flow already established (.../speakers/dependencies) rather
   than a second implementation — the risk is identical: a real, live
   session-assignment check, not a guess (see that route's own comment). */

type Props = {
  eventId: string
  speakerId: string
  speakerName: string
  removing: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function RemoveFromKonfhubListingModal({ eventId, speakerId, speakerName, removing, onConfirm, onClose }: Props) {
  const [sessionTitles, setSessionTitles] = useState<string[] | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, mirrors DeleteConfirmModal's own dependency check
    fetch(`/api/events/stakeholders/speakers/dependencies?event_id=${eventId}&ids=${speakerId}`)
      .then(r => r.json())
      .then(data => setSessionTitles(data?.[speakerId]?.konfhubSessionTitles ?? []))
      .catch(() => setSessionTitles([]))
  }, [eventId, speakerId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Remove from KonfHub Listing?</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          {`Takes ${speakerName} down from KonfHub's public Speakers listing and the event website — a real, immediate delete on KonfHub's side. Nothing changes in EventPilot: the record stays exactly as it is here, and you can push it live again whenever it's actually time.`}
        </div>

        {sessionTitles === null ? (
          <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '14px' }}>Checking KonfHub session assignments…</div>
        ) : sessionTitles.length > 0 ? (
          <div style={{ padding: '10px 12px', background: 'color-mix(in srgb, #E07B2C 10%, transparent)', border: '1px solid color-mix(in srgb, #E07B2C 35%, transparent)', borderRadius: '9px', marginBottom: '14px', fontSize: '12px', color: 'var(--ink)', lineHeight: 1.6 }}>
            ⚠ Actually assigned on KonfHub to: {sessionTitles.map(t => `"${t}"`).join(', ')} — removing the listing drops them from these sessions too.
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '14px' }}>No KonfHub session assignment found for this speaker.</div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="red" onClick={onConfirm} disabled={removing}>
            {removing ? 'Removing…' : 'Remove from Listing'}
          </Button>
        </div>
      </div>
    </div>
  )
}
