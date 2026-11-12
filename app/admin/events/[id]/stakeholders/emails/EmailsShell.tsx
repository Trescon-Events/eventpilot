'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/* The Emails module's side panel (2026-11-12), laid out like HubSpot's marketing email: Emails (everything that was written, scheduled or sent), Lists (who it goes to) and
   Templates (what it says), with a Create email button on top. */
export default function EmailsShell({ eventId, children }: { eventId: string; children: React.ReactNode }) {
  const path = usePathname()
  const base = `/admin/events/${eventId}/stakeholders/emails`
  const items = [
    { href: base, label: 'Emails', match: (p: string) => p === base || p.startsWith(`${base}/compose`) || p.startsWith(`${base}/sent`) },
    { href: `${base}/lists`, label: 'Lists', match: (p: string) => p.startsWith(`${base}/lists`) },
    { href: `${base}/templates`, label: 'Templates', match: (p: string) => p.startsWith(`${base}/templates`) },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: '70vh' }}>
      <nav aria-label="Emails sections" style={{ width: '210px', flexShrink: 0, position: 'sticky', top: '12px', padding: '20px 0 20px 24px', display: 'grid', gap: '4px' }}>
        <Link href={`${base}/compose`} style={{ display: 'block', textAlign: 'center', padding: '10px 14px', marginBottom: '12px', borderRadius: '10px', background: 'var(--teal-mid)', color: 'var(--card)', fontSize: '14px', fontWeight: 800, textDecoration: 'none' }}>+ Create email</Link>
        {items.map(i => {
          const on = i.match(path)
          return (
            <Link key={i.href} href={i.href} aria-current={on ? 'page' : undefined}
              style={{ display: 'block', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${on ? 'var(--teal-mid)' : 'transparent'}`, background: on ? 'var(--teal-light)' : 'none', color: on ? 'var(--teal-mid)' : 'var(--ink2)', fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>
              {i.label}
            </Link>
          )
        })}
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
