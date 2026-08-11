'use client'

import { use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button } from '@/app/components/ui'
import { FormSchemaEditor } from '@/app/components/forms/FormSchemaEditor'
import { FormType, FORM_TYPES, FORM_TITLES } from '@/app/lib/forms/types'

/* Global default-form editor. No client-side permission fetch needed here
   (unlike the per-event wrapper) — /admin/form-templates isn't in
   middleware.ts's isToolRoute allowlist, so the blanket /admin gate
   (session.adm required) already ran before this page could render. */

export default function FormTemplateEditorPage({ params }: { params: Promise<{ formType: string }> }) {
  const { formType } = use(params)
  const valid = FORM_TYPES.includes(formType as FormType)

  if (!valid) {
    return <div style={{ padding: '32px', fontSize: '13px', color: 'var(--red)' }}>Unknown form type.</div>
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace / Form Templates"
        title={FORM_TITLES[formType as FormType]}
        description="Edits here set the default form every new event starts with. A producer can still override it per event from that event's Stakeholder Hub."
        actions={<Link href="/admin/form-templates"><Button variant="ghost">← Back to Form Templates</Button></Link>}
      />
      <div style={{ padding: '24px 32px' }}>
        <FormSchemaEditor
          schemaApiUrl={`/api/admin/form-templates/${formType}/schema`}
          canManage={true}
          resetButtonLabel="Reset to Original"
          resetConfirmMessage="This removes your customizations and reverts to the original built-in fields. This changes the default for every event that hasn't customized this form itself."
        />
      </div>
    </div>
  )
}
