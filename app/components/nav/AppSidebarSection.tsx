'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleDef, SidebarSection } from '@/app/lib/registry/modules'

export type ResolvedEntry = {
  key: string
  label: string
  icon: React.ReactNode
  color: string
  href: string
  order: number
}

// Home/Pilots/Admin/Toolkit are all flat lists in the current roster (no
// entry nests under another within these sections) — Events is the one
// section with real per-user, per-event nesting, handled separately by
// EventsSidebarSection since its data isn't registry rows at all.
export function resolveSectionEntries(
  registry: ModuleDef[],
  accessibleKeys: Set<string>,
  section: SidebarSection,
  ctx: { staffId?: string }
): ResolvedEntry[] {
  return registry
    .filter(m => m.sidebar?.section === section && accessibleKeys.has(m.key))
    .map(m => ({
      key: m.key,
      label: m.sidebar?.label ?? m.label,
      icon: m.sidebar?.icon ?? m.icon,
      color: m.color,
      href: typeof m.href === 'function' ? m.href(ctx) : m.href,
      order: m.sidebar?.order ?? 999,
    }))
    .sort((a, b) => a.order - b.order)
}

export default function AppSidebarSection({ title, entries, collapsedRail, hideTitle }: { title: string; entries: ResolvedEntry[]; collapsedRail: boolean; hideTitle?: boolean }) {
  const pathname = usePathname()
  if (entries.length === 0) return null

  return (
    <div style={{ marginBottom: '4px' }}>
      {!collapsedRail && !hideTitle && (
        <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink4)', padding: '9px 12px 5px' }}>
          {title}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {entries.map(item => {
          const base = item.href.split('?')[0]
          const active = pathname === base || pathname.startsWith(base + '/')
          return (
            <Link
              key={item.key}
              href={item.href}
              title={collapsedRail ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
                borderRadius: '8px', textDecoration: 'none', position: 'relative',
                fontSize: '13.5px', fontWeight: active ? 800 : 600,
                color: active ? item.color : 'var(--ink3)',
                background: active ? `${item.color}12` : 'transparent',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              {active && (
                <span style={{ position: 'absolute', left: 0, top: '8px', bottom: '8px', width: '3px', borderRadius: '0 3px 3px 0', background: item.color }} />
              )}
              <span style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: active ? item.color : 'var(--ink3)' }}>
                {item.icon}
              </span>
              {!collapsedRail && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/* Collapsible group (2026-10-01) — used for "AI Learning": the learning pages (My Learning, Course
   Library, AI Community, Messages, Talk to Pilot, Leaderboard) sit together under one heading at the
   bottom of the sidebar, collapsed by default (opens by itself when you are on one of its pages, and
   remembers if you open it). */
export function AppSidebarGroup({ title, entries, collapsedRail }: { title: string; entries: ResolvedEntry[]; collapsedRail: boolean }) {
  const pathname = usePathname()
  const hasActive = entries.some(e => { const base = e.href.split('?')[0]; return pathname === base || pathname.startsWith(base + '/') })
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  useEffect(() => {
    try {
      const v = localStorage.getItem('sidebar-ai-learning-open')
      if (v !== null) setUserOpen(v === '1') // eslint-disable-line react-hooks/set-state-in-effect -- read once from storage on mount
    } catch { /* storage unavailable — stay collapsed */ }
  }, [])
  if (entries.length === 0) return null
  const open = hasActive || userOpen === true

  const toggle = () => {
    const next = !open
    setUserOpen(next)
    try { localStorage.setItem('sidebar-ai-learning-open', next ? '1' : '0') } catch { /* best-effort */ }
  }

  return (
    <div style={{ marginBottom: '4px' }}>
      {!collapsedRail && (
        <button type="button" onClick={toggle} aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '10.5px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink4)', padding: '9px 12px 5px' }}>
          <span>{title}</span>
          <span style={{ fontSize: '11px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .1s' }}>›</span>
        </button>
      )}
      {(open || collapsedRail) && (
        <div style={{ display: collapsedRail && !open ? 'none' : 'block' }}>
          <AppSidebarSection title="" entries={entries} collapsedRail={collapsedRail} hideTitle />
        </div>
      )}
    </div>
  )
}
