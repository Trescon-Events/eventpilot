'use client'

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

export default function AppSidebarSection({ title, entries, collapsedRail }: { title: string; entries: ResolvedEntry[]; collapsedRail: boolean }) {
  const pathname = usePathname()
  if (entries.length === 0) return null

  return (
    <div style={{ marginBottom: '4px' }}>
      {!collapsedRail && (
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
