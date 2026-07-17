'use client'

import PageHeader from '@/app/components/PageHeader'
import AccessTab from '@/app/components/AccessTab'

export default function BespokeTrackerSettingsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <PageHeader eyebrow="Bespoke Tracker" title="Settings" />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card-hi)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, fontFamily: 'inherit' }}>
            Access
          </button>
        </div>
        <AccessTab moduleKey="bespoke-tracker" moduleLabel="Bespoke Tracker" />
      </div>
    </div>
  )
}
