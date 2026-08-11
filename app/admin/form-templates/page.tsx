'use client'

import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Card } from '@/app/components/ui'
import { FORM_TYPES, FORM_TITLES } from '@/app/lib/forms/types'

/* Global default onboarding-form fields — a follow-up phase to the
   per-event Form Builder (SAE producer-workflow initiative). Mirrors
   Email Templates' placement/pattern (app/admin/email-templates): a
   workspace-level admin tool, not nested under app/admin/events/[id]/.
   Unlike Email Templates' list (a real, growing DB query), the 4 form
   types are a fixed compile-time list — a static grid, no fetch needed. */

export default function FormTemplatesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Form Templates"
        description="Default onboarding form fields for speakers, sponsors, and partners — applies to every event unless a producer customizes it for their own event."
      />
      <div style={{ padding: '24px 32px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gap: '10px' }}>
          {FORM_TYPES.map(formType => (
            <Link key={formType} href={`/admin/form-templates/${formType}`} style={{ textDecoration: 'none' }}>
              <Card padded>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{FORM_TITLES[formType]}</div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
