'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { deriveBreadcrumbs } from '@/app/lib/nav/breadcrumbs'
import { useBreadcrumbLabels } from '@/app/lib/nav/breadcrumb-labels'
import { HelpMenu, SoundToggle, ProfileMenu } from '@/app/components/NavBar'
import { NavDataProvider } from '@/app/lib/nav/NavDataContext'
import AppSidebar from './AppSidebar'
import CommandPalette from './CommandPalette'

/*
  The persistent global shell (2026-08-17) — replaces GlobalShell.tsx as
  AuthedShellGate's mount. A left sidebar (AppSidebar) instead of a top nav
  bar, a slim breadcrumb strip carried over unchanged (still the right tool
  for "where am I" — the sidebar answers "where can I go"), and the
  personal-utility icons (Help/Sound/Profile) that have no home in the
  sidebar's section model. PlatformMenu is deliberately NOT carried over —
  it was a third parallel menu system alongside the old top nav and each
  page's own hardcoded tile list; the sidebar (registry-driven, single
  source of truth) replaces it rather than sitting alongside it.

  GlobalShell.tsx itself is left in place as inert dead code for now — see
  the nav rebuild plan's Stage 7 for retiring the pieces that referenced it
  (the Admin Dashboard tab bar, /dashboard's own tile list).
*/
export default function AppShellRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const breadcrumbLabels = useBreadcrumbLabels()
  const crumbs = deriveBreadcrumbs(pathname, breadcrumbLabels)

  return (
    <NavDataProvider>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <AppSidebar />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0,
              padding: '10px 28px', background: 'var(--surface)', borderBottom: '1px solid var(--border-light)',
              fontFamily: 'var(--font-manrope), Manrope, sans-serif', flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: 1 }}>
              {crumbs.map((c, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                  {i > 0 && <span style={{ color: 'var(--ink4)', fontSize: '11px', flexShrink: 0 }}>›</span>}
                  {c.href ? (
                    <Link href={c.href} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink3)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.label}
                    </Link>
                  ) : (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <HelpMenu />
              <SoundToggle />
              <ProfileMenu />
            </div>
          </div>

          {children}
        </div>
      </div>
      <CommandPalette />
    </NavDataProvider>
  )
}
