'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import PlatformMenu from '@/app/components/PlatformMenu'

const NAV_GROUPS = [
  {
    label: 'LEAD EXTRACTION',
    items: [
      { label: 'File Extractor',  href: '/data/extract/file',    icon: 'file' },
      { label: 'URL Extractor',   href: '/data/extract/url',     icon: 'link' },
      { label: 'Website Finder',  href: '/data/extract/website', icon: 'globe' },
      { label: 'Detail Extractor',href: '/data/extract/detail',  icon: 'user' },
    ],
  },
  {
    label: 'L2 TAXONOMY',
    items: [
      { label: 'L2 Finder',   href: '/data/l2',          icon: 'tag' },
      { label: 'L2 Manager',  href: '/data/l2?tab=manager', icon: 'list' },
    ],
  },
  {
    label: 'DATA ENRICHMENT',
    items: [
      { label: 'LinkedIn Enricher', href: '/data/enrichment',           icon: 'linkedin' },
      { label: 'Email Verifier',    href: '/data/enrichment?tab=verify', icon: 'mail' },
    ],
  },
  {
    label: 'EMAIL RECOVERY',
    items: [
      { label: 'Email Guesser', href: '/data/email-guesser', icon: 'wand' },
    ],
  },
  {
    label: 'DATABASE',
    items: [
      { label: 'Contacts',          href: '/data/contacts',  icon: 'contacts' },
      { label: 'Companies',         href: '/data/companies', icon: 'building' },
      { label: 'Enrichment Audit',  href: '/data/audit',     icon: 'audit'    },
    ],
  },
  {
    label: 'PIPELINE',
    items: [
      { label: 'Kanban Board',  href: '/data/pipeline', icon: 'kanban' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { label: 'Lead Finder AI',   href: '/data/lead-finder', icon: 'target'    },
      { label: 'Saved Audiences',  href: '/data/audiences',   icon: 'audiences' },
      { label: 'Contact Scoring',  href: '/data/scoring',     icon: 'scoring'   },
      { label: 'Analytics',        href: '/data/analytics',   icon: 'chart'     },
      { label: 'Data Quality',     href: '/data/quality',     icon: 'check'     },
    ],
  },
]

function NavIcon({ name }: { name: string }) {
  const style = { flexShrink: 0 as const }
  switch (name) {
    case 'file':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    case 'link':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    case 'globe':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    case 'user':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    case 'tag':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
    case 'list':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
    case 'linkedin':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
    case 'mail':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
    case 'wand':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>
    case 'contacts':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'building':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
    case 'target':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
    case 'chart':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
    case 'kanban':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/></svg>
    case 'check':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    case 'audit':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    case 'audiences':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'scoring':
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
    default:
      return <svg {...style} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
  }
}

interface Credits { total_used: number; default_limit: number; tools: { key: string; active: boolean }[] }

export default function DataLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [session, setSession]   = useState<{ adm?: boolean; sid?: string } | null>(null)
  const [credits, setCredits]   = useState<Credits | null>(null)

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => setSession(s)).catch(() => {})
    fetch('/api/data/credits').then(r => r.json()).then(d => setCredits(d)).catch(() => {})
  }, [])

  const backHref  = session === null ? null : session.adm ? '/admin/toolkit' : session.sid ? `/dashboard?id=${session.sid}` : '/dashboard'
  const backLabel = session?.adm ? 'Back to Toolkit' : 'Back to Dashboard'

  const isActive = (href: string) => {
    const base = href.split('?')[0]
    if (base === '/data/l2' && pathname === '/data/l2') return true
    if (base === '/data/enrichment' && pathname === '/data/enrichment') return true
    return pathname === base || (base !== '/data' && pathname.startsWith(base + '/'))
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Fixed sidebar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: '260px',
        background: '#FFFFFF', borderRight: '1px solid #DDE8EE',
        display: 'flex', flexDirection: 'column', zIndex: 100, overflowY: 'auto',
      }}>
        {/* Back to platform + logo */}
        <div style={{ padding: '14px 20px 14px', borderBottom: '1px solid #DDE8EE', flexShrink: 0 }}>
          {/* Back link */}
          {backHref && (
            <Link href={backHref} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9CA3AF', textDecoration: 'none', marginBottom: '14px' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#00A5A3')}
              onMouseLeave={e => (e.currentTarget.style.color = '#9CA3AF')}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              {backLabel}
            </Link>
          )}
          {/* Module identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(0,165,163,0.1)', border: '1px solid rgba(0,165,163,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', letterSpacing: '-0.2px' }}>Smart Data</div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '1px' }}>Data Intelligence</div>
            </div>
            <PlatformMenu />
          </div>
        </div>

        {/* Credits bar */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #DDE8EE', flexShrink: 0 }}>
          {credits ? (
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '5px' }}>
                Today: <span style={{ color: credits.total_used > 0 ? '#0F1923' : '#9CA3AF', fontWeight: 700 }}>{credits.total_used}</span>
                <span style={{ color: '#C4CDD6' }}> / {credits.default_limit} lookups</span>
              </div>
              <div style={{ height: '3px', background: '#F0F4F7', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: credits.total_used / credits.default_limit > 0.8 ? '#F87171' : '#00A5A3', borderRadius: '2px', width: `${Math.min((credits.total_used / credits.default_limit) * 100, 100)}%`, transition: 'width 0.4s' }} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#C4CDD6' }}>Loading credits…</div>
          )}
        </div>

        {/* Nav groups */}
        <div style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {NAV_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: '4px' }}>
              <div style={{ padding: '8px 20px 4px', fontSize: '11px', fontWeight: 700, color: '#9CA3AF', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                {group.label}
              </div>
              {group.items.map(item => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 20px', marginBottom: '1px',
                      fontSize: '13px', fontWeight: active ? 600 : 400,
                      color: active ? '#00A5A3' : '#6B7280',
                      background: active ? 'rgba(0,165,163,0.1)' : 'transparent',
                      borderLeft: active ? '2px solid #00A5A3' : '2px solid transparent',
                      textDecoration: 'none',
                      transition: 'background 0.12s, color 0.12s',
                    }}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>

        {/* Bottom status */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #DDE8EE', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#9CA3AF', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: '#9CA3AF' }}>0 jobs running</span>
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            reachcharan@gmail.com
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: '260px', flex: 1, minHeight: '100vh', background: '#F8FAFB' }}>
        {children}
      </div>
    </div>
  )
}
