'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/* Left-panel navigation for the Brand & Content workspace — same look and flow as the umbrella and event workspaces
   (app/admin/umbrellas/[id]/UmbrellaShell.tsx): a titled panel, an Overview link and the pages grouped beneath it. Every signed-in
   person sees every page; editing is decided inside each page (platform.branding.manage / platform.content.manage / super admin). */

function linkStyle(active: boolean): React.CSSProperties {
  return {
    display: 'block', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
    textDecoration: 'none', color: active ? 'var(--teal-mid)' : 'var(--ink2)',
    background: active ? 'var(--teal-light)' : 'transparent',
    borderLeft: `2.5px solid ${active ? 'var(--teal-mid)' : 'transparent'}`,
  }
}
const groupLabel: React.CSSProperties = { fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink4)', padding: '12px 0 4px 12px' }

export const BRAND_CONTENT_NAV = [
  { group: 'Brand', items: [
    { href: '/brand-content/brand/book', label: 'Brand book', description: 'Guidelines, logos, colours, fonts and templates.', icon: '❖' },
    { href: '/brand-content/brand/fonts', label: 'Font library', description: 'Brand fonts every creative can use.', icon: 'Aa' },
    { href: '/brand-content/brand/creative-standards', label: 'Creative standards', description: 'Logo handling, speaker photo handling and creative placeholders.', icon: '◎' },
  ] },
  { group: 'Content', items: [
    { href: '/brand-content/content/style-guide', label: 'Content style guide', description: 'The Trescon-wide style guide and the rules EventPilot checks.', icon: '❏' },
    { href: '/brand-content/content/company-profile', label: 'Company profile', description: 'Approved About Trescon texts and company figures.', icon: '◈' },
  ] },
] as const

export default function BrandContentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname().replace(/\/+$/, '')
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '20px 0 0 20px' }}>
      <nav style={{ width: '212px', flexShrink: 0, position: 'sticky', top: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink4)', paddingLeft: '12px' }}>Workspace</div>
        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '4px 0 12px', paddingLeft: '12px', lineHeight: 1.3 }}>Brand &amp; Content</div>
        <div style={{ display: 'grid', gap: '2px' }}>
          <Link href="/brand-content" style={linkStyle(pathname === '/brand-content')}>Overview</Link>
          {BRAND_CONTENT_NAV.map(g => (
            <div key={g.group}>
              <div style={groupLabel}>{g.group}</div>
              <div style={{ display: 'grid', gap: '2px' }}>
                {g.items.map(i => <Link key={i.href} href={i.href} style={linkStyle(pathname === i.href || pathname.startsWith(i.href + '/'))}>{i.label}</Link>)}
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
