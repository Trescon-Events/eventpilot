'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import AccessTab from '@/app/components/AccessTab'

/*
  Shared "who can use this tool at all" settings page for the three
  event-scoped tools (Website Builder, Market Intelligence, Brand Studio).
  Their pages live nested under /admin/events/[id]/..., but access to them is
  a global per-staff-member concern, not per-event — so this page lives here
  instead of under any single event, with its own gate at
  app/admin/toolkit/settings/layout.tsx. Modeled on
  app/admin/toolkit/docuhub/settings/page.tsx's multi-tab pattern, just with
  3 tabs instead of Document Types/Access/Activity — each tab is nothing more
  than <AccessTab moduleKey="..." /> since these tools have no admin-only
  config beyond who's granted access.
*/

const TABS = [
  { key: 'website-builder', label: 'Website Builder' },
  { key: 'market-intel', label: 'Market Intelligence' },
  { key: 'brand-studio', label: 'Brand Studio' },
] as const

type TabKey = typeof TABS[number]['key']

function EventToolsSettingsInner() {
  const searchParams = useSearchParams()
  const requested = searchParams.get('tab')
  const initialTab = TABS.find(t => t.key === requested)?.key ?? 'website-builder'
  const [tab, setTab] = useState<TabKey>(initialTab)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <PageHeader eyebrow="Toolkit" title="Event Tools Access" description="Manage who can use Website Builder, Market Intelligence, and Brand Studio — access applies across all events, not just one." />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${tab === t.key ? 'var(--amber-border)' : 'var(--border)'}`, background: tab === t.key ? 'var(--amber-light)' : 'var(--card)', color: tab === t.key ? 'var(--amber)' : 'var(--ink3)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'website-builder' && <AccessTab moduleKey="website-builder" moduleLabel="Website Builder" />}
        {tab === 'market-intel' && <AccessTab moduleKey="market-intel" moduleLabel="Market Intelligence" />}
        {tab === 'brand-studio' && <AccessTab moduleKey="brand-studio" moduleLabel="Brand Studio" />}
      </div>
    </div>
  )
}

export default function EventToolsSettingsPage() {
  return (
    <Suspense fallback={null}>
      <EventToolsSettingsInner />
    </Suspense>
  )
}
