import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Card } from '@/app/components/ui'

/* Part 1 placeholder (docs/build_suggestions/brand-and-content-section.md): Part 2 replaces this with one page and three tabs
   (Logo handling, Speaker photo handling, Creative placeholders). Until then it points at the existing standards pages. */
const LINKS = [
  { href: '/admin/branding/cleaning-cycle-template', label: 'Speaker photo handling', note: 'The Cleaned Photo standard every speaker photo is measured against.' },
  { href: '/admin/branding/placeholder-defaults', label: 'Creative placeholders', note: 'Default placeholders for speaker announcements, self-promo and badges.' },
]

export default function CreativeStandardsPage() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader eyebrow="Brand" title="Creative standards" description="The rules every creative follows: logo handling, speaker photo handling and creative placeholders." />
      <div style={{ display: 'grid', gap: '12px' }}>
        {LINKS.map(l => (
          <Card key={l.href} padded>
            <Link href={l.href} style={{ fontSize: '14px', fontWeight: 800, color: 'var(--teal-mid)', textDecoration: 'none' }}>{l.label} →</Link>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px' }}>{l.note}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}
