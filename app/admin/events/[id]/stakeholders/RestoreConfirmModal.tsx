'use client'

import { Button } from '@/app/components/ui'

/* Restore confirmation for the Cancelled tab (2026-09-23). Plain Yes/No,
   no typed confirmation — same "medium" weight as KonfhubPushConfirmModal.tsx/
   RemoveFromKonfhubListingModal.tsx, since restoring is itself reversible
   (Cancel again if it was a mistake). Exists at all only because Madhu asked
   for every action in this new Cancel/Restore flow to be double-confirmed —
   DeletedTab's own, older Restore stays single-click, unchanged. */

type Props = {
  speakerName: string
  restoring: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function RestoreConfirmModal({ speakerName, restoring, onConfirm, onClose }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '420px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Restore {speakerName}?</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '18px' }}>
          Clears their Cancelled status and moves them back to the Overview roster with no confirmation status set — you&apos;ll want to set a real one afterward.
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" onClick={onConfirm} disabled={restoring}>
            {restoring ? 'Restoring…' : 'Restore'}
          </Button>
        </div>
      </div>
    </div>
  )
}
