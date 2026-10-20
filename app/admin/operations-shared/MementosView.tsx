'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Badge } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { useOpsScope } from './scope-context'

/* Operations > Mementos: every batch of speaker photos pushed by producers for this event (or, at umbrella level, all its events).
   The producer's "Push to Ops" lands here; opening a row goes to the review / send-to-vendor page. */

type Status = 'requested' | 'sent' | 'downloaded' | 'confirmed' | 'issue' | 'revoked'
type Row = { id: string; batch_id: string; batch_name: string; event_id: string; event_name: string; status: Status; speakers: number; requested_at: string; sent_at: string | null; responded_at: string | null; vendor_name: string | null; href: string }

const STATUS: Record<Status, { label: string; color: 'amber' | 'teal' | 'purple' | 'grey' | 'red' }> = {
  requested: { label: 'Needs your review', color: 'amber' },
  sent: { label: 'With the vendor', color: 'purple' },
  downloaded: { label: 'Downloaded by vendor', color: 'purple' },
  confirmed: { label: 'Vendor confirmed', color: 'teal' },
  issue: { label: 'Vendor reported a problem', color: 'red' },
  revoked: { label: 'Revoked', color: 'grey' },
}

export default function MementosView() {
  const scope = useOpsScope()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useBreadcrumbLabel(scope.id, name)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/events/operations/mementos?${scope.query}`)
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) { setError(data.error ?? 'Could not load Mementos.'); setRows([]); return }
      setRows(data.dispatches); setName(data.scope?.name ?? null)
    })()
    return () => { cancelled = true }
  }, [scope.query])

  const waiting = rows?.filter(r => r.status === 'requested' || r.status === 'issue').length ?? 0
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Operations" title="Mementos" backHref={scope.basePath} backLabel="Operations"
        description={waiting > 0 ? `${waiting} batch${waiting === 1 ? '' : 'es'} need${waiting === 1 ? 's' : ''} your attention.` : 'Speaker photos pushed by producers for the memento vendor: review them, send to the vendor, and see them confirmed.'} />
      <div style={{ padding: '24px 32px', maxWidth: '960px' }}>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}
        {rows === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : rows.length === 0 && !error ? (
          <div style={{ color: 'var(--ink3)', fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>Nothing yet. When a producer pushes a memento batch it will appear here.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {rows.map(r => (
              <Link key={r.id} href={r.href} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '14px 18px', border: `1px solid ${r.status === 'requested' || r.status === 'issue' ? 'var(--amber)' : 'var(--border-light)'}`, borderRadius: '10px', background: 'var(--card)' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{r.batch_name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{r.event_name} · {r.speakers} speaker{r.speakers === 1 ? '' : 's'} · pushed {new Date(r.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  </div>
                  {r.vendor_name && <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>{r.vendor_name}</div>}
                  <Badge color={STATUS[r.status].color}>{STATUS[r.status].label}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
