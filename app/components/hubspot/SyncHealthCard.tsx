'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card } from '@/app/components/ui'
import type { FormHealth } from '@/app/lib/hubspot/submission-gap'

/* "Sync health" for one connected HubSpot form: does everything HubSpot recorded exist in EventPilot, and is the HubSpot workflow still set up to deliver repeat submissions?
   Nothing here changes anything until a person presses a button. */

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never')

export default function SyncHealthCard({ eventId, formType, canManage }: { eventId: string; formType: string; canManage: boolean }) {
  const [h, setH] = useState<FormHealth | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const url = `/api/events/stakeholders/hubspot/sync-health?event_id=${eventId}&form_type=${formType}`
  const fetchHealth = useCallback(() => fetch(url).then(async res => {
    const d = await res.json().catch(() => ({}))
    if (res.ok) { setH(d.health); setErr(null) } else setErr(d.error ?? 'Could not check.')
  }), [url])
  useEffect(() => { let live = true; fetch(url).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => { if (!live) return; if (ok) setH(d.health); else setErr(d.error ?? 'Could not check.') }).catch(() => { if (live) setErr('Could not check.') }); return () => { live = false } }, [url])
  async function load() { setBusy('check'); await fetchHealth(); setBusy(null) }

  async function act(action: 'fill' | 'dismiss' | 'repair', ids?: string[]) {
    if (action === 'repair' && !window.confirm('This edits the live HubSpot workflow for this form: it turns on re-enrollment so a second submission by the same person reaches EventPilot. Nothing else in the workflow changes. Continue?')) return
    if (action === 'dismiss' && !window.confirm('Stop listing these? Use this for spam or submissions you deleted on purpose. They will not be brought in.')) return
    setBusy(action); setErr(null); setNote(null)
    const res = await fetch('/api/events/stakeholders/hubspot/sync-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, form_type: formType, action, conversion_ids: ids }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setErr(d.error ?? 'Failed.'); return }
    setH(d.health)
    if (action === 'fill') setNote(d.added ? `Brought in ${d.added}. They are in the submissions inbox now.` : 'Nothing new to bring in.')
    if (action === 'repair') setNote(d.changed ? 'Re-enrollment is back on.' : 'Nothing needed fixing.')
  }

  if (!h) return <Card padded style={{ marginTop: '12px' }}><div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{err ?? 'Checking sync health…'}</div></Card>

  const gap = h.gap, bad = gap.length > 0 || h.workflow_ok === false || !!h.check_error
  return (
    <Card padded color={bad ? 'amber' : 'teal'} style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>Sync health</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px', maxWidth: '620px' }}>
            {gap.length ? `HubSpot has ${gap.length} submission${gap.length > 1 ? 's' : ''} EventPilot doesn't.` : 'Everything HubSpot recorded is in EventPilot.'}{' '}
            Since monitoring began ({when(h.since)}): HubSpot {h.hubspot_count}, EventPilot {h.eventpilot_count}. Last one received {when(h.last_received_at)}. Checked {when(h.checked_at)}, then every 15 minutes.
          </div>
        </div>
        <Button variant="ghost" onClick={load} disabled={!!busy}>{busy === 'check' ? 'Checking…' : 'Check now'}</Button>
      </div>

      {h.check_error && <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '8px' }}>The last check failed ({h.check_error}); showing the previous result.</div>}

      {h.workflow_ok === false && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink)' }}>
          <strong>HubSpot workflow:</strong> {h.workflow_problem}
          {canManage && h.workflow_problem?.includes('re-enroll') && <> <Button variant="amber" onClick={() => act('repair')} disabled={!!busy}>{busy === 'repair' ? 'Fixing…' : 'Fix re-enrollment in HubSpot'}</Button></>}
        </div>
      )}
      {h.workflow_ok === null && h.workflow_problem && <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink3)' }}>{h.workflow_problem}</div>}

      {gap.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '6px' }}>Check HubSpot&apos;s spam tab for the form first — a submission it is holding there shows up here until it is released.</div>
          {gap.map(g => (
            <div key={g.conversion_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '6px 0', borderTop: '1px solid var(--line, #0001)', fontSize: '12px' }}>
              <span><strong>{g.email || 'no email'}</strong> · submitted {when(g.submitted_at)}</span>
              {canManage && (
                <span style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="teal" onClick={() => act('fill', [g.conversion_id])} disabled={!!busy}>Bring in</Button>
                  <Button variant="ghost" onClick={() => act('dismiss', [g.conversion_id])} disabled={!!busy}>Ignore</Button>
                </span>
              )}
            </div>
          ))}
          {canManage && gap.length > 1 && <div style={{ marginTop: '8px' }}><Button variant="teal" onClick={() => act('fill', gap.map(g => g.conversion_id))} disabled={!!busy}>{busy === 'fill' ? 'Bringing in…' : `Bring in all ${gap.length}`}</Button></div>}
        </div>
      )}

      {h.recent_errors.length > 0 && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink3)' }}>
          Recent delivery problems: {h.recent_errors.map(e => `${when(e.created_at)} ${e.stage}: ${e.message}`).join(' · ')}
        </div>
      )}
      {note && <div style={{ fontSize: '12px', color: 'var(--ink)', marginTop: '8px' }}>{note}</div>}
      {err && <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '8px' }}>{err}</div>}
    </Card>
  )
}
