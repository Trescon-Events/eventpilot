'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'

/* Typed-DELETE confirmation for a single generated creative (2026-08-02).
   Copies the "type DELETE to confirm" MECHANICS of
   app/admin/events/[id]/stakeholders/DeleteConfirmModal.tsx (confirmText
   state, canConfirm gate, scrim/card idiom) but is a separate, purpose-built
   component rather than an extended version of that one — that component's
   copy ("removes it from the Hub — restorable from the Deleted tab") is
   written specifically for event_speakers/event_sponsors' soft-delete model.
   A stakeholder_announcements row is hard-deleted (see the DELETE route's
   doc comment) with no restore path, so reusing that copy would actively
   mislead. */

type Props = {
  variantName: string
  status: string
  deleting: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function DeleteCreativeModal({ variantName, status, deleting, onConfirm, onClose }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const canConfirm = confirmText === 'DELETE' && !deleting

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          Delete this creative?
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          &quot;{variantName}&quot; — this permanently deletes this creative and its post copy. There is no restore. Type <strong>DELETE</strong> below to confirm.
        </div>

        {(status === 'scheduled' || status === 'published') && (
          <div style={{ padding: '10px 12px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '9px', marginBottom: '14px', fontSize: '11.5px', color: 'var(--amber)', lineHeight: 1.5 }}>
            This creative has already been {status} — deleting it here only removes the EventPilot record. It will not un-schedule or un-publish the live post.
          </div>
        )}

        <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type DELETE to confirm" autoFocus style={{ marginBottom: '16px' }} />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="red" onClick={onConfirm} disabled={!canConfirm}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}
