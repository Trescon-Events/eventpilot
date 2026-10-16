'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { ViewOnly, useBrandContentAccess } from '@/app/components/brand-content/access'
import LogoHandlingTab from './LogoHandlingTab'
import PhotoHandlingTab from './PhotoHandlingTab'
import PlaceholdersTab from './PlaceholdersTab'

const TABS = [
  { id: 'logo', label: 'Logo handling' },
  { id: 'photo', label: 'Speaker photo handling' },
  { id: 'placeholders', label: 'Creative placeholders' },
] as const
type TabId = typeof TABS[number]['id']

function CreativeStandards() {
  const access = useBrandContentAccess()
  const param = useSearchParams().get('tab')
  const [tab, setTab] = useState<TabId>(TABS.some(t => t.id === param) ? (param as TabId) : 'logo')
  return (
    <div style={{ padding: '24px 32px' }}>
      <PageHeader eyebrow="Brand" title="Creative standards" description="The rules every creative follows: how logos are handled, how speaker photos are cleaned, and the default placeholders." />
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '5px', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} data-keep onClick={() => setTab(t.id)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 800, background: tab === t.id ? 'var(--surface)' : 'transparent', color: tab === t.id ? 'var(--lime)' : 'var(--ink3)' }}>{t.label}</button>
        ))}
      </div>
      {tab === 'logo' && <LogoHandlingTab />}
      {tab === 'photo' && <ViewOnly canEdit={access?.can_edit_brand}><PhotoHandlingTab /></ViewOnly>}
      {tab === 'placeholders' && <ViewOnly canEdit={access?.can_edit_brand}><PlaceholdersTab /></ViewOnly>}
    </div>
  )
}

export default function CreativeStandardsPage() {
  return <Suspense fallback={null}><CreativeStandards /></Suspense>
}
