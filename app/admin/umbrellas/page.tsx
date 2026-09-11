'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card } from '@/app/components/ui'

/* Umbrella/event separation (2026-09-11) — umbrellas live in their own
   event_umbrellas table now (see supabase/umbrella_events_separation_migration.sql),
   so they no longer show up in the regular events list at all. This is
   the simple index to find and open one — not the fancy grouped-list-
   with-nested-children visual from the original Staff Portal screenshot
   (deliberately deferred; this page exists so umbrellas stay reachable
   at all, which is the load-bearing part). */

type UmbrellaListRow = { id: string; name: string; client_name: string | null; status: string; events?: { count: number }[] }

export default function UmbrellasListPage() {
  const [umbrellas, setUmbrellas] = useState<UmbrellaListRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/events/umbrellas').then(r => r.json()).then(d => setUmbrellas(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader eyebrow="Events" title="Umbrella Events" description="Groupings of related events sharing top-level reference documents and content rules." />
      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
      ) : umbrellas.length === 0 ? (
        <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)', textAlign: 'center', padding: '10px' }}>No umbrella events yet.</div></Card>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {umbrellas.map(u => (
            <a key={u.id} href={`/admin/umbrellas/${u.id}`} style={{ textDecoration: 'none' }}>
              <Card padded>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{u.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
                      {u.client_name} · {u.status} · {u.events?.[0]?.count ?? 0} child event{(u.events?.[0]?.count ?? 0) === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
