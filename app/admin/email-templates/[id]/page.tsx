'use client'

import { useState, useEffect, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import EmailTemplateEditor, { type EmailTemplate } from '../EmailTemplateEditor'

export default function EditEmailTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [template, setTemplate] = useState<EmailTemplate | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/email-templates/${id}`).then(r => r.json()).then(setTemplate).finally(() => setLoading(false))
  }, [id])

  return (
    <div>
      <PageHeader eyebrow="Workspace / Email Templates" title={template?.name ?? 'Edit Template'} />
      <div style={{ padding: '24px 32px' }}>
        {loading && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>}
        {!loading && template && <EmailTemplateEditor template={template} />}
        {!loading && !template && <div style={{ fontSize: '13px', color: 'var(--red)' }}>Template not found.</div>}
      </div>
    </div>
  )
}
