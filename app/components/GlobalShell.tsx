'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { deriveBreadcrumbs } from '@/app/lib/nav/breadcrumbs'
import { HelpMenu, SoundToggle, ProfileMenu } from '@/app/components/NavBar'
import PlatformMenu from '@/app/components/PlatformMenu'

/*
  The persistent global shell — two rows:
    1. Logo (always → /dashboard) + "My Dashboard" / "Admin Dashboard"
       pinned buttons next to it (the two primary "homes" — personal vs.
       admin), then further right: Toolkit / Pilot Projects / Team
       Dashboard / HR Portal as a separate quick-access group beside
       Help/Sound/Profile. Whichever button matches the current section
       gets a filled/tinted "selected" treatment.
    2. A slim breadcrumb strip, auto-derived from the URL — no page has to
       register anything.

  Rendered ONCE by AuthedShellGate inside the root layout, so — unlike the
  old per-page AppShellNav — it never unmounts between navigations.
  Module-specific navigation (Settings, Manage, sibling pages) belongs in
  that module's own ModuleSidebar; page-specific title/actions belong in
  that page's own PageHeader.
*/

type QuickAccess = {
  toolkit: boolean
  pilots: boolean
  pilotsHref: string
  isAdmin: boolean
  teamDashboard: boolean
  staffId: string | null
}

const DEFAULT_QA: QuickAccess = { toolkit: false, pilots: false, pilotsHref: '/pilots', isAdmin: false, teamDashboard: false, staffId: null }

type NavButton = { key: string; label: string; href: string; show: boolean }

function homeButtons(qa: QuickAccess): NavButton[] {
  return [
    { key: 'dashboard', label: 'My Dashboard', href: '/dashboard', show: true },
    { key: 'admin', label: 'Admin Dashboard', href: '/admin', show: qa.isAdmin },
  ]
}

function quickAccessButtons(qa: QuickAccess): NavButton[] {
  // HR Portal removed from here per Madhu's request, 15 Jul 2026 — it's
  // now reachable via the Admin Dashboard's own tab row instead, and having
  // it in both places was redundant.
  return [
    { key: 'toolkit', label: 'Toolkit', href: '/admin/toolkit', show: qa.toolkit },
    { key: 'pilots', label: 'Pilot Projects', href: qa.pilotsHref, show: qa.pilots },
    { key: 'team', label: 'Team Dashboard', href: qa.staffId ? `/team?manager_id=${qa.staffId}&staff_id=${qa.staffId}` : '/team', show: qa.teamDashboard },
  ]
}

function activeKeyOf(pathname: string, buttons: NavButton[]): string | null {
  const matches = buttons
    .filter(b => b.show)
    .map(b => ({ key: b.key, base: b.href.split('?')[0] }))
    .filter(b => pathname === b.base || pathname.startsWith(b.base + '/'))
    .sort((a, b) => b.base.length - a.base.length)
  return matches[0]?.key ?? null
}

function NavButtonLink({ btn, active }: { btn: NavButton; active: boolean }) {
  return (
    <Link
      href={btn.href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '7px 14px', borderRadius: '9px',
        border: active ? '1px solid var(--teal-mid)' : '1px solid var(--border-light)',
        background: active ? 'var(--teal-light)' : 'var(--card)',
        color: active ? 'var(--teal-mid)' : 'var(--ink3)',
        fontSize: '12.5px', fontWeight: active ? 800 : 700,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >
      {btn.label}
    </Link>
  )
}

export default function GlobalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [qa, setQa] = useState<QuickAccess>(DEFAULT_QA)

  useEffect(() => {
    fetch('/api/nav/quick-access').then(r => r.json()).then(setQa).catch(() => {})
  }, [])

  const home = homeButtons(qa).filter(b => b.show)
  const quick = quickAccessButtons(qa).filter(b => b.show)
  const activeHome = activeKeyOf(pathname, home)
  const activeQuick = activeKeyOf(pathname, quick)
  const crumbs = deriveBreadcrumbs(pathname)

  return (
    <>
      <nav
        style={{
          height: '58px', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '0 28px', background: 'var(--card)', borderBottom: '1px solid var(--border-light)',
          fontFamily: 'var(--font-manrope), Manrope, sans-serif',
        }}
      >
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <img src="/trescon-logo.png" alt="Trescon" style={{ height: '32px', width: 'auto', display: 'block' }} />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>EventPilot</span>
        </Link>

        <div style={{ width: '1px', height: '22px', background: 'var(--border-light)', flexShrink: 0, margin: '0 4px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {home.map(btn => <NavButtonLink key={btn.key} btn={btn} active={btn.key === activeHome} />)}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {quick.map(btn => <NavButtonLink key={btn.key} btn={btn} active={btn.key === activeQuick} />)}
          <div style={{ width: '1px', height: '20px', background: 'var(--border-light)', margin: '0 2px', flexShrink: 0 }} />
          <PlatformMenu staffId={qa.staffId ?? undefined} />
          <HelpMenu />
          <SoundToggle />
          <ProfileMenu />
        </div>
      </nav>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0,
        padding: '7px 28px', background: 'var(--surface)', borderBottom: '1px solid var(--border-light)',
        fontFamily: 'var(--font-manrope), Manrope, sans-serif',
      }}>
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

      {children}
    </>
  )
}
