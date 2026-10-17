'use client'

import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { useBrandContentAccess } from '@/app/components/brand-content/access'
import { BRAND_CONTENT_NAV } from './BrandContentShell'

/* Brand & Content hub — a header and a grid of tiles, same pattern as the umbrella and event workspace hubs. Everyone signed in can open
   every page; the chip on each group says whether the person can edit it. */
function Tile({ href, icon, title, description, tint }: { href: string; icon: string; title: string; description: string; tint: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', height: '100%' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 800, color: 'var(--ink)', flexShrink: 0 }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px', lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>
    </Link>
  )
}

export default function BrandContentHome() {
  const access = useBrandContentAccess()
  const canEdit = (g: string) => (g === 'Brand' ? access?.can_edit_brand : access?.can_edit_content)
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '8px 32px 48px' }}>
      <PageHeader eyebrow="Standards" title="Brand & Content" description="What Trescon follows: the brand, and the approved content and style. The single source of truth for people and for the tools." />
      {BRAND_CONTENT_NAV.map(g => (
        <div key={g.group} style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink4)' }}>{g.group}</div>
            {access && <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'var(--card)', border: '1px solid var(--border)', color: canEdit(g.group) ? 'var(--teal-mid)' : 'var(--ink3)' }}>{canEdit(g.group) ? 'You can edit' : 'View only'}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {g.items.map(i => <Tile key={i.href} href={i.href} icon={i.icon} title={i.label} description={i.description} tint={g.group === 'Brand' ? 'color-mix(in srgb, var(--purple) 16%, transparent)' : 'color-mix(in srgb, var(--teal-mid) 16%, transparent)'} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
