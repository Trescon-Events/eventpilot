'use client'

import { useState } from 'react'
import { Button } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'

/* Emails → template review (2026-11-12). A template must be confirmed for an event before it is used: it goes stale when its text is edited, when the event's messaging docs change, or after 90 days. */

export type ReviewInfo = { state: 'reviewed' | 'stale'; reasons: string[]; reviewed_at: string | null; reviewed_by_name: string | null; reference: { version: number; compiled_at: string; docs: { title: string; updated_at: string }[] } | null }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function ReviewPanel({ eventId, templateId, review, onChanged, onApply }: { eventId: string; templateId: string; review: ReviewInfo | null; onChanged: () => void; onApply?: (html: string) => void }) {
  const [busy, setBusy] = useState<'confirm' | 'suggest' | null>(null)
  const [sug, setSug] = useState<{ html: string; changes: string[]; kept: boolean } | null>(null)
  if (!review) return null
  const stale = review.state === 'stale'

  async function confirm() {
    setBusy('confirm')
    const r = await fetch('/api/events/stakeholders/email-templates/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, template_id: templateId }) })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { notify(d.error ?? 'Could not record the check.', 'error'); return }
    notify('Recorded. This template is cleared for this event.', 'success'); setSug(null); onChanged()
  }
  async function suggest() {
    setBusy('suggest')
    const r = await fetch('/api/events/stakeholders/email-templates/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, template_id: templateId }) })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { notify(d.error ?? 'Could not get suggestions.', 'error'); return }
    setSug({ html: d.suggestion.polished_html, changes: d.suggestion.changes ?? [], kept: !!d.tokens_kept })
  }

  return (
    <div style={{ padding: '10px 12px', borderRadius: '10px', border: `1px solid ${stale ? 'var(--amber)' : 'var(--border)'}`, background: stale ? 'var(--amber-light)' : 'var(--surface)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.55 }}>
      {stale ? (
        <>
          <strong>Check this template before using it for this event.</strong>
          <ul style={{ margin: '4px 0 6px 18px', padding: 0 }}>{review.reasons.map(x => <li key={x}>{x}</li>)}</ul>
          {review.reference && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>The event’s messaging docs now on file: {review.reference.docs.map(d => `${d.title} (updated ${day(d.updated_at)})`).join('; ') || 'none listed'}.</div>}
        </>
      ) : (
        <>Checked for this event{review.reviewed_by_name ? ` by ${review.reviewed_by_name}` : ''}{review.reviewed_at ? ` on ${day(review.reviewed_at)}` : ''}.</>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
        <Button variant="teal" onClick={confirm} disabled={busy !== null}>{busy === 'confirm' ? 'Saving…' : stale ? 'Still accurate for this event' : 'Check again'}</Button>
        <Button variant="ghost" onClick={suggest} disabled={busy !== null}>{busy === 'suggest' ? 'Reading the messaging doc…' : 'Suggest updates from the messaging doc'}</Button>
      </div>
      {sug && (
        <div style={{ marginTop: '10px' }}>
          {!sug.kept && <div style={{ color: 'var(--red, #b00020)', fontWeight: 700, marginBottom: '4px' }}>The suggestion changed a {'{{placeholder}}'}, so it should not be used as it is.</div>}
          {sug.changes.length === 0 ? <div>No changes suggested.</div> : <ul style={{ margin: '0 0 6px 18px', padding: 0 }}>{sug.changes.map(c => <li key={c}>{c}</li>)}</ul>}
          {onApply && sug.kept && sug.changes.length > 0 && <Button variant="ghost" onClick={() => { onApply(sug.html); setSug(null) }}>Put the suggestion into the message (not saved until you save)</Button>}
        </div>
      )}
    </div>
  )
}
