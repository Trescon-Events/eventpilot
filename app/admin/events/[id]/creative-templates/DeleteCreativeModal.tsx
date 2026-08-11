'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'

/* Typed-DELETE confirmation for one or more generated creatives
   (2026-08-02, bulk added 2026-08-03). Copies the "type DELETE to confirm"
   MECHANICS of app/admin/events/[id]/stakeholders/DeleteConfirmModal.tsx
   (confirmText state, canConfirm gate, scrim/card idiom) but is a separate,
   purpose-built component rather than an extended version of that one —
   that component's copy ("removes it from the Hub — restorable from the
   Deleted tab") is written specifically for event_speakers/event_sponsors'
   soft-delete model. A stakeholder_announcements row is hard-deleted (see
   the DELETE route's doc comment) with no restore path, so reusing that
   copy would actively mislead. */

type Item = { variantName: string; status: string }

type Props = {
  items: Item[] // 1 for a single-card delete, 2+ for bulk-select delete
  deleting: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function DeleteCreativeModal({ items, deleting, onConfirm, onClose }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const canConfirm = confirmText === 'DELETE' && !deleting
  const count = items.length
  const alreadyLive = items.filter(i => i.status === 'scheduled' || i.status === 'published')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          {count === 1 ? 'Delete this creative?' : `Delete ${count} creatives?`}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          {count === 1
            ? <>&quot;{items[0].variantName}&quot; — this permanently deletes this creative and its post copy. There is no restore.</>
            : <>This permanently deletes all {count} selected creatives and their post copy. There is no restore.</>} Type <strong>DELETE</strong> below to confirm.
        </div>

        {alreadyLive.length > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '9px', marginBottom: '14px', fontSize: '11.5px', color: 'var(--amber)', lineHeight: 1.5 }}>
            {count === 1
              ? `This creative has already been ${items[0].status} — deleting it here only removes the EventPilot record. It will not un-schedule or un-publish the live post.`
              : `${alreadyLive.length} of the selected creatives ${alreadyLive.length === 1 ? 'has' : 'have'} already been scheduled or published — deleting them here only removes the EventPilot record. It will not un-schedule or un-publish the live post.`}
          </div>
        )}

        <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type DELETE to confirm" autoFocus style={{ marginBottom: '16px' }} />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="red" onClick={onConfirm} disabled={!canConfirm}>
            {deleting ? 'Deleting…' : `Delete${count > 1 ? ` ${count}` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
