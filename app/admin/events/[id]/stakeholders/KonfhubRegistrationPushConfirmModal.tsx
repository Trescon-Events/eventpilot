'use client'

import { Button } from '@/app/components/ui'

/* Confirmation for "Register on KonfHub" (Attendee Registration push,
   2026-08-25) — same Yes/Cancel shape as the other confirm modals in this
   directory, but a stronger warning than KonfhubPushConfirmModal's: this
   push has no confirmed update path (KonfHub's Capture API is create-only
   as far as its public docs show), so unlike the Speakers-module push,
   there's no "re-push to fix a mistake" safety net — get it right before
   confirming. */

type Props = {
  singleName?: string
  pushing: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function KonfhubRegistrationPushConfirmModal({ singleName, pushing, onConfirm, onClose }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '460px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          Register on KonfHub?
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          This creates a new registration on KonfHub for <strong>{singleName || 'this speaker'}</strong> under the Speaker Registration ticket — used for badge printing, check-in, and networking at the event.
          {' '}This can&apos;t be undone or updated via this button afterward — make sure the details on this tab are correct first.
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" onClick={onConfirm} disabled={pushing}>
            {pushing ? 'Registering…' : 'Register'}
          </Button>
        </div>
      </div>
    </div>
  )
}
