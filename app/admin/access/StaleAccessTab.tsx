'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui'

/* Eligibility gate + stale-access report (2026-09-11, Madhu): event-scoped
   access is meant to be held only by that event's actual Staff (the
   event_staff roster carried forward from Staff Portal). New grants are
   blocked at the source (see .../assignments/route.ts POST) — this tab
   surfaces EXISTING grants that already violate it, for a human to review
   and revoke. Never auto-revokes anything. See app/api/events/access/
   stale/route.ts for the full reasoning, including why this can under-
   report (event_staff rows aren't cleaned up when someone rolls off an
   event today). */

type StaleRow = {
  id: string
  event_id: string
  staff_id: string
  granted_at: string
  auto_granted: boolean
  staff_members: { name: string; email: string } | null
  access_roles_catalog: { name: string } | null
  events: { name: string } | null
}

export default function StaleAccessTab() {
  const [rows, setRows] = useState<StaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/events/access/stale')
    const data = await res.json().catch(() => [])
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this module's other top-level fetchAll effects
    load()
  }, [])

  async function revoke(id: string) {
    if (!window.confirm('Revoke this access? The person keeps any other roles they hold.')) return
    setRevoking(id)
    await fetch(`/api/events/access/assignments/${id}`, { method: 'DELETE' })
    setRevoking(null)
    await load()
  }

  if (loading) return <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 16px', maxWidth: '680px' }}>
        Event-scoped access held by someone who isn&apos;t on that event&apos;s Staff roster right now — either the grant predates the eligibility rule, or they&apos;ve since rolled off the event in Staff Portal. Revoking here only removes this one role for this one event; nothing else they hold is touched.
      </p>
      {rows.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '24px', textAlign: 'center' }}>
          Nothing stale right now.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {rows.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                  {r.staff_members?.name ?? 'Unknown staff'} <span style={{ fontWeight: 500, color: 'var(--ink3)' }}>({r.staff_members?.email})</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
                  {r.access_roles_catalog?.name ?? 'Unknown role'} on <strong>{r.events?.name ?? 'Unknown event'}</strong>
                  {r.auto_granted && <span style={{ marginLeft: '6px', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--teal-mid)' }}>auto-granted</span>}
                </div>
              </div>
              <Button variant="ghost" onClick={() => revoke(r.id)} disabled={revoking === r.id}>{revoking === r.id ? 'Revoking…' : 'Revoke'}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
