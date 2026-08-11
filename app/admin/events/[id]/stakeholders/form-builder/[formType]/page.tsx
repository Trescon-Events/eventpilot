'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button } from '@/app/components/ui'
import { FormSchemaEditor } from '@/app/components/forms/FormSchemaEditor'
import { FormType, FORM_TYPES, FORM_TITLES } from '@/app/lib/forms/types'

/* Thin wrapper around the shared FormSchemaEditor — owns event-scoped
   RBAC (sae.forms.manage) and page chrome (PageHeader, back-link). The
   actual builder UI lives in app/components/forms/FormSchemaEditor.tsx,
   shared with the global Form Templates tool (app/admin/form-templates). */

export default function FormBuilderPage({ params }: { params: Promise<{ id: string; formType: string }> }) {
  const { id: eventId, formType } = use(params)
  const valid = FORM_TYPES.includes(formType as FormType)

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(valid)

  const can = (key: string) => permissions.has('*') || permissions.has(key)

  useEffect(() => {
    if (!valid) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches stakeholders/page.tsx's fetchAll effect
    setLoading(true)
    fetch(`/api/events/access/me?event_id=${eventId}`).then(r => r.json()).catch(() => ({ permissions: [] })).then(perm => {
      setPermissions(new Set(perm.permissions ?? []))
      setLoading(false)
    })
  }, [eventId, valid])

  if (!valid) {
    return (
      <div style={{ padding: '32px', fontSize: '13px', color: 'var(--red)' }}>Unknown form type.</div>
    )
  }

  const canManage = can('sae.forms.manage')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Stakeholder Hub / Customize Form"
        title={FORM_TITLES[formType as FormType]}
        description="Add, remove, reorder, and relabel the fields on this event's onboarding form. Changes only affect this event."
        actions={<Link href={`/admin/events/${eventId}/stakeholders`}><Button variant="ghost">← Back to Stakeholder Hub</Button></Link>}
      />

      <div style={{ padding: '24px 32px' }}>
        <FormSchemaEditor
          schemaApiUrl={`/api/events/stakeholders/forms/${formType}/schema?event_id=${eventId}`}
          canManage={canManage}
          permissionsLoading={loading}
          resetConfirmMessage="This removes all customizations and reverts to the default form. Existing submissions are unaffected."
        />
      </div>
    </div>
  )
}
