'use client'

import Link from 'next/link'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { useNavData } from '@/app/lib/nav/NavDataContext'
import { useSidebarCollapse } from './useSidebarCollapse'
import AppSidebarSection, { resolveSectionEntries } from './AppSidebarSection'
import EventsSidebarSection from './EventsSidebarSection'

const RAIL_WIDTH = '64px'
const FULL_WIDTH = '248px'

/*
  The persistent sidebar — replaces GlobalShell's top nav bar as the app's
  primary chrome (2026-08-17). Collapsible to an icon-only rail, expands on
  hover without reflowing page content (see useSidebarCollapse's header
  comment). Sections are driven entirely by app/lib/registry/modules.tsx's
  `sidebar` tag — an entry with no tag renders nowhere here, which is the
  whole "parked module" mechanism (HR Portal, Finance, Timesheets,
  Commercial P&L, Smart Data intentionally have none).

  Not yet mounted in the root layout — see AuthedShellGate.tsx, still on
  GlobalShell until the Stage 5 width sweep + Stage 6 cutover land.
*/
export default function AppSidebar() {
  const { session, sidebarKeys, eventsData } = useNavData()
  const { collapsed, setCollapsed, hovering, setHovering, collapsedRail } = useSidebarCollapse()

  const registry = getModuleRegistry()
  const accessibleKeys = new Set(sidebarKeys ?? [])
  const ctx = { staffId: session?.sid }

  const home = resolveSectionEntries(registry, accessibleKeys, 'home', ctx)
  const pilots = resolveSectionEntries(registry, accessibleKeys, 'pilots', ctx)
  const admin = resolveSectionEntries(registry, accessibleKeys, 'admin', ctx)
  const toolkit = resolveSectionEntries(registry, accessibleKeys, 'toolkit', ctx)

  const panelWidth = collapsedRail ? RAIL_WIDTH : FULL_WIDTH

  return (
    <div style={{ width: collapsed ? RAIL_WIDTH : FULL_WIDTH, flexShrink: 0, position: 'relative' }}>
      <div
        onMouseEnter={() => collapsed && setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          width: panelWidth, height: '100vh',
          ...(collapsed && hovering
            ? { position: 'fixed', top: 0, left: 0, zIndex: 50, boxShadow: 'var(--shadow-md)' }
            : { position: 'sticky', top: 0 }),
          background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-light)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: 'var(--font-manrope), Manrope, sans-serif', transition: 'width .12s ease',
        }}
      >
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', padding: '16px 14px', flexShrink: 0 }}>
          <img src="/trescon-logo.png" alt="Trescon" style={{ height: '28px', width: 'auto', display: 'block', flexShrink: 0 }} />
          {!collapsedRail && <span style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>EventPilot</span>}
        </Link>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 8px 16px' }}>
          <AppSidebarSection title="Home" entries={home} collapsedRail={collapsedRail} />
          <EventsSidebarSection eventsData={eventsData} collapsedRail={collapsedRail} />
          <AppSidebarSection title="Pilot Projects" entries={pilots} collapsedRail={collapsedRail} />
          <AppSidebarSection title="Toolkit" entries={toolkit} collapsedRail={collapsedRail} />
          <AppSidebarSection title="Admin" entries={admin} collapsedRail={collapsedRail} />
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            margin: '8px', padding: '9px', border: 'none', background: 'transparent', color: 'var(--ink4)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: collapsedRail ? 'center' : 'flex-start', gap: '8px',
            fontFamily: 'inherit', fontSize: '12px', fontWeight: 700, flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: collapsed ? 'none' : 'rotate(180deg)', flexShrink: 0 }}>
            <polyline points="15 18 9 12 15 6" />
            <polyline points="9 18 3 12 9 6" />
          </svg>
          {!collapsedRail && 'Collapse'}
        </button>
      </div>
    </div>
  )
}
