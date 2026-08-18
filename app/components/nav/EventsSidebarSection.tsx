'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const EVENTS_COLOR = 'var(--amber)'
const EVENTS_HREF = '/dashboard#events'

/*
  2026-08-18: collapsed from a full expandable per-event tree (every
  assigned event, each with its own tool sub-list + a search box once the
  list ran past SEARCH_THRESHOLD) down to a single "My Events" link — the
  full tree read as noise for anyone with more than a handful of events
  (Madhu's own account: 50+). It now just deep-links to the dashboard's
  existing "My Events" section (#events anchor, app/dashboard/page.tsx),
  which is the real place to browse and open a specific event.

  The full per-event tool breakdown this used to render inline isn't
  gone — it's still available. It has just moved: the Cmd+K command
  palette (paletteIndex.tsx) still indexes every assigned event's tools
  from the same eventsData for direct search/jump, which scales far
  better than a scrolling sidebar list ever could.
*/
export default function EventsSidebarSection({ collapsedRail }: { collapsedRail: boolean }) {
  const pathname = usePathname()
  const active = pathname === '/dashboard'

  return (
    <div style={{ marginBottom: '4px' }}>
      <Link
        href={EVENTS_HREF}
        title={collapsedRail ? 'My Events' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
          borderRadius: '8px', textDecoration: 'none', position: 'relative',
          fontSize: '13.5px', fontWeight: active ? 800 : 600,
          color: active ? EVENTS_COLOR : 'var(--ink3)',
          background: active ? 'var(--amber-light)' : 'transparent',
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}
      >
        {active && (
          <span style={{ position: 'absolute', left: 0, top: '8px', bottom: '8px', width: '3px', borderRadius: '0 3px 3px 0', background: EVENTS_COLOR }} />
        )}
        <span style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: active ? EVENTS_COLOR : 'var(--ink3)' }}>
          <CalendarIcon />
        </span>
        {!collapsedRail && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>My Events</span>}
      </Link>
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
