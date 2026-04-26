'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type PlatformItem = {
  title:       string
  description: string
  href?:       string  // undefined = coming soon
  icon:        React.ReactNode
  color:       string
  bg:          string
  border:      string
  badge?:      string // e.g. "Manager" "Admin"
}

type PlatformSection = {
  heading: string
  items:   PlatformItem[]
}

function buildSections(staffId: string | null): PlatformSection[] {
  const id = staffId ?? ''

  return [
    {
      heading: 'Learning',
      items: [
        {
          title:       'My Dashboard',
          description: 'Your TAIRS score, track progress, and recommended courses',
          href:        id ? `/dashboard?id=${id}` : '/login',
          color:       '#00A5A3',
          bg:          'rgba(0,165,163,0.08)',
          border:      'rgba(0,165,163,0.2)',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          ),
        },
        {
          title:       'Course Library',
          description: 'Browse all published courses across every tier and department',
          href:        id ? `/dashboard/library?id=${id}` : '/login',
          color:       '#C0F43C',
          bg:          'rgba(192,244,60,0.07)',
          border:      'rgba(192,244,60,0.18)',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          ),
        },
        {
          title:       'Talk to Tresci',
          description: 'AI assistant for your learning questions and course guidance',
          href:        '/chat',
          color:       '#A478FF',
          bg:          'rgba(164,120,255,0.08)',
          border:      'rgba(164,120,255,0.2)',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          ),
        },
      ],
    },
    {
      heading: 'Team & Organisation',
      items: [
        {
          title:       'Team Dashboard',
          description: 'TAIRS overview, completion rates, and progress for your team',
          href:        id ? `/team?id=${id}` : '/login',
          color:       '#FF9F43',
          bg:          'rgba(255,159,67,0.08)',
          border:      'rgba(255,159,67,0.2)',
          badge:       'Manager',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          ),
        },
        {
          title:       'Insights',
          description: 'Office-wide adoption trends, weekly learning activity, and team stats',
          color:       'rgba(255,255,255,0.4)',
          bg:          'rgba(255,255,255,0.03)',
          border:      'rgba(255,255,255,0.08)',
          badge:       'Coming Soon',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          ),
        },
        {
          title:       'Org Chart',
          description: 'Visual hierarchy of reporting lines and team structure',
          color:       'rgba(255,255,255,0.4)',
          bg:          'rgba(255,255,255,0.03)',
          border:      'rgba(255,255,255,0.08)',
          badge:       'Coming Soon',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="2"/>
              <circle cx="5" cy="19" r="2"/>
              <circle cx="19" cy="19" r="2"/>
              <line x1="12" y1="7" x2="12" y2="13"/>
              <line x1="12" y1="13" x2="5" y2="17"/>
              <line x1="12" y1="13" x2="19" y2="17"/>
            </svg>
          ),
        },
      ],
    },
    {
      heading: 'Administration',
      items: [
        {
          title:       'Admin Dashboard',
          description: 'Manage courses, staff members, and platform configuration',
          href:        '/admin',
          color:       '#C0F43C',
          bg:          'rgba(192,244,60,0.07)',
          border:      'rgba(192,244,60,0.18)',
          badge:       'Admin',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          ),
        },
        {
          title:       'Platform Docs',
          description: 'Internal documentation for how Trescademy works',
          href:        '/docs',
          color:       'rgba(255,255,255,0.7)',
          bg:          'rgba(255,255,255,0.04)',
          border:      'rgba(255,255,255,0.1)',
          badge:       'Admin',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          ),
        },
        {
          title:       'Learning Paths',
          description: 'Assign curated learning sequences to teams or individuals',
          color:       'rgba(255,255,255,0.4)',
          bg:          'rgba(255,255,255,0.03)',
          border:      'rgba(255,255,255,0.08)',
          badge:       'Coming Soon',
          icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          ),
        },
      ],
    },
  ]
}

interface PlatformMenuProps {
  staffId?: string | null
}

export default function PlatformMenu({ staffId }: PlatformMenuProps) {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close])

  const sections = buildSections(staffId ?? null)

  return (
    <>
      {/* Grid icon trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Platform menu"
        style={{
          width: '36px', height: '36px', borderRadius: '9px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" fill="rgba(255,255,255,0.6)"/>
          <rect x="9" y="1" width="5" height="5" rx="1" fill="rgba(255,255,255,0.6)"/>
          <rect x="1" y="9" width="5" height="5" rx="1" fill="rgba(255,255,255,0.6)"/>
          <rect x="9" y="9" width="5" height="5" rx="1" fill="rgba(255,255,255,0.6)"/>
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
              background: '#0F1214',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px',
              overflow: 'hidden',
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto',
            }}
          >
            {/* Menu header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'white' }}>Trescademy Platform</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>All features · navigate anywhere</div>
              </div>
              <button
                onClick={close}
                style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="14" height="14" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Sections */}
            <div style={{ padding: '20px 24px 28px' }}>
              {sections.map(section => (
                <div key={section.heading} style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>
                    {section.heading}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {section.items.map(item => {
                      const isSoon = !item.href
                      const Card = (
                        <div style={{
                          padding: '16px',
                          background: item.bg,
                          border: `1px solid ${item.border}`,
                          borderRadius: '14px',
                          cursor: isSoon ? 'default' : 'pointer',
                          opacity: isSoon ? 0.6 : 1,
                          transition: 'border-color 0.15s, opacity 0.15s',
                        }}
                          onMouseEnter={e => { if (!isSoon) (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
                          onMouseLeave={e => { if (!isSoon) (e.currentTarget as HTMLElement).style.opacity = '1' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <div style={{ color: item.color }}>{item.icon}</div>
                            {item.badge && (
                              <span style={{
                                fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                                textTransform: 'uppercase', padding: '2px 7px',
                                borderRadius: '20px',
                                background: isSoon ? 'rgba(255,255,255,0.06)' : `${item.bg}`,
                                border: `1px solid ${item.border}`,
                                color: isSoon ? 'rgba(255,255,255,0.3)' : item.color,
                              }}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: isSoon ? 'rgba(255,255,255,0.4)' : 'white', marginBottom: '4px' }}>{item.title}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{item.description}</div>
                        </div>
                      )

                      return item.href ? (
                        <Link key={item.title} href={item.href} onClick={close} style={{ textDecoration: 'none' }}>
                          {Card}
                        </Link>
                      ) : (
                        <div key={item.title}>{Card}</div>
                      )
                    })}
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
