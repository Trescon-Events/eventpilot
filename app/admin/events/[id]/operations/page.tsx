'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

export default function OperationsHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState<string | null>(null)
  useBreadcrumbLabel(eventId, eventName)

  useEffect(() => {
    fetch(`/api/events?id=${eventId}`).then(r => r.ok ? r.json() : null).then(d => setEventName(d?.name ?? null))
  }, [eventId])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Operations"
        title={eventName ? `${eventName} — Operations` : 'Operations'}
        description="Vendors, licences and other event operations, in one place."
      />
      <div style={{ padding: '24px 32px', maxWidth: '960px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
        <Link href={`/admin/events/${eventId}/operations/licenses`} style={{ textDecoration: 'none' }}>
          <div style={{ padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Speaker Licences</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.5 }}>
              Speakers with reviewed documents, grouped into batches for the licence vendor.
            </div>
          </div>
        </Link>
        <Link href={`/admin/events/${eventId}/operations/vendors`} style={{ textDecoration: 'none' }}>
          <div style={{ padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Vendors</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.5 }}>
              Shared vendor directory with contacts. Choose which vendors are engaged on this event.
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
