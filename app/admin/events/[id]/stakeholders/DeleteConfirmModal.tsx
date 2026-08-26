'use client'

import { useEffect, useState } from 'react'
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
   already established in app/admin/toolkit/knowledge-base/manage/page.tsx.

   Extended 2026-08-26 with two more independent, opt-in, speaker-only
   actions (per Madhu, after finding a duplicate demo speaker record and
   asking what deleting actually does to KonfHub): "Also remove from KonfHub
   Speakers listing" (a real DELETE call, deleteKonfhubSpeaker) and "Flag
   KonfHub registration for manual cancellation" (KonfHub has no delete/
   cancel endpoint for an Attendee Registration booking at all — this can
   only ever be a to-do flag, never automation). Both only render when at
   least one selected item actually has the relevant KonfHub id — partners
   have neither today (no KonfHub listing-push feature exists for them, and
   their konfhub_booking_id is legacy/unwritten), so they only ever see the
   original website checkbox.

   Also added: a dependency check fetched on open and shown before the
   confirm box — warns, never blocks, since deletion is already reversible.
   stakeholder_announcements + agenda name-match are best-effort (no real
   FK for the latter); the KonfHub session check is a REAL live lookup
   (GET .../sessions, see .../speakers/dependencies/route.ts) — per Madhu,
   "since you have access, shouldn't you check actual association" — so
   it's only ever shown when a genuine match is found, never a generic
   maybe-warning. */

const CHECKBOX_STYLE = { marginTop: '2px', width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' } as const

type DeleteItem = { id: string; konfhubSpeakerId?: string | null; konfhubBookingId?: string | null }

type ConfirmFlags = {
  alsoRemoveFromWebsite: boolean
  alsoRemoveFromKonfhubListing: boolean
  alsoFlagKonfhubRegistrationCancel: boolean
}

type Props = {
  count: number
  itemLabel: string // singular, e.g. "speaker" or "partner"
  singleName?: string // when count === 1, shows the actual name instead of "1 speaker"
  kind: 'speaker' | 'partner'
  eventId: string
  items: DeleteItem[]
  deleting: boolean
  onConfirm: (flags: ConfirmFlags) => void
  onClose: () => void
}

type Dependencies = Record<string, { pendingAnnouncements: number; possibleAgendaMentions?: number; konfhubSessionTitles?: string[] }>

export default function DeleteConfirmModal({ count, itemLabel, singleName, kind, eventId, items, deleting, onConfirm, onClose }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [alsoRemoveFromWebsite, setAlsoRemoveFromWebsite] = useState(false)
  const [alsoRemoveFromKonfhubListing, setAlsoRemoveFromKonfhubListing] = useState(false)
  const [alsoFlagKonfhubRegistrationCancel, setAlsoFlagKonfhubRegistrationCancel] = useState(false)
  const [deps, setDeps] = useState<Dependencies | null>(null)
  const canConfirm = confirmText === 'DELETE' && !deleting
  const plural = itemLabel + 's'
  const subject = count === 1 ? (singleName ? `"${singleName}"` : `this ${itemLabel}`) : `these ${count} ${plural}`

  const canRemoveFromKonfhubListing = kind === 'speaker' && items.some(i => !!i.konfhubSpeakerId)
  const canFlagKonfhubRegistration = kind === 'speaker' && items.some(i => !!i.konfhubBookingId)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, mirrors DeletedTab's own fetchDeleted effect
  useEffect(() => {
    const ids = items.map(i => i.id).join(',')
    if (!ids) return
    const base = kind === 'speaker' ? '/api/events/stakeholders/speakers/dependencies' : '/api/events/stakeholders/partners/dependencies'
    const url = kind === 'speaker' ? `${base}?event_id=${eventId}&ids=${ids}` : `${base}?ids=${ids}`
    fetch(url).then(r => r.json()).then(setDeps).catch(() => setDeps(null))
  }, [kind, eventId, items])

  const totalPendingAnnouncements = deps ? Object.values(deps).reduce((sum, d) => sum + d.pendingAnnouncements, 0) : 0
  const totalAgendaMentions = deps ? Object.values(deps).reduce((sum, d) => sum + (d.possibleAgendaMentions ?? 0), 0) : 0
  const konfhubSessionTitles = deps ? [...new Set(Object.values(deps).flatMap(d => d.konfhubSessionTitles ?? []))] : []
  const hasWarnings = totalPendingAnnouncements > 0 || totalAgendaMentions > 0 || konfhubSessionTitles.length > 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '460px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
          Delete {count === 1 ? itemLabel : `${count} ${plural}`}?
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          This removes {subject} from the Stakeholder Hub — it can be restored anytime from the <strong>Deleted</strong> tab. Type <strong>DELETE</strong> below to confirm.
        </div>

        {hasWarnings && (
          <div style={{ padding: '10px 12px', background: 'color-mix(in srgb, #E07B2C 10%, transparent)', border: '1px solid color-mix(in srgb, #E07B2C 35%, transparent)', borderRadius: '9px', marginBottom: '14px', fontSize: '12px', color: 'var(--ink)', lineHeight: 1.6 }}>
            {totalPendingAnnouncements > 0 && (
              <div>⚠ {totalPendingAnnouncements} pending/scheduled announcement{totalPendingAnnouncements > 1 ? 's' : ''} reference {count === 1 ? 'this ' + itemLabel : 'these ' + plural} — deleting will detach the link.</div>
            )}
            {totalAgendaMentions > 0 && (
              <div>⚠ Possibly mentioned in {totalAgendaMentions} agenda session{totalAgendaMentions > 1 ? 's' : ''} (name match only — agenda uses free text, please verify manually).</div>
            )}
            {konfhubSessionTitles.length > 0 && (
              <div>⚠ Actually assigned on KonfHub to: {konfhubSessionTitles.map(t => `"${t}"`).join(', ')} — removing from the listing drops {count === 1 ? 'this speaker' : 'them'} from these sessions too.</div>
            )}
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '9px', cursor: 'pointer', marginBottom: '10px' }}>
          <input type="checkbox" checked={alsoRemoveFromWebsite} onChange={e => setAlsoRemoveFromWebsite(e.target.checked)} style={CHECKBOX_STYLE} />
          <span>
            <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>Also remove from the live public event website</span>
            <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
              {alsoRemoveFromWebsite
                ? `${count === 1 ? 'It' : 'They'} will also disappear from the public website until restored.`
                : `Off by default — ${count === 1 ? 'it stays' : 'they stay'} live on the public website, only hidden from this Hub.`}
            </span>
          </span>
        </label>

        {canRemoveFromKonfhubListing && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '9px', cursor: 'pointer', marginBottom: '10px' }}>
            <input type="checkbox" checked={alsoRemoveFromKonfhubListing} onChange={e => setAlsoRemoveFromKonfhubListing(e.target.checked)} style={CHECKBOX_STYLE} />
            <span>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>Also remove from KonfHub Speakers listing</span>
              <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
                {deps === null
                  ? 'Real, immediate delete on KonfHub. Checking session assignments…'
                  : konfhubSessionTitles.length > 0
                    ? 'Real, immediate delete on KonfHub — see the session warning above.'
                    : `Real, immediate delete on KonfHub. No KonfHub session assignment found for ${count === 1 ? 'this speaker' : 'these'}.`}
              </span>
            </span>
          </label>
        )}

        {canFlagKonfhubRegistration && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '9px', cursor: 'pointer', marginBottom: '10px' }}>
            <input type="checkbox" checked={alsoFlagKonfhubRegistrationCancel} onChange={e => setAlsoFlagKonfhubRegistrationCancel(e.target.checked)} style={CHECKBOX_STYLE} />
            <span>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>Flag KonfHub registration for manual cancellation</span>
              <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
                KonfHub has no API to cancel a registration — this doesn't delete anything, it just marks it as a to-do on the Deleted tab so it isn't forgotten. You'll still need to cancel it by hand in KonfHub's dashboard.
              </span>
            </span>
          </label>
        )}

        <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type DELETE to confirm" autoFocus style={{ marginTop: '4px', marginBottom: '16px' }} />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="red" onClick={() => onConfirm({ alsoRemoveFromWebsite, alsoRemoveFromKonfhubListing, alsoFlagKonfhubRegistrationCancel })} disabled={!canConfirm}>
            {deleting ? 'Deleting…' : `Delete${count > 1 ? ` ${count}` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
