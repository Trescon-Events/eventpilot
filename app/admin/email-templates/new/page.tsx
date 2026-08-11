'use client'

import PageHeader from '@/app/components/PageHeader'
import EmailTemplateEditor from '../EmailTemplateEditor'

export default function NewEmailTemplatePage() {
  return (
    <div>
      <PageHeader eyebrow="Workspace / Email Templates" title="New Template" />
      <div style={{ padding: '24px 32px' }}>
        <EmailTemplateEditor />
      </div>
    </div>
  )
}
