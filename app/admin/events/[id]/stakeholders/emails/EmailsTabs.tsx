'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/* The three screens of the Emails module (2026-11-12): who (Lists), what (Compose), what happened (Sent). */
export default function EmailsTabs({ eventId }: { eventId: string }) {
  const path = usePathname()
  const base = `/admin/events/${eventId}/stakeholders/emails`
  const tabs = [{ href: base, label: 'Lists' }, { href: `${base}/compose`, label: 'Compose' }, { href: `${base}/templates`, label: 'Templates' }, { href: `${base}/sent`, label: 'Sent' }]
  return (
    <nav aria-label="Emails sections" style={{ display: 'flex', gap: '4px', padding: '0 32px', borderBottom: '1px solid var(--border-light)' }}>
      {tabs.map(t => {
        const on = path === t.href
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
            style={{ padding: '10px 16px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', color: on ? 'var(--teal-mid)' : 'var(--ink3)', borderBottom: `2px solid ${on ? 'var(--teal-mid)' : 'transparent'}`, marginBottom: '-1px' }}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
