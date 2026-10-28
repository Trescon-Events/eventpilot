import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { FORM_TYPES } from '@/app/lib/forms/types'
import { repairFormWorkflowReEnrollment } from '@/app/lib/hubspot/crm-client'
import { checkOne, dismissGap, fillGap } from '@/app/lib/hubspot/submission-gap'

/* The "Sync health" card on the Connect HubSpot Form page.
   GET  ?event_id&form_type  — runs the HubSpot-vs-EventPilot check now and returns it.
   POST { event_id, form_type, action: 'fill' | 'dismiss' | 'repair', conversion_ids? }
     fill    — brings the listed HubSpot submissions into EventPilot (built from what the submitter entered).
     dismiss — stops listing them (e.g. they were deleted on purpose, or are spam).
     repair  — puts the re-enrollment trigger back on the HubSpot workflow. A live HubSpot workflow, so only ever by a person pressing the button. */

export const maxDuration = 60

async function authorize(req: NextRequest, eventId: string | null | undefined, formType: string | null | undefined) {
  if (!eventId || !formType || !FORM_TYPES.includes(formType as never)) return NextResponse.json({ error: 'event_id and a valid form_type required' }, { status: 400 })
  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.forms.manage'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  return null
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id'), formType = req.nextUrl.searchParams.get('form_type')
  const denied = await authorize(req, eventId, formType)
  if (denied) return denied
  const health = await checkOne(eventId!, formType!)
  if (!health) return NextResponse.json({ error: 'No HubSpot form is connected here.' }, { status: 404 })
  return NextResponse.json({ health })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; form_type?: string; action?: string; conversion_ids?: string[] } | null
  const denied = await authorize(req, body?.event_id, body?.form_type)
  if (denied) return denied
  const ids = Array.isArray(body!.conversion_ids) ? body!.conversion_ids.filter(x => typeof x === 'string').slice(0, 100) : []
  try {
    if (body!.action === 'fill' && ids.length) {
      const r = await fillGap(body!.event_id!, body!.form_type!, ids)
      return NextResponse.json({ ...r, health: await checkOne(body!.event_id!, body!.form_type!) })
    }
    if (body!.action === 'dismiss' && ids.length) {
      await dismissGap(body!.event_id!, body!.form_type!, ids)
      return NextResponse.json({ health: await checkOne(body!.event_id!, body!.form_type!) })
    }
    if (body!.action === 'repair') {
      const { data: conn } = await supabaseAdmin.from('event_hubspot_forms').select('hubspot_workflow_id').eq('event_id', body!.event_id!).eq('form_type', body!.form_type!).maybeSingle()
      if (!conn?.hubspot_workflow_id) return NextResponse.json({ error: 'No HubSpot workflow is recorded for this form.' }, { status: 404 })
      const changed = await repairFormWorkflowReEnrollment(conn.hubspot_workflow_id as string)
      return NextResponse.json({ changed, health: await checkOne(body!.event_id!, body!.form_type!) })
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 502 })
  }
}
