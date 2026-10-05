import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET /api/events/hubspot/link?event_id=X — the currently linked HubSpot Event
   (database read only, no call to HubSpot) so the Integrations page can show the
   link status instantly. Choosing/changing it is /api/events/hubspot/events. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  const { data } = await supabaseAdmin.from('events').select('hubspot_event_id, hubspot_event_name').eq('id', eventId).maybeSingle()
  return NextResponse.json({ linked: data?.hubspot_event_id ? { id: data.hubspot_event_id, name: data.hubspot_event_name } : null })
}
