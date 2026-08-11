'use client'

/*
  CM-002.1 · Statistics Repository — Thulasi CMOS 2.1
  Tab shell + Overview Dashboard + 6 sub-tabs.

  Slice 3 ships the shell + Overview + Company Statistics tabs.
  Slices 4-6 fill in Event Series / Event / Detail modal / Recent Changes /
  Dependency Map / Settings.
*/

import { useState } from 'react'
import Link from 'next/link'
import OverviewDashboard from './OverviewDashboard'
import CompanyStatsTab   from './CompanyStatsTab'

// Reuse the deck module's palette so both live consistently in Corporate Marketing.
const BRAND = '#F1667A'

type TabId = 'overview' | 'company' | 'event_series' | 'event' | 'recent' | 'dependencies' | 'settings'

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'overview',     label: 'Overview',              hint: 'Health of every corporate statistic at a glance' },
  { id: 'company',      label: 'Company Statistics',    hint: 'Years, Countries, Revenue, Media Reach — the headline numbers' },
  { id: 'event_series', label: 'Event Series',          hint: 'Per-series stats (World AI Show, Dubai AI Festival…)' },
  { id: 'event',        label: 'Event Statistics',      hint: 'Per-event-edition stats linked to real event records' },
  { id: 'recent',       label: 'Recent Changes',        hint: 'Audit feed of every update + which assets it impacted' },
  { id: 'dependencies', label: 'Dependency Map',        hint: 'Statistic → assets that use it (Deck, Knowledge Hub…)' },
  { id: 'settings',     label: 'Settings',              hint: 'Categories, units, workflow, default owners' },
]

export default function StatisticsRepositoryPage() {
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope)' }}>
      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '32px 24px 96px' }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '12px', letterSpacing: '0.2px' }}>
          <Link href="/admin/toolkit/corporate-marketing" style={{ color: 'var(--ink3)', textDecoration: 'none' }}>Corporate Marketing</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <span style={{ color: 'var(--ink)' }}>Statistics Repository</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '14px',
            background: `${BRAND}15`, color: BRAND,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px',
          }}>
            📊
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: BRAND, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              CM-002.1
            </div>
            <h1 style={{ margin: '4px 0 6px', fontSize: '28px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.3px' }}>
              Statistics Repository
            </h1>
            <div style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.5, maxWidth: '760px' }}>
              Single source of truth for every corporate statistic used across EventPilot — Corporate Deck, Proposal Templates,
              Sales Decks, Brochures, Articles, Emails. Marketing updates a number here once; every downstream asset that uses it
              is flagged for review.
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div style={{
          display: 'flex', gap: '2px', marginBottom: '24px',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
        }}>
          {TABS.map(t => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '12px 18px',
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${active ? BRAND : 'transparent'}`,
                  color: active ? BRAND : 'var(--ink3)',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Tab hint */}
        <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '18px' }}>
          {TABS.find(t => t.id === tab)?.hint}
        </div>

        {/* Tab body */}
        {tab === 'overview'     && <OverviewDashboard onJumpToTab={setTab} />}
        {tab === 'company'      && <CompanyStatsTab />}
        {tab === 'event_series' && <ComingSoon label="Event Series Statistics" slice="Slice 4" />}
        {tab === 'event'        && <ComingSoon label="Event Statistics"        slice="Slice 4" />}
        {tab === 'recent'       && <ComingSoon label="Recent Changes"          slice="Slice 6" />}
        {tab === 'dependencies' && <ComingSoon label="Dependency Map"          slice="Slice 6" />}
        {tab === 'settings'     && <ComingSoon label="Settings"                slice="Slice 6" />}
      </div>
    </div>
  )
}

function ComingSoon({ label, slice }: { label: string; slice: string }) {
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center',
      border: '1px dashed var(--border)', borderRadius: '16px',
      background: 'var(--card)', color: 'var(--ink3)',
    }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '13px' }}>Ships in {slice} of the CM-002.1 build. Backend endpoints are already live.</div>
    </div>
  )
}
