'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import type { MyEvent } from '@/app/lib/nav/NavDataContext'

/*
  The Events section is a hybrid, unlike Home/Pilots/Admin/Toolkit: the
  registry only holds which tool TEMPLATES exist (website-builder,
  admin-event-stakeholders, ...) and their access rule — the actual
  per-user event list, and which of those templates are visible on each
  specific event, is data from GET /api/events/access/my-events (see
  app/lib/nav/NavDataContext.tsx), not registry rows. This component
  resolves each event's toolKeys back against the registry for display
  data (label/icon/color/href) — the same "server decides access, client
  renders" split every other nav surface in this codebase already uses.
*/

const SEARCH_THRESHOLD = 6 // below this, a search box is just noise

export default function EventsSidebarSection({
  eventsData,
  collapsedRail,
}: {
  eventsData: { allEvents: boolean; events: MyEvent[] } | null
  collapsedRail: boolean
}) {
  const pathname = usePathname()
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  if (collapsedRail) {
    return (
      <Link
        href="/admin?tab=events"
        title="Events"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px 8px', padding: '9px',
          borderRadius: '8px', color: 'var(--ink3)', textDecoration: 'none',
        }}
      >
        <CalendarIcon />
      </Link>
    )
  }

  const registry = getModuleRegistry()
  const toolDefByKey = new Map(registry.map(m => [m.key, m]))

  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink4)', padding: '9px 12px 5px' }}>
        Events
      </div>

      {eventsData === null ? (
        <div style={{ padding: '6px 12px 10px', fontSize: '12px', color: 'var(--ink4)' }}>Loading…</div>
      ) : eventsData.events.length === 0 ? (
        <div style={{ padding: '6px 12px 10px', fontSize: '12px', color: 'var(--ink4)' }}>
          No events assigned yet. Ask your manager or admin for access.
        </div>
      ) : (
        <>
          {eventsData.events.length > SEARCH_THRESHOLD && (
            <div style={{ padding: '0 12px 6px' }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search events…"
                style={{
                  width: '100%', fontSize: '12px', padding: '6px 9px', borderRadius: '7px', boxSizing: 'border-box',
                  border: '1px solid var(--border-light)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit',
                }}
              />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {eventsData.events
              .filter(ev => !query || ev.name.toLowerCase().includes(query.toLowerCase()))
              .map(ev => {
                const isOpen = openEventId === ev.id || pathname.startsWith(`/admin/events/${ev.id}`)
                const tools = ev.toolKeys
                  .map(k => toolDefByKey.get(k))
                  .filter((m): m is NonNullable<typeof m> => !!m)
                  .sort((a, b) => (a.sidebar?.order ?? 999) - (b.sidebar?.order ?? 999))

                return (
                  <div key={ev.id}>
                    <button
                      onClick={() => setOpenEventId(isOpen ? null : ev.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                        border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink4)" strokeWidth="3" strokeLinecap="round"
                        style={{ flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                      <span style={{
                        fontSize: '13px', fontWeight: isOpen ? 800 : 600, color: isOpen ? 'var(--ink)' : 'var(--ink3)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ev.name}
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '22px', marginBottom: '2px' }}>
                        {tools.map(mod => {
                          const href = typeof mod.href === 'function' ? mod.href({ eventId: ev.id }) : mod.href
                          const base = href.split('?')[0]
                          const active = pathname === base || pathname.startsWith(base + '/')
                          const label = mod.sidebar?.label ?? mod.label
                          return (
                            <Link
                              key={mod.key}
                              href={href}
                              style={{
                                display: 'flex', alignItems: 'center', padding: '7px 10px', borderRadius: '7px',
                                textDecoration: 'none', fontSize: '12.5px', fontWeight: active ? 800 : 600,
                                color: active ? mod.color : 'var(--ink3)', background: active ? `${mod.color}12` : 'transparent',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                            >
                              {label}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
