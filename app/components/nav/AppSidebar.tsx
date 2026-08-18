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
  primary chrome (2026-08-17). Always an icon-only rail at rest; hovering
  expands it to full width as a fixed overlay (page content never
  reflows), and it snaps back to the rail the instant the pointer leaves
  — no manual toggle (removed 2026-08-18, see useSidebarCollapse). Sections
  are driven entirely by app/lib/registry/modules.tsx's `sidebar` tag — an
  entry with no tag renders nowhere here, which is the whole "parked
  module" mechanism (HR Portal, Finance, Timesheets, Commercial P&L, Smart
  Data intentionally have none).
*/
export default function AppSidebar() {
  const { session, sidebarKeys } = useNavData()
  const { hovering, setHovering, collapsedRail } = useSidebarCollapse()

  const registry = getModuleRegistry()
  const accessibleKeys = new Set(sidebarKeys ?? [])
  const ctx = { staffId: session?.sid }

  const home = resolveSectionEntries(registry, accessibleKeys, 'home', ctx)
  const pilots = resolveSectionEntries(registry, accessibleKeys, 'pilots', ctx)
  const admin = resolveSectionEntries(registry, accessibleKeys, 'admin', ctx)
  const toolkit = resolveSectionEntries(registry, accessibleKeys, 'toolkit', ctx)

  const panelWidth = hovering ? FULL_WIDTH : RAIL_WIDTH

  return (
    <div style={{ width: RAIL_WIDTH, flexShrink: 0, position: 'relative' }}>
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          width: panelWidth, height: '100vh',
          ...(hovering
            ? { position: 'fixed', top: 0, left: 0, zIndex: 50, boxShadow: 'var(--shadow-md)' }
            : { position: 'sticky', top: 0 }),
          background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-light)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: 'var(--font-manrope), Manrope, sans-serif',
          transition: 'width .1s ease-out',
        }}
      >
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', padding: '16px 14px', flexShrink: 0 }}>
          <img src="/trescon-logo.png" alt="Trescon" style={{ height: '28px', width: 'auto', display: 'block', flexShrink: 0 }} />
          {!collapsedRail && <span style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>EventPilot</span>}
        </Link>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 8px 16px' }}>
          <AppSidebarSection title="Home" entries={home} collapsedRail={collapsedRail} />
          <EventsSidebarSection collapsedRail={collapsedRail} />
          <AppSidebarSection title="Pilot Projects" entries={pilots} collapsedRail={collapsedRail} />
          <AppSidebarSection title="Toolkit" entries={toolkit} collapsedRail={collapsedRail} />
          <AppSidebarSection title="Admin" entries={admin} collapsedRail={collapsedRail} />
        </div>
      </div>
    </div>
  )
}
