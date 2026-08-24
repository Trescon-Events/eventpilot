'use client'

import { Button } from '@/app/components/ui'

/* Confirmation for bulk "Approve for Announcements" (2026-08-24) — same
   lightweight shape as KonfhubPushConfirmModal (plain Yes/Cancel, no typed
   confirmation), but simpler: Approve has no first-time/update distinction
   the way a KonfHub publish does, just a flat "N will be approved, M
   skipped because not ready" summary. Works for both speakers and
   partners, since Approve for Announcements itself does. */

type Props = {
  count: number
  skippedCount: number
  itemLabel: string // 'speaker' | 'partner'
  approving: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function BulkApproveConfirmModal({ count, skippedCount, itemLabel, approving, onConfirm, onClose }: Props) {
  const plural = itemLabel + 's'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          Approve for Announcements?
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          <strong>{count}</strong> {count === 1 ? itemLabel : plural} will be approved and made available for announcements.
          {!!skippedCount && (
            <> {skippedCount} selected {skippedCount === 1 ? itemLabel : plural} {skippedCount === 1 ? "isn't" : 'are not'} ready yet and will be skipped.</>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" onClick={onConfirm} disabled={approving || count === 0}>
            {approving ? 'Approving…' : `Approve ${count}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
