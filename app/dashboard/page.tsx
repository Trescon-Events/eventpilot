'use client'

import Link from 'next/link'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { useNavData } from '@/app/lib/nav/NavDataContext'
import { resolveSectionEntries, type ResolvedEntry } from '@/app/components/nav/AppSidebarSection'

/* My Dashboard (2026-10-01) — the landing page after login. It replaces the old AI-learning dashboard
   (readiness score, course cards, knowledge base, change-password…), which now lives at /learning under
   the sidebar's "AI Learning" group. Here: just the three modules the person is most likely to want,
   starting with My Events, then the next two modules they actually have access to (in sidebar order,
   skipping the AI Learning pages). Nothing is hard-coded per person — it is all RBAC-driven, via the same
   access list the sidebar uses. */

const LEARNING_KEYS = ['my-learning', 'course-library', 'ai-community', 'pilot-ai', 'leaderboard']
const SKIP_KEYS = ['dashboard', ...LEARNING_KEYS]

type Card = { key: string; label: string; description: string; href: string; icon: React.ReactNode; color: string; meta?: string }

export default function DashboardPage() {
  const { session, sidebarKeys, eventsData } = useNavData()
  const loading = sidebarKeys === null || eventsData === null

  const registry = getModuleRegistry()
  const accessible = new Set(sidebarKeys ?? [])
  const ctx = { staffId: session?.sid }
  const ordered: ResolvedEntry[] = (['home', 'toolkit', 'pilots', 'admin'] as const)
    .flatMap(section => resolveSectionEntries(registry, accessible, section, ctx))
    .filter(e => !SKIP_KEYS.includes(e.key))
  const descriptionFor = (key: string) => registry.find(m => m.key === key)?.description ?? ''

  // The full directory: the same entries the sidebar shows, grouped by its sections ("Brand & Content" split into Brand and Content).
  const SECTIONS: { title: string; section: 'home' | 'toolkit' | 'pilots' | 'brand' | 'admin' }[] = [
    { title: 'Brand & Content', section: 'brand' }, { title: 'Toolkit', section: 'toolkit' }, { title: 'Pilot Projects', section: 'pilots' },
    { title: 'Everyday tools', section: 'home' }, { title: 'Admin', section: 'admin' },
  ]
  const groupOf = (key: string) => registry.find(m => m.key === key)?.sidebar?.group
  const directory = SECTIONS.map(sec => {
    const entries = resolveSectionEntries(registry, accessible, sec.section, ctx).filter(e => !SKIP_KEYS.includes(e.key))
    return { title: sec.title, entries, groups: sec.section === 'brand' ? ['Brand', 'Content'].map(g => ({ name: g, entries: entries.filter(e => groupOf(e.key) === g) })) : [{ name: '', entries }] }
  }).filter(d => d.entries.length > 0)

  const eventCount = eventsData?.events.length ?? 0
  const cards: Card[] = [
    {
      key: 'my-events', label: 'My Events', color: 'var(--amber)', href: '/my-events',
      description: 'Every event you have access to — open a workspace in one click.',
      meta: eventsData ? (eventsData.allEvents ? `${eventCount} events` : `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`) : undefined,
      icon: (
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    ...ordered.slice(0, 2).map(e => ({ key: e.key, label: e.label, color: e.color, href: e.href, icon: e.icon, description: descriptionFor(e.key) })),
  ]

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>My Dashboard</h1>
      <div style={{ fontSize: '14px', color: 'var(--ink3)', marginBottom: '28px' }}>Jump straight into the modules you use most.</div>

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          {cards.map((c, i) => (
            <Link key={c.key} href={c.href}
              style={{
                display: 'flex', flexDirection: 'column', gap: '12px', padding: '22px', borderRadius: '16px', textDecoration: 'none',
                background: 'var(--card)', border: i === 0 ? `1.5px solid ${c.color}` : '1px solid var(--border)', color: 'var(--ink)',
              }}>
              <span style={{ width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${c.color} 12%, transparent)`, color: c.color }}>
                {c.icon}
              </span>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 800 }}>{c.label}</div>
                {c.meta && <div style={{ fontSize: '12px', fontWeight: 700, color: c.color, marginTop: '2px' }}>{c.meta}</div>}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5, flex: 1 }}>{c.description}</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: c.color }}>Open →</div>
            </Link>
          ))}
        </div>
      )}

      {!loading && directory.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 4px' }}>Everything you can open</h2>
          <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '20px' }}>Every page your access reaches, grouped the way the sidebar groups them.</div>
          <div style={{ display: 'grid', gap: '22px' }}>
            {directory.map(d => (
              <div key={d.title}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '8px' }}>{d.title}</div>
                {d.groups.map(g => (
                  <div key={g.name} style={{ marginBottom: g.name ? '10px' : 0 }}>
                    {g.name && <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink3)', margin: '0 0 6px' }}>{g.name}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '8px' }}>
                      {g.entries.map(e => (
                        <Link key={e.key} href={e.href} title={descriptionFor(e.key)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', textDecoration: 'none', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: '13.5px', fontWeight: 700 }}>
                          <span style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: e.color }}>{e.icon}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
