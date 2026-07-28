'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'

/* Delete confirmation for speakers/partners — added 2026-07-28 per Madhu's
   direct request ("since there is work gone into building one, let there be
   an option to type in DELETE confirmation box before actually deleting").
   Shared between single-item and bulk delete (page.tsx passes count>1 for
   bulk). This is a soft delete under the hood (announcement_status ->
   'archived', restorable from the Deleted tab) — the "Also remove from the
   live public event website" checkbox is the one deliberate, opt-in
   exception, additionally setting `active: false` on the underlying
   event_speakers/event_sponsors row (see the API routes' comments for why
   that's normally off-limits). Reuses the "type DELETE to confirm" pattern
   already established in app/admin/toolkit/knowledge-base/manage/page.tsx. */

type Props = {
  count: number
  itemLabel: string // singular, e.g. "speaker" or "partner"
  singleName?: string // when count === 1, shows the actual name instead of "1 speaker"
  deleting: boolean
  onConfirm: (alsoRemoveFromWebsite: boolean) => void
  onClose: () => void
}

export default function DeleteConfirmModal({ count, itemLabel, singleName, deleting, onConfirm, onClose }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [alsoRemoveFromWebsite, setAlsoRemoveFromWebsite] = useState(false)
  const canConfirm = confirmText === 'DELETE' && !deleting
  const plural = itemLabel + 's'
  const subject = count === 1 ? (singleName ? `"${singleName}"` : `this ${itemLabel}`) : `these ${count} ${plural}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          Delete {count === 1 ? itemLabel : `${count} ${plural}`}?
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          This removes {subject} from the Stakeholder Hub — it can be restored anytime from the <strong>Deleted</strong> tab. Type <strong>DELETE</strong> below to confirm.
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '9px', cursor: 'pointer', marginBottom: '14px' }}>
          <input type="checkbox" checked={alsoRemoveFromWebsite} onChange={e => setAlsoRemoveFromWebsite(e.target.checked)} style={{ marginTop: '2px' }} />
          <span>
            <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>Also remove from the live public event website</span>
            <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
              {alsoRemoveFromWebsite
                ? `${count === 1 ? 'It' : 'They'} will also disappear from the public website and KonfHub sync until restored.`
                : `Off by default — ${count === 1 ? 'it stays' : 'they stay'} live on the public website, only hidden from this Hub.`}
            </span>
          </span>
        </label>

        <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type DELETE to confirm" autoFocus style={{ marginBottom: '16px' }} />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="red" onClick={() => onConfirm(alsoRemoveFromWebsite)} disabled={!canConfirm}>
            {deleting ? 'Deleting…' : `Delete${count > 1 ? ` ${count}` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
