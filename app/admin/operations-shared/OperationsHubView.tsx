'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { useOpsScope } from './scope-context'
import EventDaysCard from './EventDaysCard'

export default function OperationsHubView() {
  const scope = useOpsScope()
  const [info, setInfo] = useState<{ kind: 'event' | 'umbrella'; id: string; name: string } | null>(null)
  useBreadcrumbLabel(scope.id, info && info.id === scope.id ? info.name : null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/operations/vendors?${scope.query}`).then(r => r.ok ? r.json() : null).then(b => { if (!cancelled) setInfo(b?.scope ?? null) }).catch(() => {})
    return () => { cancelled = true }
  }, [scope.query])

  // An event under an umbrella does its licence work at the umbrella's workspace.
  const workBase = info?.kind === 'umbrella' ? `/admin/umbrellas/${info.id}/operations` : scope.basePath
  const workName = info?.kind === 'umbrella' ? info.name : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Operations"
        title={info ? `${info.name} — Operations` : 'Operations'}
        description="Vendors, licences and other event operations, in one place."
      />
      <div style={{ padding: '24px 32px', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {workName && scope.kind === 'event' && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--teal-light)', color: 'var(--teal)', fontSize: '13px', lineHeight: 1.6 }}>
            Licences and vendors for this event are handled together at <strong>{workName}</strong> level. The links below open that workspace.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
          <Link href={`${workBase}/licenses`} style={{ textDecoration: 'none' }}>
            <div style={{ padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Speaker Licences</div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.5 }}>
                Speakers with reviewed documents, grouped into batches for the licence vendor.
              </div>
            </div>
          </Link>
          <Link href={`${workBase}/vendors`} style={{ textDecoration: 'none' }}>
            <div style={{ padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Vendors</div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.5 }}>
                Shared vendor directory with contacts and portal logins. Choose which vendors are engaged.
              </div>
            </div>
          </Link>
        </div>
        <EventDaysCard kind={scope.kind} id={scope.id} />
      </div>
    </div>
  )
}
