'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Badge } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { useOpsScope } from './scope-context'

/* Operations > Badge Printing: every speaker-badge print hand-off for this event (or, at umbrella level, all its events).
   The producer's "Notify Ops" lands here; opening a row goes to the review / send-to-vendor page. */

type Row = { id: string; batch_id: string; batch_name: string; event_id: string; event_name: string; status: 'requested' | 'sent' | 'downloaded' | 'printed' | 'revoked'; badges: number; version: number; requested_at: string; sent_at: string | null; printed_at: string | null; vendor_name: string | null; href: string }

const STATUS: Record<Row['status'], { label: string; color: 'amber' | 'teal' | 'purple' | 'grey' | 'red' }> = {
  requested: { label: 'Needs your review', color: 'amber' },
  sent: { label: 'With the printer', color: 'purple' },
  downloaded: { label: 'Downloaded by printer', color: 'purple' },
  printed: { label: 'Printed', color: 'teal' },
  revoked: { label: 'Revoked', color: 'grey' },
}

export default function BadgePrintingView() {
  const scope = useOpsScope()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useBreadcrumbLabel(scope.id, name)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/events/operations/badges?${scope.query}`)
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) { setError(data.error ?? 'Could not load Badge Printing.'); setRows([]); return }
      setRows(data.dispatches); setName(data.scope?.name ?? null)
    })()
    return () => { cancelled = true }
  }, [scope.query])

  const waiting = rows?.filter(r => r.status === 'requested').length ?? 0
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Operations" title="Badge Printing" backHref={scope.basePath} backLabel="Operations"
        description={waiting > 0 ? `${waiting} print file${waiting === 1 ? '' : 's'} waiting for your review.` : 'Speaker badge print files released by producers: review them, send to the print vendor, and see them confirmed printed.'} />
      <div style={{ padding: '24px 32px', maxWidth: '960px' }}>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}
        {rows === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : rows.length === 0 && !error ? (
          <div style={{ color: 'var(--ink3)', fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>Nothing yet. When a producer releases a badge batch for printing it will appear here.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {rows.map(r => (
              <Link key={r.id} href={r.href} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '14px 18px', border: `1px solid ${r.status === 'requested' ? 'var(--amber)' : 'var(--border-light)'}`, borderRadius: '10px', background: 'var(--card)' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{r.batch_name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{r.event_name} · {r.badges} badge{r.badges === 1 ? '' : 's'} · file v{r.version} · requested {new Date(r.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
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
