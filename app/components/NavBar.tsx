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
  /** Where the module badge links to — makes it part of a clickable EventPilot / Module / Page breadcrumb */
  moduleHref?: string
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
  /** Passed straight to the built-in ProfileMenu's `name` prop — lets a page
   *  that already has the staff record loaded (e.g. Dashboard) skip
   *  ProfileMenu's own /api/staff-member lookup. Optional; ProfileMenu
   *  resolves its own name when omitted. */
  profileName?: string
}

export default function NavBar({
  module,
  moduleHref,
  subtitle,
  liveIndicator,
  homeHref = '/admin',
  rightSlot,
  centerSlot,
  profileName,
}: NavBarProps) {
  const accent = module?.color ?? '#00897B'
  const moduleBadge = module && (
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
  )

  return (
    <nav className="t-nav">
      {/* ── Left: Trescon logo + EventPilot name + optional module page label ──
          Logo/wordmark always links to /dashboard — every logged-in person's
          own home, regardless of which module/page they're currently in. Not
          homeHref's raw default (/admin, kept only for legacy callers that
          still pass nothing) — AppShellNav is the real entry point and
          always passes /dashboard explicitly. */}
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
          <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>EventPilot</span>
        </Link>

        {module && (
          <>
            <div className="t-nav-sep" style={{ margin: '0 14px' }} />
            {moduleHref ? (
              <Link href={moduleHref} style={{ textDecoration: 'none' }}>{moduleBadge}</Link>
            ) : moduleBadge}
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

      {/* ── Right: whatever this page passes in, then Help, Sound, Profile —
          always last, always in this order, on every single page. Not
          opt-in like rightSlot used to be (most pages never remembered to
          add ProfileMenu) — baked into NavBar itself so it can't be missed. */}
      <div className="t-nav-right">
        {rightSlot}
        <HelpMenu />
        <SoundToggle />
        <ProfileMenu name={profileName} />
      </div>
    </nav>
  )
}

/* ── Help menu — "?" button, always visible, same position everywhere.
   Report an Issue is available to everyone (opens the existing global
   ReviewWidget submit modal via a custom event, no duplicate form). The
   remaining items (Review Queue, Platform Docs) are real admin_only pages
   today, so only shown to admins — showing them to everyone would just
   send regular staff to a page that immediately bounces them to
   /no-access. ── */
export function HelpMenu() {
  const [open, setOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => setIsAdmin(!!s?.adm)).catch(() => {})
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Help & Support"
        style={{
          width: '34px', height: '34px', borderRadius: '50%',
          border: `1px solid ${open ? 'rgba(0,137,123,0.35)' : '#DDE8EE'}`,
          background: open ? 'rgba(0,137,123,0.12)' : '#FFFFFF',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, padding: 0,
        }}
      >
        <svg width="16" height="16" fill="none" stroke={open ? '#00897B' : '#5B7080'} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '6px', zIndex: 1000, minWidth: 200 }}>
          <div style={{ padding: '6px 12px 4px', fontSize: '10px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Support</div>
          <button
            onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('ep:open-report-issue')) }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
            <svg width="14" height="14" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Report an Issue
          </button>
          {isAdmin && (
            <>
              <Link href="/admin/reviews" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', textDecoration: 'none', color: '#374151', fontSize: '13px', fontWeight: 600 }}>
                <svg width="14" height="14" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Review Queue
              </Link>
              <Link href="/docs" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', textDecoration: 'none', color: '#374151', fontSize: '13px', fontWeight: 600 }}>
                <svg width="14" height="14" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                Platform Docs
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Sound toggle — mute/unmute the notification chime, always visible,
   between Help and Profile. Moved here from RealtimeNotifications.tsx's own
   floating bottom-left button (which is what actually plays the sound) —
   both read/write the same 'ep_sound_enabled' localStorage key, so this
   button doesn't need any direct connection to that component. ── */
export function SoundToggle() {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEnabled(localStorage.getItem('ep_sound_enabled') !== 'false')
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem('ep_sound_enabled', String(next))
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title={enabled ? 'Notification sound: ON' : 'Notification sound: OFF'}
        style={{
          width: '34px', height: '34px', borderRadius: '50%',
          border: `1px solid ${enabled ? 'rgba(0,137,123,0.35)' : '#DDE8EE'}`,
          background: enabled ? 'rgba(0,137,123,0.12)' : '#FFFFFF',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, padding: 0,
        }}
      >
        {enabled ? (
          <svg width="16" height="16" fill="none" stroke="#00897B" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        ) : (
          <svg width="16" height="16" fill="none" stroke="#5B7080" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '6px', zIndex: 1000, minWidth: 190 }}>
          <button onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
            {enabled ? (
              <svg width="14" height="14" fill="none" stroke="#8B1A1A" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            ) : (
              <svg width="14" height="14" fill="none" stroke="#00897B" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            )}
            {enabled ? 'Mute notifications' : 'Unmute notifications'}
          </button>
        </div>
      )}
    </div>
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

export const MOD_DOCUHUB = {
  name: 'DocuHub',
  color: '#D97706',
  icon: (
    <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
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

/* ── Notification bell — self-contained, sits beside ProfileMenu ── */
type Notif = { id: string; type: string; title: string; body: string; course_id: string | null; review_id: string | null; created_at: string }

function timeAgoShort(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2)    return 'just now'
  if (m < 60)   return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 1440)}d`
}

export function NotificationBell({ staffId }: { staffId?: string }) {
  const [open,   setOpen]   = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [sid,    setSid]    = useState<string | null>(staffId ?? null)
  const ref = useRef<HTMLDivElement>(null)

  // Resolve staffId from session if not passed
  useEffect(() => {
    if (sid) return
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(s => { if (s?.sid && s.sid !== 'super-admin') setSid(s.sid) })
      .catch(() => {})
  }, [sid])

  // Fetch unread count whenever sid is known
  useEffect(() => {
    if (!sid) return
    const load = () =>
      fetch(`/api/notifications?staff_id=${sid}`)
        .then(r => r.json())
        .then(d => Array.isArray(d) ? setNotifs(d) : setNotifs([]))
        .catch(() => {})
    load()
    const t = setInterval(load, 60000) // re-poll every 60s as fallback
    // Listen for Realtime events for instant update
    const handler = () => load()
    window.addEventListener('ep:new-notification', handler)
    return () => { clearInterval(t); window.removeEventListener('ep:new-notification', handler) }
  }, [sid])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function dismiss(notifId: string) {
    if (!sid) return
    setNotifs(prev => prev.filter(n => n.id !== notifId))
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: sid, notification_id: notifId }),
    })
  }

  async function dismissAll() {
    if (!sid) return
    setNotifs([])
    setOpen(false)
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: sid }),
    })
  }

  const unread = notifs.length
  const dashHref = sid ? `/dashboard?id=${sid}` : '/dashboard'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Notifications"
        style={{
          position: 'relative',
          width: '34px', height: '34px',
          borderRadius: '50%',
          background: open ? 'rgba(0,137,123,0.12)' : 'transparent',
          border: `1.5px solid ${open ? 'rgba(0,137,123,0.35)' : '#DDE8EE'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, padding: 0,
          transition: 'all 0.15s',
        }}
      >
        <svg width="15" height="15" fill="none" stroke={open ? '#00897B' : '#5B7080'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '-3px', right: '-3px',
            minWidth: '16px', height: '16px',
            background: '#DC2626', color: '#fff',
            fontSize: '10px', fontWeight: 800,
            borderRadius: '99px', padding: '0 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, border: '2px solid #fff',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: '320px',
          background: '#FFFFFF',
          border: '1px solid #DDE8EE',
          borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(15,25,35,0.12)',
          zIndex: 1000, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>
              Notifications {unread > 0 && <span style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', marginLeft: '4px' }}>{unread} unread</span>}
            </span>
            {unread > 0 && (
              <button onClick={dismissAll} style={{ fontSize: '11px', fontWeight: 700, color: '#00897B', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifs.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center' }}>
              <svg width="28" height="28" fill="none" stroke="#B8CDD8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ display: 'block', margin: '0 auto 10px' }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#5B7080' }}>You&apos;re all caught up</div>
              <div style={{ fontSize: '12px', color: '#B8CDD8', marginTop: '4px' }}>No new notifications</div>
            </div>
          ) : (
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              {notifs.map(n => {
                const isReview = !!n.review_id
                const isCourse = !!n.course_id
                const actionHref = isReview
                  ? `${dashHref}#my-submissions`
                  : isCourse
                  ? `/dashboard/course/${n.course_id}${sid ? `?staff_id=${sid}` : ''}`
                  : dashHref
                return (
                  <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F8FAFC', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {/* Icon */}
                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: isReview ? 'rgba(0,137,123,0.1)' : 'rgba(192,244,60,0.1)', border: `1px solid ${isReview ? 'rgba(0,137,123,0.2)' : 'rgba(192,244,60,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                      {isReview
                        ? <svg width="12" height="12" fill="none" stroke="#00897B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        : <svg width="12" height="12" fill="none" stroke="#3D6B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      }
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F1923', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                      <div style={{ fontSize: '12px', color: '#5B7080', lineHeight: 1.5, marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '11px', color: '#B8CDD8' }}>{timeAgoShort(n.created_at)}</span>
                        <a href={actionHref} onClick={() => dismiss(n.id)} style={{ fontSize: '11px', fontWeight: 700, color: '#00897B', textDecoration: 'none' }}>
                          {isReview ? 'View report' : isCourse ? 'View course' : 'View'}
                        </a>
                      </div>
                    </div>
                    {/* Dismiss */}
                    <button onClick={() => dismiss(n.id)} style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'transparent', border: '1px solid #E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                      <svg width="9" height="9" fill="none" stroke="#B8CDD8" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
            <a href={dashHref} style={{ fontSize: '12px', fontWeight: 700, color: '#00897B', textDecoration: 'none' }}>
              Go to dashboard
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Messages icon — always visible in navbar ── */
export function MessagesIcon({ staffId }: { staffId?: string }) {
  const [unread, setUnread] = useState(0)
  const [sid, setSid] = useState(staffId ?? null)

  useEffect(() => {
    if (sid) return
    fetch('/api/auth/session').then(r => r.json()).then(s => { if (s?.sid) setSid(s.sid) }).catch(() => {})
  }, [sid])

  useEffect(() => {
    if (!sid) return
    const load = () => fetch('/api/messages/inbox').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUnread(d.reduce((s: number, c: { unread: number }) => s + (c.unread || 0), 0))
    }).catch(() => {})
    load()
    const t = setInterval(load, 30000) // fallback polling
    // Listen for Realtime events for instant update
    const handler = () => load()
    window.addEventListener('ep:new-message', handler)
    return () => { clearInterval(t); window.removeEventListener('ep:new-message', handler) }
  }, [sid])

  return (
    <Link href={`/messages?id=${sid || ''}`} title="Messages" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'none', color: '#5B7080' }}>
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      {unread > 0 && (
        <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #fff' }}>
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
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
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => { if (s) setSession(s) }).catch(() => {})
  }, [])

  // The session cookie only carries sid/jl/adm/dept — no name. Now that
  // NavBar renders this automatically on every page (rather than each page
  // opting in and passing its own already-fetched `name`), resolve the real
  // name ourselves so an unadorned <ProfileMenu /> doesn't show a raw
  // staff-id UUID as the display name.
  useEffect(() => {
    if (name || !session?.sid || session.sid === 'super-admin') return
    fetch(`/api/staff-member?id=${session.sid}`)
      .then(r => r.json())
      .then(d => { if (d?.name) setResolvedName(d.name) })
      .catch(() => {})
  }, [name, session?.sid])

  const displayName    = name ?? resolvedName ?? (session?.sid === 'super-admin' ? 'Super Admin' : session?.sid) ?? 'You'
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
