'use client'

import { cloneElement, isValidElement, useEffect, useState } from 'react'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import { getModuleRegistry } from '@/app/lib/registry/modules'

/*
  Thin wrapper around NavBar that reads module identity (icon/color/label)
  from the shared registry instead of every page importing a MOD_* constant
  from NavBar.tsx directly. This is the Phase 3 pilot — additive only,
  nothing else has been migrated to it yet. Only wraps the nav bar itself;
  each page keeps its own outer layout div (background/flex/etc.) since
  those genuinely differ per page (e.g. the Knowledge Assistant's chat
  layout needs flex-column, KB's document browser doesn't).

  Also defaults homeHref to /dashboard instead of NavBar's own default of
  /admin — that default caused several of the Phase 0 "logo goes somewhere
  different than the explicit back link" bugs on pages that forgot to pass
  homeHref explicitly.

  Registry icons are sized/coloured for PlatformMenu tiles (18x18,
  stroke="currentColor", drawn on a light card). NavBar's badge box renders
  whatever icon it's given completely verbatim inside a small colored
  square — the original MOD_* constants were hand-authored at 11x11 with
  stroke="white" for that exact context. Rather than requiring every
  registry entry to duplicate its icon a second time just for sizing, this
  clones whichever icon is used here and forces the right size/stroke —
  found this the hard way: the first pass reused the 18x18 currentColor
  icon directly, which rendered as the wrong size and (since nothing
  resolves "currentColor" to white here) the wrong tint too.
*/

function badgeIcon(icon: React.ReactNode): React.ReactNode {
  if (!isValidElement(icon)) return icon
  return cloneElement(icon as React.ReactElement<{ width?: number; height?: number; stroke?: string }>, {
    width: 11, height: 11, stroke: 'white',
  })
}

interface AppShellNavProps {
  moduleKey: string
  moduleHref?: string
  subtitle?: string
  homeHref?: string
  liveIndicator?: boolean
  rightSlot?: React.ReactNode
  centerSlot?: React.ReactNode
  /** Forwarded to NavBar's ProfileMenu — pass the staff name if this page
   *  already has it loaded, to skip an extra lookup. */
  profileName?: string
}

const quickLinkStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
}

export function AppShellNav({ moduleKey, moduleHref, subtitle, homeHref, liveIndicator, rightSlot, centerSlot, profileName }: AppShellNavProps) {
  const mod = getModuleRegistry().find(m => m.key === moduleKey)
  if (!mod) {
    // Fails loudly in dev rather than silently rendering a blank nav —
    // a missing registry key here means a typo, not a real "no module" case.
    console.error(`AppShellNav: no registry entry for moduleKey "${moduleKey}"`)
  }

  const badge = mod ? {
    name:  mod.pageBadge?.label ?? mod.label,
    color: mod.pageBadge?.color ?? mod.color,
    icon:  badgeIcon(mod.pageBadge?.icon ?? mod.icon),
  } : undefined

  const resolvedModuleHref = moduleHref ?? (typeof mod?.href === 'string' ? mod.href : undefined)

  // Toolkit / Pilot Projects quick-access buttons — shown on every page that
  // uses AppShellNav (not just per-page opt-in like rightSlot) so they can't
  // be silently missed. Toolkit only had a menu presence for admins before
  // this (its registry entry is admin_only in PlatformMenu); staff granted
  // individual tools had no discovery path to /admin/toolkit at all. Added
  // 15 Jul 2026 per Madhu's request.
  const [quickAccess, setQuickAccess] = useState({ toolkit: false, pilots: false, pilotsHref: '/pilots' })
  useEffect(() => {
    fetch('/api/nav/quick-access')
      .then(r => r.json())
      .then(d => setQuickAccess({ toolkit: !!d.toolkit, pilots: !!d.pilots, pilotsHref: d.pilotsHref ?? '/pilots' }))
      .catch(() => {})
  }, [])

  const quickLinks = (quickAccess.toolkit || quickAccess.pilots) && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {quickAccess.toolkit && <Link href="/admin/toolkit" style={quickLinkStyle}>Toolkit</Link>}
      {quickAccess.pilots && <Link href={quickAccess.pilotsHref} style={quickLinkStyle}>Pilot Projects</Link>}
    </div>
  )

  return (
    <NavBar
      module={badge}
      moduleHref={resolvedModuleHref}
      subtitle={subtitle}
      homeHref={homeHref ?? '/dashboard'}
      liveIndicator={liveIndicator}
      rightSlot={
        quickLinks || rightSlot ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {quickLinks}
            {rightSlot}
          </div>
        ) : undefined
      }
      centerSlot={centerSlot}
      profileName={profileName}
    />
  )
}
