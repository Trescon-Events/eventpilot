import PageHeader from '@/app/components/PageHeader'
import { Card } from '@/app/components/ui'

/* Part 1 placeholder: Part 3 builds the Company profile (approved About Trescon texts and company figures). */
export default function CompanyProfilePage() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader eyebrow="Content" title="Company profile" description="The approved About Trescon texts and the company figures they quote." />
      <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Coming soon.</div></Card>
    </div>
  )
}
