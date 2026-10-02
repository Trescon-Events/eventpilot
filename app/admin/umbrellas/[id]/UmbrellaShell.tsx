'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Left-panel navigation for an umbrella's workspace — same look as the event workspace's panel
   (app/admin/events/[id]/page.tsx). Only what the person can use is listed (see layout.tsx): a platform admin
   gets Event Details, Reference Documents, Events and Access as well; an Operations user gets Operations only.
   It also registers the umbrella's real name for the breadcrumb, so the trail never shows the raw id. */

function linkStyle(active: boolean): React.CSSProperties {
  return {
    display: 'block', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
    textDecoration: 'none', color: active ? 'var(--teal-mid)' : 'var(--ink2)',
    background: active ? 'var(--teal-light)' : 'transparent',
    borderLeft: `2.5px solid ${active ? 'var(--teal-mid)' : 'transparent'}`,
  }
}
const subStyle = (active: boolean): React.CSSProperties => ({
  display: 'block', padding: '6px 10px', borderRadius: '6px', fontSize: '12.5px', fontWeight: active ? 700 : 600,
  color: active ? 'var(--teal-mid)' : 'var(--ink3)', textDecoration: 'none',
})

export type UmbrellaNavChild = { id: string; name: string }

export default function UmbrellaShell({ umbrellaId, name, isAdmin, canOps, children: pageChildren, events }: {
  umbrellaId: string; name: string; isAdmin: boolean; canOps: boolean; children: React.ReactNode; events: UmbrellaNavChild[]
}) {
  useBreadcrumbLabel(umbrellaId, name)
  const pathname = usePathname().replace(/\/+$/, '')
  const base = `/admin/umbrellas/${umbrellaId}`
  const opsBase = `${base}/operations`
  const inOps = pathname === opsBase || pathname.startsWith(opsBase + '/')
  const opsSub = (suffix: string) => inOps && pathname === `${opsBase}/${suffix}`

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '20px 0 0 20px' }}>
      <nav style={{ width: '212px', flexShrink: 0, position: 'sticky', top: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink4)', paddingLeft: '12px' }}>
          Umbrella Workspace
        </div>
        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '4px 0 12px', paddingLeft: '12px', lineHeight: 1.3 }}>{name}</div>
        <div style={{ display: 'grid', gap: '2px' }}>
          <Link href={base} style={linkStyle(pathname === base)}>Overview</Link>
          {isAdmin && <Link href={`${base}/details`} style={linkStyle(pathname === `${base}/details`)}>Event Details</Link>}
          {isAdmin && <Link href={`${base}/reference-docs`} style={linkStyle(pathname === `${base}/reference-docs`)}>Reference Documents</Link>}
          {isAdmin && events.length > 0 && (
            <div>
              <div style={{ ...linkStyle(false), cursor: 'default', borderLeft: '2.5px solid transparent' }}>Events</div>
              <div style={{ paddingLeft: '14px', marginTop: '2px', display: 'grid', gap: '1px' }}>
                {events.map(e => <Link key={e.id} href={`/admin/events/${e.id}`} style={subStyle(false)}>{e.name}</Link>)}
              </div>
            </div>
          )}
          {canOps && (
            <div>
              <Link href={opsBase} style={linkStyle(pathname === opsBase)}>Operations</Link>
              <div style={{ paddingLeft: '14px', marginTop: '2px', display: 'grid', gap: '1px' }}>
                <Link href={`${opsBase}/licenses`} style={subStyle(opsSub('licenses'))}>Licences</Link>
                <Link href={`${opsBase}/vendors`} style={subStyle(opsSub('vendors'))}>Vendors</Link>
                <Link href={`${opsBase}/badges`} style={subStyle(inOps && pathname.startsWith(`${opsBase}/badges`))}>Badge Printing</Link>
                <Link href={`${opsBase}/access`} style={subStyle(opsSub('access'))}>Access</Link>
              </div>
            </div>
          )}
          {isAdmin && <Link href={`${base}/access`} style={linkStyle(pathname === `${base}/access`)}>Access</Link>}
        </div>
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}>{pageChildren}</div>
    </div>
  )
}
