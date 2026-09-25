'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/* Warns on the Speaker Licences page when documents are being scheduled for deletion
   from the event CYCLE end date because the real event days haven't been set yet. */

type Info = { kind: 'event' | 'umbrella'; documents?: number; retention?: { basis: string; delete_on: string; documents: number }; children?: { name: string; basis: string; delete_on: string; documents: number }[] }
const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function EventDaysNotice({ scope, hubPath }: { scope: { kind: 'event' | 'umbrella'; id: string } | null; hubPath: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const query = scope ? `${scope.kind === 'umbrella' ? 'umbrella_id' : 'event_id'}=${scope.id}` : null

  useEffect(() => {
    if (!query) return
    let cancelled = false
    fetch(`/api/events/event-days?${query}`).then(r => r.ok ? r.json() : null).then(b => { if (!cancelled) setInfo(b) }).catch(() => {})
    return () => { cancelled = true }
  }, [query])

  if (!info) return null
  const unset = info.kind === 'umbrella'
    ? (info.children ?? []).filter(c => c.basis !== 'actual_dates' && c.documents > 0)
    : (info.retention && info.retention.basis !== 'actual_dates' && info.retention.documents > 0 ? [{ name: 'this event', delete_on: info.retention.delete_on, documents: info.retention.documents, basis: info.retention.basis }] : [])
  if (!unset.length) return null
  const earliest = unset.map(u => u.delete_on).sort()[0]

  return (
    <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: '13px', lineHeight: 1.6 }}>
      <strong>Event days aren&rsquo;t set</strong> for {unset.map(u => u.name).join(', ')}. Until they are, passport and ID documents are scheduled for deletion from the event cycle&rsquo;s end date (earliest: {fmt(earliest)}), not the real event.{' '}
      <Link href={hubPath} style={{ color: 'inherit', fontWeight: 700 }}>Set the event days</Link>
    </div>
  )
}
