'use client'

import { useState, useEffect, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { FormSchemaEditor } from '@/app/components/forms/FormSchemaEditor'
import { FormType, FORM_TYPES, PROPERTY_TITLES } from '@/app/lib/forms/types'

/* Thin wrapper around the shared FormSchemaEditor — owns event-scoped
   RBAC (sae.forms.manage) and page chrome (PageHeader, back-link). The
   actual builder UI lives in app/components/forms/FormSchemaEditor.tsx,
   shared with the global Form Templates tool (app/admin/form-templates).

   Reframed as "Properties" (2026-09-19, Madhu) rather than "Form Builder" —
   the route/component names are unchanged (still event_form_schemas
   underneath), but its real job for any event with connected HubSpot/
   KonfHub forms is defining this event's own field set for the manual
   Stakeholder Hub Add/Edit panel and the "EventPilot field" HubSpot
   mapping target, not designing a public form (nobody fills EventPilot's
   own native form once a HubSpot form is connected — see
   eventpilot_hubspot_forms_pivot memory). Still genuinely load-bearing for
   any event/form_type that HASN'T connected an external form yet — most of
   them, as of this date — where it's still the real public form editor. */

export default function FormBuilderPage({ params }: { params: Promise<{ id: string; formType: string }> }) {
  const { id: eventId, formType } = use(params)
  const valid = FORM_TYPES.includes(formType as FormType)

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(valid)
  // null while loading — decides schemaApiUrl/canManage below, so
  // FormSchemaEditor must not render with a guessed value.
  const [hubspotConnected, setHubspotConnected] = useState<boolean | null>(null)

  const can = (key: string) => permissionSetSatisfies(permissions, key)

  useEffect(() => {
    if (!valid) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches stakeholders/page.tsx's fetchAll effect
    setLoading(true)
    Promise.all([
      fetch(`/api/events/access/me?event_id=${eventId}`).then(r => r.json()).catch(() => ({ permissions: [] })),
      // active_only=1 here purely to read back hubspotConnected — this
      // page's own FormSchemaEditor fetch below re-requests the fields
      // themselves once schemaApiUrl is set; a second cheap request is
      // simpler and safer than threading a callback through the shared
      // editor component just for this one flag.
      fetch(`/api/events/stakeholders/forms/${formType}/schema?event_id=${eventId}&active_only=1`).then(r => r.json()).catch(() => ({ hubspotConnected: false })),
    ]).then(([perm, schema]) => {
      setPermissions(new Set(perm.permissions ?? []))
      setHubspotConnected(!!schema.hubspotConnected)
      setLoading(false)
    })
  }, [eventId, formType, valid])

  if (!valid) {
    return (
      <div style={{ padding: '32px', fontSize: '13px', color: 'var(--red)' }}>Unknown form type.</div>
    )
  }

  const canManage = can('sae.forms.manage') && hubspotConnected !== true
  const typeLabel = formType === 'speaker' ? 'Speaker' : formType === 'sponsor' ? 'Sponsor' : formType === 'media_partner' ? 'Media Partner' : 'Association Partner'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace / Settings"
        title={PROPERTY_TITLES[formType as FormType]}
        description={
          hubspotConnected
            ? `This form is connected to HubSpot — this list is a live, read-only reflection of whatever's currently mapped as an "EventPilot field" on the mapping page. To add, remove, or change a field here, do it there instead; it updates automatically.`
            : `Add, remove, reorder, and relabel ${typeLabel}-only fields for this event — these drive the manual Add/Edit panel and the "EventPilot field" option on the HubSpot mapping page. Need a field usable by more than one stakeholder type? Use Event Properties instead. Changes only affect this event.`
        }
        backHref={`/admin/events/${eventId}`}
        backLabel="Back to Event Workspace"
      />

      <div style={{ padding: '24px 32px' }}>
        <FormSchemaEditor
          schemaApiUrl={`/api/events/stakeholders/forms/${formType}/schema?event_id=${eventId}&${hubspotConnected ? 'active_only' : 'base_only'}=1`}
          canManage={canManage}
          permissionsLoading={loading || hubspotConnected === null}
          resetConfirmMessage="This removes all customizations and reverts to the default form. Existing submissions are unaffected."
          noPermissionMessage={hubspotConnected ? "This form is HubSpot-connected — manage its fields from the mapping page, not here." : undefined}
        />
      </div>
    </div>
  )
}
