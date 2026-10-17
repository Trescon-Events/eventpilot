'use client'

import Link from 'next/link'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { useNavData } from '@/app/lib/nav/NavDataContext'
import { resolveSectionEntries, type ResolvedEntry } from '@/app/components/nav/AppSidebarSection'

/* My Dashboard (2026-10-01; redesigned 2026-10-17 as a modern SaaS home: quick-access cards on top, then every workspace the person can open,
   grouped, in a responsive grid that uses the full width). Original note:
   My Dashboard (2026-10-01) — the landing page after login. It replaces the old AI-learning dashboard
   (readiness score, course cards, knowledge base, change-password…), which now lives at /learning under
   the sidebar's "AI Learning" group. Here: just the three modules the person is most likely to want,
   starting with My Events, then the next two modules they actually have access to (in sidebar order,
   skipping the AI Learning pages). Nothing is hard-coded per person — it is all RBAC-driven, via the same
   access list the sidebar uses. */

const LEARNING_KEYS = ['my-learning', 'course-library', 'ai-community', 'pilot-ai', 'leaderboard']
const SKIP_KEYS = ['dashboard', ...LEARNING_KEYS]

type Card = { key: string; label: string; description: string; href: string; icon: React.ReactNode; color: string; meta?: string }

const CSS = `
.dash-card, .dash-row { --accent: var(--teal-mid); position: relative; display: flex; text-decoration: none; color: var(--ink); background: var(--card);
  border: 1px solid var(--border); transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease, background .15s ease; }
.dash-card:hover, .dash-row:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); box-shadow: 0 6px 20px -8px color-mix(in srgb, var(--accent) 45%, transparent); transform: translateY(-1px); }
.dash-card:focus-visible, .dash-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.dash-card { flex-direction: column; gap: 14px; padding: 18px; border-radius: 16px; min-height: 148px; }
.dash-card .go { position: absolute; top: 18px; right: 18px; opacity: 0; transform: translateX(-4px); transition: all .15s ease; font-weight: 800; color: var(--accent); }
.dash-card:hover .go { opacity: 1; transform: none; }
.dash-row { align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; }
.dash-chip { display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.dash-clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dash-skel { border-radius: 16px; background: linear-gradient(90deg, var(--card) 0%, color-mix(in srgb, var(--card) 70%, var(--border)) 50%, var(--card) 100%); background-size: 200% 100%; animation: dash-shimmer 1.4s infinite linear; border: 1px solid var(--border); }
@keyframes dash-shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
`

const sectionTitle: React.CSSProperties = { fontSize: '13px', fontWeight: 800, letterSpacing: '0.2px', color: 'var(--ink)', margin: 0 }

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
  const directory = SECTIONS.map(sec => ({ ...sec, entries: resolveSectionEntries(registry, accessible, sec.section, ctx).filter(e => !SKIP_KEYS.includes(e.key)) }))
    .filter(d => d.entries.length > 0)

  const eventCount = eventsData?.events.length ?? 0
  const cards: Card[] = [
    {
      key: 'my-events', label: 'My Events', color: 'var(--amber)', href: '/my-events',
      description: 'Every event you have access to. Open a workspace in one click.',
      meta: eventsData ? `${eventCount} ${eventCount === 1 ? 'event' : 'events'}` : undefined,
      icon: (
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    { key: 'bc-home', label: 'Brand & Content', color: 'var(--purple)', href: '/brand-content', meta: 'Standards', description: 'The brand book, fonts, creative standards, content style guide and approved company profile.', icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> },
    ...ordered.slice(0, 2).map(e => ({ key: e.key, label: e.label, color: e.color, href: e.href, icon: e.icon, description: descriptionFor(e.key) })),
  ]

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '36px 32px 72px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <style>{CSS}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--ink)', margin: '0 0 6px' }}>Welcome back</h1>
          <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>Everything you can open in EventPilot, in one place.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--ink3)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
          Quick search <kbd style={{ fontFamily: 'inherit', fontSize: '11.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', border: '1px solid var(--border)', color: 'var(--ink2)' }}>⌘ K</kbd>
        </div>
      </div>

      {loading ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px', marginBottom: '40px' }}>
            {[0, 1, 2, 3].map(i => <div key={i} className="dash-skel" style={{ height: '148px' }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} className="dash-skel" style={{ height: '62px', borderRadius: '12px' }} />)}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px', marginBottom: '44px' }}>
            {cards.map(c => (
              <Link key={c.key} href={c.href} className="dash-card" style={{ ['--accent' as string]: c.color }}>
                <span className="dash-chip" style={{ width: '42px', height: '42px', borderRadius: '12px' }}>{c.icon}</span>
                <span className="go">→</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.1px' }}>{c.label}</span>
                    {c.meta && <span style={{ fontSize: '11.5px', fontWeight: 700, color: c.color }}>{c.meta}</span>}
                  </div>
                  <div className="dash-clamp" style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5, marginTop: '4px' }}>{c.description}</div>
                </div>
              </Link>
            ))}
          </div>

          {directory.length > 0 && (
            <div style={{ display: 'grid', gap: '32px' }}>
              {directory.map(d => (
                <section key={d.title}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <h2 style={sectionTitle}>{d.title}</h2>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', padding: '1px 8px', borderRadius: '999px', border: '1px solid var(--border)' }}>{d.entries.length}</span>
                    {d.section === 'brand' && <Link href="/brand-content" style={{ marginLeft: 'auto', fontSize: '12.5px', fontWeight: 700, color: 'var(--teal-mid)', textDecoration: 'none' }}>Open workspace →</Link>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                    {d.entries.map(e => (
                      <Link key={e.key} href={e.href} className="dash-row" title={descriptionFor(e.key)} style={{ ['--accent' as string]: e.color }}>
                        <span className="dash-chip" style={{ width: '34px', height: '34px', borderRadius: '10px' }}>{e.icon}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                          <span style={{ display: 'block', fontSize: '12px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>{descriptionFor(e.key)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
