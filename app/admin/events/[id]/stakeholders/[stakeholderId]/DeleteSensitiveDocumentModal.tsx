'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'

/* Typed-DELETE confirmation for a Passport/National ID document
   (2026-09-24, per Madhu — the plain Delete button used to fire
   immediately with no confirmation at all). Copies the "type DELETE to
   confirm" mechanics of app/admin/events/[id]/stakeholders/
   DeleteConfirmModal.tsx and .../creative-templates/DeleteCreativeModal.tsx
   (confirmText state, canConfirm gate, scrim/card idiom) but is its own
   component with copy specific to this data model: a sensitive document is
   hard-deleted from private storage immediately (see the DELETE route and
   sensitive-storage.ts) — there is no Deleted-tab-style restore, only the
   permanent audit-trail row this same tab's own "Deletion history"
   disclosure already shows. */

type Props = {
  docLabel: string // 'Passport' | 'National ID'
  fileName: string
  deleting: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function DeleteSensitiveDocumentModal({ docLabel, fileName, deleting, onConfirm, onClose }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const canConfirm = confirmText === 'DELETE' && !deleting

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          Delete this {docLabel}?
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          &quot;{fileName}&quot; — this <strong>permanently</strong> deletes the file from storage. This cannot be undone. Type <strong>DELETE</strong> below to confirm.
        </div>

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
