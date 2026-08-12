import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { FormType, FORM_TYPES } from '@/app/lib/forms/types'
import { logHubspotPageLinkChange } from '@/app/lib/events/detail-field-log'

/* GET /api/events/stakeholders/hubspot/public-page-link?event_id=X
   Lists every connected HubSpot form for this event with its
   public_page_url — the "Public Onboarding Pages" subsection on the Event
   Details page (2026-08-11).

   PUT  /api/events/stakeholders/hubspot/public-page-link
   Body: { event_id, form_type, public_page_url }
   Updates the officially branded page hosting that form_type's embedded
   HubSpot form (e.g. worldaishow.com/malaysia/speaker-onboarding) —
   preferred by invite emails over EventPilot's own hosted /public/forms/...
   page when set (see invites/compose/route.ts). Logged to
   event_details_field_changes so it shows up in the same change history
   as the other Common Details fields. */

async function canRead(sid: string | undefined, eventId: string, adm: boolean | undefined) {
  if (adm) return true
  return (await hasEventPermission(sid, eventId, 'sae.forms.manage')) || (await hasEventPermission(sid, eventId, 'sae.stakeholders.edit'))
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!(await canRead(session?.sid, eventId, session?.adm))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('form_type, hubspot_form_name, public_page_url')
    .eq('event_id', eventId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; form_type?: string; public_page_url?: string | null } | null
  if (!body?.event_id || !body?.form_type) return NextResponse.json({ error: 'event_id and form_type required' }, { status: 400 })
  if (!FORM_TYPES.includes(body.form_type as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: existing } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('public_page_url')
    .eq('event_id', body.event_id).eq('form_type', body.form_type)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'No HubSpot form connected for this event/form type' }, { status: 404 })

  const newUrl = body.public_page_url?.trim() || null
  const { data, error } = await supabaseAdmin
    .from('event_hubspot_forms')
    .update({ public_page_url: newUrl, updated_at: new Date().toISOString() })
    .eq('event_id', body.event_id).eq('form_type', body.form_type)
    .select('form_type, hubspot_form_name, public_page_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logHubspotPageLinkChange(body.event_id, body.form_type, existing.public_page_url, newUrl, 'manual', session?.sid ?? null)

  return NextResponse.json(data)
}
