'use client'

import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Card } from '@/app/components/ui'

/* CRM Admin landing — top-level, outside any event (per the CRM proposal's
   explicit "lives at the top level" requirement). Links to the three
   Phase-1 surfaces: the Properties registry and the Contact/Company
   directories. See supabase/crm_objects_migration.sql for the schema and
   app/lib/crm/upsert.ts for how speaker/partner onboarding feeds this. */

const TILES = [
  { href: '/admin/crm/contacts', label: 'Contacts', desc: 'Every person onboarded across all events — speakers, sponsor contacts, and more — deduped by email.' },
  { href: '/admin/crm/companies', label: 'Companies', desc: 'Every organization linked to an event — sponsors, exhibitors, and more — deduped by domain.' },
  { href: '/admin/crm/objects', label: 'Properties', desc: 'Manage the Contact/Company property registry — the "CRM property" targets available on HubSpot form mapping.' },
]

export default function CrmAdminPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Admin / CRM Admin"
        title="CRM Admin"
        description="The cross-event Contact/Company identity layer — the real target for HubSpot form field-mapping, separate from any single event's stakeholder records."
        backHref="/admin"
        backLabel="Back to Admin"
      />
      <div style={{ padding: '24px 32px', maxWidth: '900px', display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {TILES.map(t => (
          <Link key={t.href} href={t.href} style={{ textDecoration: 'none' }}>
            <Card padded>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>{t.label}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>{t.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
