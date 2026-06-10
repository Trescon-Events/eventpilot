'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

/* ── Types ─────────────────────────────────────────────────── */
type PlatformItem = {
  title:       string
  description: string
  href:        string
  icon:        React.ReactNode
  color:       string
  bg:          string
  border:      string
  external?:   boolean
}

type PlatformSection = {
  heading: string
  items:   PlatformItem[]
}

/* ── Role-aware section builder ─────────────────────────────── */
function buildSections(
  staffId:    string,
  isAdmin:    boolean,
  dept:       string,
  hasReports: boolean,
): PlatformSection[] {
  const id = staffId

  const sections: PlatformSection[] = []

  /* ── Learning — everyone ── */
  sections.push({
    heading: 'Learning',
    items: [
      {
        title:       'My Dashboard',
        description: 'Your AI Readiness Score, learning track, and recommended courses',
        href:        id ? `/dashboard?id=${id}` : '/dashboard',
        color:       '#00897B',
        bg:          'rgba(0,165,163,0.08)',
        border:      'rgba(0,165,163,0.2)',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
      },
      {
        title:       'Course Library',
        description: 'Browse all published courses across every tier and department',
        href:        id ? `/dashboard/library?id=${id}` : '/dashboard/library',
        color:       '#3D6B00',
        bg:          'rgba(192,244,60,0.07)',
        border:      'rgba(192,244,60,0.18)',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
      },
      {
        title:       'Talk to Pilot',
        description: 'AI assistant for learning questions and course guidance',
        href:        '/chat',
        color:       '#A478FF',
        bg:          'rgba(164,120,255,0.08)',
        border:      'rgba(164,120,255,0.2)',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
      },
    ],
  })

  /* ── Team & Organisation — everyone + conditional Team Dashboard ── */
  const teamItems: PlatformItem[] = [
    {
      title:       'My HR',
      description: 'Leave requests, attendance, event assignments and your HR records',
      href:        '/my-hr',
      color:       '#EC4899',
      bg:          'rgba(236,72,153,0.08)',
      border:      'rgba(236,72,153,0.2)',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
  ]
  if (hasReports || isAdmin) {
    teamItems.push({
      title:       'Team Dashboard',
      description: 'AIRS overview, completion rates, and progress for your direct team',
      href:        id ? `/team?manager_id=${id}&staff_id=${id}` : '/team',
      color:       '#7C3AED',
      bg:          'rgba(124,58,237,0.08)',
      border:      'rgba(124,58,237,0.2)',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    })
  }
  if (isAdmin) {
    teamItems.push({
      title:       'HR Admin',
      description: 'Leave approvals, onboarding, offboarding and org management',
      href:        '/hr',
      color:       '#BE185D',
      bg:          'rgba(190,24,93,0.08)',
      border:      'rgba(190,24,93,0.2)',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    })
  }
  sections.push({ heading: 'Team & Organisation', items: teamItems })

  /* ── Content & Marketing — Marketing dept or admin only ── */
  if (dept === 'Marketing' || isAdmin) {
    const contentItems: PlatformItem[] = [
      {
        title:       'Content Hub',
        description: 'Create and manage social media campaigns across all events',
        href:        '/content',
        color:       '#A78BFA',
        bg:          'rgba(167,139,250,0.08)',
        border:      'rgba(167,139,250,0.2)',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
      },
    ]
    if (hasReports || isAdmin) {
      contentItems.push({
        title:       'Approval Queue',
        description: 'Review and approve posts submitted by the marketing team',
        href:        '/content?tab=approvals',
        color:       '#059669',
        bg:          'rgba(5,150,105,0.08)',
        border:      'rgba(5,150,105,0.2)',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
      })
    }
    sections.push({ heading: 'Content & Marketing', items: contentItems })
  }

  /* ── Data Intelligence — everyone ── */
  sections.push({
    heading: 'Data Intelligence',
    items: [
      {
        title:       'Lead Extraction',
        description: 'Extract companies from files, URLs, or websites',
        href:        '/data/extract/file',
        color:       '#00A5A3',
        bg:          'rgba(0,165,163,0.08)',
        border:      'rgba(0,165,163,0.2)',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
      },
      {
        title:       'Contacts & Companies',
        description: 'Search, enrich, and manage your full B2B database',
        href:        '/data/contacts',
        color:       '#6366F1',
        bg:          'rgba(99,102,241,0.08)',
        border:      'rgba(99,102,241,0.2)',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      },
      {
        title:       'Lead Finder AI',
        description: 'Describe your ICP and let AI find and score matching leads',
        href:        '/data/lead-finder',
        color:       '#F59E0B',
        bg:          'rgba(245,158,11,0.08)',
        border:      'rgba(245,158,11,0.2)',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
      },
    ],
  })

  /* ── Administration — admins only ── */
  if (isAdmin) {
    sections.push({
      heading: 'Administration',
      items: [
        {
          title:       'Admin Dashboard',
          description: 'Manage staff, run imports, view org-wide AI readiness',
          href:        '/admin',
          color:       '#3D6B00',
          bg:          'rgba(192,244,60,0.07)',
          border:      'rgba(192,244,60,0.18)',
          icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
        },
        {
          title:       'Toolkit',
          description: 'Smart Data, Website Builder, Market Intelligence, Brand Studio, Outreach and TresAgent',
          href:        '/admin/toolkit',
          color:       '#00695C',
          bg:          'rgba(0,105,92,0.08)',
          border:      'rgba(0,105,92,0.2)',
          icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
        },
        {
          title:       'Site Builder',
          description: 'Pick an event and a template — Event Pilot creates the GitHub repo and deploys the site automatically.',
          href:        '/admin/sites',
          color:       '#0369A1',
          bg:          'rgba(3,105,161,0.08)',
          border:      'rgba(3,105,161,0.2)',
          icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>,
        },
        {
          title:       'Platform Docs',
          description: 'Internal documentation — scoring guide, playbook, questionnaire',
          href:        '/docs',
          color:       '#2D3E50',
          bg:          'rgba(45,62,80,0.06)',
          border:      'rgba(45,62,80,0.15)',
          icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
        },
      ],
    })
  }

  return sections
}

/* ── Component ──────────────────────────────────────────────── */
interface PlatformMenuProps {
  staffId?: string | null
}

export default function PlatformMenu({ staffId }: PlatformMenuProps) {
  const [open,       setOpen]       = useState(false)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [dept,       setDept]       = useState('')
  const [hasReports, setHasReports] = useState(false)
  const [resolvedId, setResolvedId] = useState(staffId ?? '')
  const [loaded,     setLoaded]     = useState(false)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(async s => {
        if (!s) { setLoaded(true); return }
        setIsAdmin(!!s.adm)
        setDept(s.dept ?? '')
        const sid = s.sid ?? staffId ?? ''
        setResolvedId(sid)
        if (sid) {
          const sm = await fetch(`/api/staff-member?id=${sid}`).then(r => r.json()).catch(() => null)
          if (sm && !sm.error) setHasReports(!!sm.has_reports)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close])

  const sections = loaded
    ? buildSections(resolvedId, isAdmin, dept, hasReports)
    : []

  return (
    <>
      {/* Grid icon trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Platform menu"
        style={{
          width: '36px', height: '36px', borderRadius: '9px',
          background: '#FFFFFF', border: '1px solid #DDE8EE',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" fill="#00A5A3"/>
          <rect x="9" y="1" width="5" height="5" rx="1" fill="#00A5A3"/>
          <rect x="1" y="9" width="5" height="5" rx="1" fill="#00A5A3"/>
          <rect x="9" y="9" width="5" height="5" rx="1" fill="#00A5A3"/>
        </svg>
      </button>

      {/* Full-screen overlay */}
      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '72px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '860px', margin: '0 16px',
              background: '#FFFFFF', border: '1px solid #DDE8EE',
              borderRadius: '16px', overflow: 'hidden',
              maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #DDE8EE' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Event Pilot Platform</div>
                <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '2px' }}>Your workspace — everything you have access to</div>
              </div>
              <button
                onClick={close}
                style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FFFFFF', border: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="14" height="14" fill="none" stroke="#2A3038" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Sections */}
            <div style={{ padding: '20px 24px 28px' }}>
              {!loaded ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF', fontSize: '14px' }}>Loading…</div>
              ) : sections.map(section => (
                <div key={section.heading} style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '12px' }}>
                    {section.heading}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {section.items.map(item => (
                      <Link
                        key={item.title}
                        href={item.href}
                        onClick={close}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noreferrer' : undefined}
                        style={{ textDecoration: 'none' }}
                      >
                        <div
                          style={{
                            padding: '16px',
                            background: item.bg,
                            border: `1px solid ${item.border}`,
                            borderRadius: '14px',
                            cursor: 'pointer',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                            height: '100%',
                          }}
                          onMouseEnter={e => {
                            const el = e.currentTarget as HTMLElement
                            el.style.borderColor = item.color
                            el.style.boxShadow = `0 2px 12px ${item.color}20`
                          }}
                          onMouseLeave={e => {
                            const el = e.currentTarget as HTMLElement
                            el.style.borderColor = item.border
                            el.style.boxShadow = 'none'
                          }}
                        >
                          <div style={{ color: item.color, marginBottom: '10px' }}>{item.icon}</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '4px' }}>{item.title}</div>
                          <div style={{ fontSize: '12px', color: '#6B7280', lineHeight: 1.6 }}>{item.description}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
