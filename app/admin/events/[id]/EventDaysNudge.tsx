'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/app/components/ui'

/* "The event days are missing" nudge (2026-11-11). The event days (real first and last day) come from the Staff Portal and drive the post-event
   banner, the thank-you note, passport/ID deletion and the countdowns. Most events carried over from the Staff Portal have none yet, and the old
   ones are only listings, so nothing is assumed: whoever lands on an event's workspace home gets a dialog until the days exist, and every other
   page of the workspace carries a slim bar. "Not now" hides the dialog for that visit only; it comes back on the next one. */

type Ev = { hrms_project_id?: string | null; actual_start_date?: string | null }

export default function EventDaysNudge({ eventId }: { eventId: string }) {
  const pathname = usePathname()
  const [ev, setEv] = useState<Ev | null>(null)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/events?id=${eventId}`, { cache: 'no-store' }).catch(() => null)
    const d = res && res.ok ? await res.json().catch(() => null) : null
    const row = Array.isArray(d) ? d[0] : d
    setEv(row && typeof row === 'object' ? row : null)
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch on mount and on navigation within the workspace
  useEffect(() => { void load() }, [load, pathname])

  if (!ev || ev.actual_start_date) return null
  const linked = !!ev.hrms_project_id
  const isHome = pathname === `/admin/events/${eventId}`
  const detailsHref = `/admin/events/${eventId}/details`

  async function refresh() {
    setBusy(true); setNote(null)
    const res = await fetch('/api/events/staff-portal-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId }) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setNote(d.error ?? 'Could not refresh from the Staff Portal.'); return }
    await load()
    setNote('Refreshed. If the event days are still empty, they have not been filled in on the Staff Portal yet.')
  }

  const message = linked
    ? 'The event days (first and last day of the event) are not set. Add them on this project in the Staff Portal, then refresh here. Until then the post-event prompt, the thank-you note and the countdowns cannot work for this event.'
    : 'The event days (first and last day of the event) are not set. Add them on the Event Details page. Until then the post-event prompt, the thank-you note and the countdowns cannot work for this event.'

  if (isHome && !hidden) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Event days missing" style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ maxWidth: '480px', width: '100%', background: 'var(--card)', border: '1px solid var(--amber)', borderRadius: '14px', padding: '22px 24px' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Update the event dates</div>
          <div style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.65 }}>{message}</div>
          {note && <div style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--amber)', fontWeight: 600 }}>{note}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setHidden(true)}>Not now</Button>
            {linked
              ? <Button variant="teal" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh from Staff Portal'}</Button>
              : <Link href={detailsHref}><Button variant="teal">Open Event Details</Button></Link>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div role="status" style={{ margin: '0', padding: '8px 16px', background: 'var(--amber-light)', borderBottom: '1px solid var(--amber)', fontSize: '12.5px', color: 'var(--ink)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 300px' }}><strong>Event days are missing.</strong> {linked ? 'Add them in the Staff Portal, then refresh.' : 'Add them on the Event Details page.'}</span>
      <Link href={detailsHref} style={{ fontWeight: 700, color: 'var(--teal-mid)' }}>Event Details</Link>
    </div>
  )
}
