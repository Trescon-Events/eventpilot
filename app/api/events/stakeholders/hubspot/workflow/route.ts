import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { FormType, FORM_TYPES, FORM_TITLES } from '@/app/lib/forms/types'
import { createFormSubmissionWebhookWorkflow } from '@/app/lib/hubspot/crm-client'

/* POST /api/events/stakeholders/hubspot/workflow
   Body: { event_id, form_type }

   The "Set Up Automatic Sync" button on the Connect HubSpot Form page
   (2026-09-20, Madhu) — creates the HubSpot Workflow (Form submission
   trigger -> Send a webhook action) that previously had to be built by
   hand, once per connected form, directly in HubSpot's own UI. See
   createFormSubmissionWebhookWorkflow()'s own doc comment (app/lib/
   hubspot/crm-client.ts) for the real, live workflow this shape was
   copied from.

   Refuses to run twice for the same connection — hubspot_workflow_id
   already set means either this route already succeeded, or the
   connection predates this feature and someone built the workflow by
   hand in HubSpot (e.g. WAIS Malaysia's) and it's just never been
   recorded here. Either way, silently creating a SECOND workflow against
   the same form would double-fire every future submission. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; form_type?: string } | null
  if (!body?.event_id || !body?.form_type) {
    return NextResponse.json({ error: 'event_id and form_type required' }, { status: 400 })
  }
  if (!FORM_TYPES.includes(body.form_type as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: connection } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('id, hubspot_form_id, hubspot_form_name, hubspot_workflow_id')
    .eq('event_id', body.event_id).eq('form_type', body.form_type)
    .maybeSingle()
  if (!connection) return NextResponse.json({ error: 'No HubSpot form is connected for this event/form type yet.' }, { status: 404 })
  if (connection.hubspot_workflow_id) {
    return NextResponse.json({ error: 'A workflow already exists for this connection — check HubSpot directly if you need to rebuild it.' }, { status: 409 })
  }

  let workflow: { id: string; name: string }
  try {
    const workflowName = `EventPilot — ${connection.hubspot_form_name || FORM_TITLES[body.form_type as FormType]}`
    workflow = await createFormSubmissionWebhookWorkflow(connection.hubspot_form_id, workflowName)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not create the HubSpot workflow'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const { error } = await supabaseAdmin
    .from('event_hubspot_forms')
    .update({ hubspot_workflow_id: workflow.id, hubspot_workflow_created_at: new Date().toISOString() })
    .eq('id', connection.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ hubspot_workflow_id: workflow.id, hubspot_workflow_name: workflow.name })
}
