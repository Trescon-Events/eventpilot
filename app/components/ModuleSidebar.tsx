'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

/*
  Persistent per-module left sidebar — one per module with 2+ sub-pages
  (Finance, HR, Knowledge Base, DocuHub). Lives in that module's own
  layout.tsx, so it persists across that module's own sub-pages without
  remounting (nested inside the global shell from AuthedShellGate).

  Does NOT render a logo/back-link/PlatformMenu — GlobalShell already
  covers that above it. Module identity here is just a small colored
  header block (icon + label), matching the approved design concept.
*/

export type SidebarItem = { label: string; href: string; icon: React.ReactNode; count?: number }
export type SidebarGroup = { label: string; items: SidebarItem[] }

interface ModuleSidebarProps {
  moduleLabel: string
  moduleIcon: React.ReactNode
  moduleColor: string
  groups: SidebarGroup[]
  // Optional slots for modules with genuine non-nav content (e.g. Data's
  // credits meter, a job-status footer) that has no place in a plain nav list.
  extraTop?: React.ReactNode
  extraBottom?: React.ReactNode
}

// Longest-matching href wins — a naive "does this item's href prefix the
// pathname" check would light up BOTH "Overview" (href is the module root,
// e.g. /finance) and whichever specific sub-page you're actually on (e.g.
// /finance/salary), since the root is always a prefix of every sub-page.
// Only the most specific match should read as active.
function findActiveHref(pathname: string, groups: SidebarGroup[]): string | null {
  const matches = groups
    .flatMap(g => g.items.map(i => i.href.split('?')[0]))
    .filter(base => pathname === base || pathname.startsWith(base + '/'))
    .sort((a, b) => b.length - a.length)
  return matches[0] ?? null
}

export default function ModuleSidebar({ moduleLabel, moduleIcon, moduleColor, groups, extraTop, extraBottom }: ModuleSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const activeHref = findActiveHref(pathname, groups)

  function toggle(label: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      return next
    })
  }

  return (
    <div style={{
      width: '252px', flexShrink: 0, background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-manrope), Manrope, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '20px 18px 16px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0,
          background: `${moduleColor}1F`, color: moduleColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {moduleIcon}
        </div>
        <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>{moduleLabel}</div>
      </div>

      {extraTop}

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px 18px' }}>
        {groups.map(group => {
          const isCollapsed = collapsed.has(group.label)
          return (
            <div key={group.label} style={{ marginBottom: '4px' }}>
              <button
                onClick={() => toggle(group.label)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 8px 7px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink4)' }}>
                  {group.label}
                </span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink4)" strokeWidth="2.6" strokeLinecap="round"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {!isCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {group.items.map(item => {
                    const active = item.href.split('?')[0] === activeHref
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px',
                          borderRadius: '8px', textDecoration: 'none', position: 'relative',
                          fontSize: '13.5px', fontWeight: active ? 800 : 600,
                          color: active ? moduleColor : 'var(--ink3)',
                          background: active ? `${moduleColor}12` : 'transparent',
                        }}
                      >
                        {active && (
                          <span style={{ position: 'absolute', left: 0, top: '8px', bottom: '8px', width: '3px', borderRadius: '0 3px 3px 0', background: moduleColor }} />
                        )}
                        <span style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: active ? moduleColor : 'var(--ink3)' }}>
                          {item.icon}
                        </span>
                        {item.label}
                        {item.count != null && (
                          <span style={{
                            marginLeft: 'auto', fontSize: '10.5px', fontWeight: 800,
                            color: active ? moduleColor : 'var(--ink4)',
                            background: active ? `${moduleColor}1F` : 'var(--border-light)',
                            padding: '1px 7px', borderRadius: '20px',
                          }}>
                            {item.count}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {extraBottom}
    </div>
  )
}
