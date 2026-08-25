'use client'

import { Button } from '@/app/components/ui'

/* Confirmation for "Register on KonfHub" (Attendee Registration push,
   2026-08-25) — same Yes/Cancel shape as the other confirm modals in this
   directory. Originally create-only (KonfHub's public Capture API docs
   showed no update path), but KonfHub's updated Postman docs the same day
   revealed a real Edit Attendee endpoint (PUT .../attendees/:id/edit)
   under the same Bearer-token credentials — the route now uses it whenever
   the speaker already has a konfhub_booking_id. isUpdate switches the
   single-mode copy accordingly; the underlying handler (pushRegistration
   in the Details page) is the same for both.

   Bulk mode (newCount+updateCount provided, from the roster's selection
   bar, added alongside the bulk action itself) — same shape as
   KonfhubPushConfirmModal's own bulk mode: one summary confirmation with
   new/update/skipped counts. The route itself now safety-checks KonfHub
   directly before ever creating (see its own doc comment), so a batch
   that includes a speaker someone registered manually on KonfHub outside
   this app will link and update rather than duplicate — this copy doesn't
   need to warn about that case specially. */

type Props = {
  singleName?: string
  isUpdate?: boolean // single mode only — ignored when newCount/updateCount are set
  newCount?: number
  updateCount?: number
  skippedCount?: number
  pushing: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function KonfhubRegistrationPushConfirmModal({ singleName, isUpdate, newCount, updateCount, skippedCount, pushing, onConfirm, onClose }: Props) {
  const isBulk = newCount !== undefined && updateCount !== undefined
  const total = isBulk ? (newCount ?? 0) + (updateCount ?? 0) : 1

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '460px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          {isBulk ? 'Register on KonfHub?' : isUpdate ? 'Update KonfHub registration?' : 'Register on KonfHub?'}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          {isBulk ? (
            <>
              <strong>{newCount}</strong> new registration{newCount === 1 ? '' : 's'} will be created on KonfHub, <strong>{updateCount}</strong> existing registration{updateCount === 1 ? '' : 's'} will be updated — under the Speaker Registration ticket, used for badge printing, check-in, and networking at the event.
              {!!skippedCount && (
                <> {skippedCount} selected speaker{skippedCount === 1 ? " isn't" : ' are not'} ready yet (email and name required) and will be skipped.</>
              )}
            </>
          ) : isUpdate ? (
            <>This updates <strong>{singleName || 'this speaker'}</strong>&apos;s existing Attendee Registration on KonfHub under the Speaker Registration ticket with the details on this tab — used for badge printing, check-in, and networking at the event.</>
          ) : (
            <>This creates a new registration on KonfHub for <strong>{singleName || 'this speaker'}</strong> under the Speaker Registration ticket — used for badge printing, check-in, and networking at the event. Make sure the details on this tab are correct first.</>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" onClick={onConfirm} disabled={pushing || (isBulk && total === 0)}>
            {pushing ? 'Working…' : isBulk ? `Register ${total}` : isUpdate ? 'Update' : 'Register'}
          </Button>
        </div>
      </div>
    </div>
  )
}
