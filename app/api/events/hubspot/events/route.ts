import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { listHubSpotEvents, getHubSpotEvent } from '@/app/lib/hubspot/crm-client'

/* GET /api/events/hubspot/events?event_id=X[&q=text]
     The event's currently linked HubSpot Event + a read-only list/search of
     HubSpot Events to pick from (newest first).
   PUT /api/events/hubspot/events?event_id=X   Body: { hubspot_event_id: string | null }
     Link (or unlink with null) the HubSpot Event the CRM sync associates this
     event's contacts/companies with. The id is verified to exist in HubSpot first.

   EventPilot is READ-ONLY toward HubSpot Events: nothing here (or in the sync)
   ever creates, edits or deletes one — the sync uses only the Event selected here.
   Gated on sae.integrations.manage like the rest of the Integrations tab. */

async function authorize(req: NextRequest, eventId: string) {
  const session = getSession(req)
  return !!session?.adm || await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage')
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await authorize(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: ev } = await supabaseAdmin.from('events').select('hubspot_event_id, hubspot_event_name').eq('id', eventId).maybeSingle()
  const linked = ev?.hubspot_event_id ? { id: ev.hubspot_event_id, name: ev.hubspot_event_name } : null
  try {
    const events = await listHubSpotEvents(req.nextUrl.searchParams.get('q') ?? undefined)
    return NextResponse.json({ linked, events })
  } catch (e) {
    return NextResponse.json({ linked, events: [], error: e instanceof Error ? e.message : 'Could not reach HubSpot' }, { status: 502 })
  }
}

export async function PUT(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await authorize(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { hubspot_event_id?: string | null } | null
  if (!body || !('hubspot_event_id' in body)) return NextResponse.json({ error: 'hubspot_event_id required (or null to unlink)' }, { status: 400 })

  if (body.hubspot_event_id === null || body.hubspot_event_id === '') {
    await supabaseAdmin.from('events').update({ hubspot_event_id: null, hubspot_event_name: null }).eq('id', eventId)
    return NextResponse.json({ linked: null })
  }

  let found
  try { found = await getHubSpotEvent(String(body.hubspot_event_id)) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not reach HubSpot' }, { status: 502 }) }
  if (!found) return NextResponse.json({ error: 'That HubSpot event doesn’t exist (or was deleted).' }, { status: 404 })

  const { error } = await supabaseAdmin.from('events').update({ hubspot_event_id: found.id, hubspot_event_name: found.name }).eq('id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ linked: { id: found.id, name: found.name } })
}
