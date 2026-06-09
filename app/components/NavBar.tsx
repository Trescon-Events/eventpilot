'use client'

import Link from 'next/link'

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
      {/* ── Left: Trescon logo + optional module + optional page label ── */}
      <div className="t-nav-left">
        <Link
          href={homeHref}
          style={{ display: 'flex', alignItems: 'center', gap: '0', textDecoration: 'none', flexShrink: 0 }}
        >
          <img
            src="/trescon-logo.png"
            alt="Trescon"
            style={{ height: '38px', width: 'auto', display: 'block' }}
          />
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

/* ── Convenience: Sign-out button ── */
export function SignOutBtn() {
  return (
    <button
      className="tbtn tbtn-red"
      onClick={() => {
        if (typeof window === 'undefined') return
        localStorage.removeItem('eventpilot_staff_id')
        localStorage.removeItem('tai_staff_id')
        sessionStorage.removeItem('tai_admin_authed')
        sessionStorage.removeItem('tai_admin_staff_id')
        window.location.href = '/login'
      }}
    >
      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
        <line x1="12" y1="2" x2="12" y2="12"/>
      </svg>
      Sign out
    </button>
  )
}
