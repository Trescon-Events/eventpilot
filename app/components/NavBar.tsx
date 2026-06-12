'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'

interface Module {
  name: string
  /** hex colour — used as the icon box bg and wordmark colour */
  color?: string
  /** SVG element to show inside the 22×22 icon box */
  icon?: React.ReactNode
}

interface NavBarProps {
  /** Module identity shown after the Trescon logo */
  module?: Module
  /** Page label shown after module (secondary breadcrumb) */
  subtitle?: string
  /** Animated green dot + "Live" text */
  liveIndicator?: boolean
  /** Where the logo links to */
  homeHref?: string
  /** Right-side content — buttons, menus, avatar */
  rightSlot?: React.ReactNode
  /** Extra content between logo area and right slot */
  centerSlot?: React.ReactNode
}

export default function NavBar({
  module,
  subtitle,
  liveIndicator,
  homeHref = '/admin',
  rightSlot,
  centerSlot,
}: NavBarProps) {
  const accent = module?.color ?? '#00897B'

  return (
    <nav className="t-nav">
      {/* ── Left: Trescon logo + EventPilot name + optional module page label ── */}
      <div className="t-nav-left">
        <Link
          href={homeHref}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}
        >
          <img
            src="/trescon-logo.png"
            alt="Trescon"
            style={{ height: '34px', width: 'auto', display: 'block' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.2px' }}>EventPilot</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#00897B', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: '2px' }}>by Trescon</span>
          </div>
        </Link>

        {module && (
          <>
            <div className="t-nav-sep" style={{ margin: '0 14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {module.icon && (
                <div style={{
                  width: '22px', height: '22px',
                  background: accent,
                  borderRadius: '6px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {module.icon}
                </div>
              )}
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', whiteSpace: 'nowrap' }}>
                {module.name}
              </span>
            </div>
          </>
        )}

        {subtitle && (
          <>
            <div className="t-nav-sep" style={{ margin: '0 14px' }} />
            <span className="t-nav-title">{subtitle}</span>
          </>
        )}

        {centerSlot}

        {liveIndicator && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: (module || subtitle) ? '8px' : '0' }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: '#00897B',
              boxShadow: '0 0 0 2px rgba(0,165,163,0.25)',
              animation: 'pulse 2s infinite',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '12px', color: '#2D3E50', whiteSpace: 'nowrap' }}>Live</span>
          </div>
        )}
      </div>

      {/* ── Right: action buttons ── */}
      {rightSlot && (
        <div className="t-nav-right">
          {rightSlot}
        </div>
      )}
    </nav>
  )
}

/* ── Shared module definitions ─────────────────────────────────────────── */

export const MOD_EVENTPILOT = {
  name: 'Event Pilot',
  color: '#00897B',
  icon: (
    <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
}

export const MOD_INTELLIGENCE = {
  name: 'Intelligence',
  color: '#A478FF',
  icon: (
    <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
}

export const MOD_TRESCI = {
  name: 'Pilot AI',
  color: '#00A5A3',
  icon: (
    <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
}

export const MOD_KNOWLEDGE = {
  name: 'Knowledge Base',
  color: '#5B7080',
  icon: (
    <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
}

export const MOD_PEOPLE = {
  name: 'People & Org',
  color: '#3D6B00',
  icon: (
    <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
}

/* ── Role badge colours ── */
const ROLE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  super_admin:      { bg: '#0F192320', color: '#0F1923', label: 'Super Admin'      },
  admin:            { bg: '#7C3AED20', color: '#7C3AED', label: 'Admin'            },
  office_head:      { bg: '#0E749020', color: '#0E7490', label: 'Office Head'      },
  dept_head:        { bg: '#D9770620', color: '#D97706', label: 'Dept Head'        },
  team_lead:        { bg: '#00897B20', color: '#00897B', label: 'Team Lead'        },
  hr:               { bg: '#EC489920', color: '#EC4899', label: 'HR'               },
  project_manager:  { bg: '#3D6B0020', color: '#3D6B00', label: 'Project Manager' },
  project_director: { bg: '#8B1A1A20', color: '#8B1A1A', label: 'Project Director'},
  standard:         { bg: '#5B708020', color: '#5B7080', label: 'Staff'            },
}

async function doSignOut() {
  if (typeof window === 'undefined') return
  try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
  localStorage.removeItem('eventpilot_staff_id')
  localStorage.removeItem('tai_staff_id')
  sessionStorage.removeItem('tai_admin_authed')
  sessionStorage.removeItem('tai_admin_staff_id')
  window.location.href = '/login'
}

/* ── Profile menu — fetches session, shows avatar + dropdown ── */
export function ProfileMenu({ name, initials, roles, jobLevel }: {
  name?:     string
  initials?: string
  roles?:    string[]
  jobLevel?: string
}) {
  const [open,    setOpen]    = useState(false)
  const [session, setSession] = useState<{ sid: string; jl: string; adm: boolean; dept: string; roles?: string[] } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => { if (s) setSession(s) }).catch(() => {})
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayName    = name ?? session?.sid ?? 'You'
  const displayInitial = initials ?? (displayName.charAt(0).toUpperCase())
  const effectiveRoles = roles ?? session?.roles ?? ['standard']
  const effectiveLevel = jobLevel ?? session?.jl ?? 'staff'

  // Determine the most significant badge to show
  const badgeKey = session?.adm ? (effectiveLevel === 'super_admin' ? 'super_admin' : 'admin')
    : effectiveRoles.find(r => ROLE_COLORS[r] && r !== 'standard') ?? effectiveLevel ?? 'standard'
  const badge = ROLE_COLORS[badgeKey] ?? ROLE_COLORS.standard

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Your profile"
        style={{
          width: '34px', height: '34px',
          borderRadius: '50%',
          background: open ? '#00897B' : 'rgba(0,137,123,0.12)',
          border: `2px solid ${open ? '#00897B' : 'rgba(0,137,123,0.35)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
          transition: 'all 0.15s',
          padding: 0,
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 800, color: open ? '#fff' : '#00897B' }}>
          {displayInitial}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: '230px',
          background: '#FFFFFF',
          border: '1px solid #DDE8EE',
          borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(15,25,35,0.12)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* Profile header */}
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(0,137,123,0.1)', border: '2px solid rgba(0,137,123,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#00897B' }}>{displayInitial}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                <div style={{ marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: badge.bg, color: badge.color }}>
                    {badge.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: '8px' }}>
            <button
              onClick={doSignOut}
              style={{
                width: '100%', padding: '10px 12px',
                borderRadius: '8px', border: 'none',
                background: 'transparent',
                display: 'flex', alignItems: 'center', gap: '10px',
                cursor: 'pointer', textAlign: 'left',
                fontSize: '13px', fontWeight: 600, color: '#B91C1C',
                fontFamily: 'inherit',
                transition: 'background 0.12s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = '#FFF1F2')}
              onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Legacy Sign-out button — kept for compatibility, delegates to doSignOut ── */
export function SignOutBtn() {
  return (
    <button
      className="tbtn tbtn-red"
      onClick={doSignOut}
    >
      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
        <line x1="12" y1="2" x2="12" y2="12"/>
      </svg>
      Sign out
    </button>
  )
}
