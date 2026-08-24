'use client'

import { Button } from '@/app/components/ui'

/* Confirmation for the "Push to KonfHub" action (2026-08-24) — mirrors
   DeleteConfirmModal.tsx's shape/style but deliberately lighter (plain
   Yes/Cancel, no typed confirmation): publishing is reversible by pushing
   again, unlike delete, so it doesn't need the same friction.

   Single mode (newCount+updateCount omitted): one speaker, wording depends
   on whether this is their first-ever push (creates a real public KonfHub
   record) or a re-push (updates an already-published one) — per Madhu,
   the first case gets the full warning, a re-push gets a lighter note.

   Bulk mode (newCount+updateCount provided, from the roster's selection
   bar): one summary confirmation covering the whole batch, per Madhu's own
   wording — "4 new speakers to be published, 8 existing speakers to be
   updated." skippedCount (selected but not gate-eligible) is called out
   separately so a producer knows why their count is lower than what they
   selected, rather than silently dropping speakers from the push. */

type Props = {
  isFirstPush: boolean // single mode only — ignored when newCount/updateCount are set
  singleName?: string
  newCount?: number
  updateCount?: number
  skippedCount?: number
  pushing: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function KonfhubPushConfirmModal({ isFirstPush, singleName, newCount, updateCount, skippedCount, pushing, onConfirm, onClose }: Props) {
  const isBulk = newCount !== undefined && updateCount !== undefined
  const total = isBulk ? (newCount ?? 0) + (updateCount ?? 0) : 1

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          Push to KonfHub?
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          {isBulk ? (
            <>
              <strong>{newCount}</strong> new speaker{newCount === 1 ? '' : 's'} will be published, <strong>{updateCount}</strong> existing speaker{updateCount === 1 ? '' : 's'} will be updated.
              {!!skippedCount && (
                <> {skippedCount} selected speaker{skippedCount === 1 ? " isn't" : ' are not'} ready yet (photo, Website Photo, Public Name, and Pronoun all required) and will be skipped.</>
              )}
            </>
          ) : isFirstPush ? (
            <>This will publish <strong>{singleName || 'this speaker'}</strong> to KonfHub and the event website. Are you sure?</>
          ) : (
            <>This will update <strong>{singleName || 'this speaker'}</strong>&apos;s already-published KonfHub listing.</>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" onClick={onConfirm} disabled={pushing || (isBulk && total === 0)}>
            {pushing ? 'Pushing…' : isBulk ? `Push ${total}` : 'Push'}
          </Button>
        </div>
      </div>
    </div>
  )
}
