import type { ModuleDef } from '@/app/lib/registry/modules'
import type { MyEvent } from './NavDataContext'

/*
  Cmd+K command palette index — v1 scoped to navigation destinations only
  (jump to a tool, jump to a named event), deliberately NOT deep content
  search (a specific stakeholder/course/doc). That's a real, separate
  system — new search endpoints per content type, each needing its own
  access re-check — and conflating it with navigation risked this slipping
  indefinitely. Parked as a v2 idea, not silently dropped.

  Pure function over the exact same trees AppSidebar already fetched (via
  NavDataContext, shared through React context, not a second fetch) — so
  every result here is already access-filtered by construction. There is
  no separate access check to keep in sync: an event only appears because
  it was already in eventsData.events (itself already filtered), and its
  tools only appear via that event's own already-filtered toolKeys.
*/

export type PaletteEntry = {
  id: string
  label: string
  sublabel?: string
  href: string
  icon: React.ReactNode
  color: string
  keywords: string
}

const EVENT_ICON = (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

export function flattenForSearch(
  registry: ModuleDef[],
  accessibleKeys: Set<string>,
  eventsData: { allEvents: boolean; events: MyEvent[] } | null,
  ctx: { staffId?: string }
): PaletteEntry[] {
  const entries: PaletteEntry[] = []

  // Static sidebar-tagged destinations — Home/Pilots/Admin/Toolkit. The
  // Events section is handled separately below since its data is per-user
  // event rows, not registry entries.
  for (const m of registry) {
    if (!m.sidebar || m.sidebar.section === 'events' || !accessibleKeys.has(m.key)) continue
    const label = m.sidebar.label ?? m.label
    entries.push({
      id: m.key,
      label,
      href: typeof m.href === 'function' ? m.href(ctx) : m.href,
      icon: m.sidebar.icon ?? m.icon,
      color: m.color,
      keywords: `${label} ${m.description}`.toLowerCase(),
    })
  }

  // Named events + each event's own visible tools.
  if (eventsData) {
    const toolDefByKey = new Map(registry.map(m => [m.key, m]))
    for (const ev of eventsData.events) {
      entries.push({
        id: `event:${ev.id}`,
        label: ev.name,
        sublabel: 'Event',
        href: `/admin/events/${ev.id}`,
        icon: EVENT_ICON,
        color: 'var(--teal)',
        keywords: ev.name.toLowerCase(),
      })
      for (const key of ev.toolKeys) {
        const mod = toolDefByKey.get(key)
        if (!mod) continue
        const label = mod.sidebar?.label ?? mod.label
        entries.push({
          id: `event:${ev.id}:${key}`,
          label,
          sublabel: ev.name,
          href: typeof mod.href === 'function' ? mod.href({ eventId: ev.id }) : mod.href,
          icon: mod.sidebar?.icon ?? mod.icon,
          color: mod.color,
          keywords: `${label} ${ev.name}`.toLowerCase(),
        })
      }
    }
  }

  return entries
}
