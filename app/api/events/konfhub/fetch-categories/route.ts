import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, fetchKonfhubSpeakerCategories, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* GET /api/events/konfhub/fetch-categories?event_id=X

   Read-only — returns every speaker category KonfHub has for this event
   (see fetchKonfhubSpeakerCategories' own doc comment: same GET /speakers
   endpoint listKonfhubSpeakers already calls, just surfacing the
   category_id/category_name groups instead of discarding them). An empty
   array is the normal result for a plain (non-umbrella) KonfHub event —
   this field only matters when several EventPilot events share one
   KonfHub event_id. Saving the chosen id is a separate step via the
   existing generic PATCH /api/events/konfhub/settings route — this route
   only ever fetches. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: website } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_event_id, konfhub_client_id, konfhub_client_secret')
    .eq('event_id', eventId)
    .single()
  if (!website?.konfhub_event_id || !website?.konfhub_client_id || !website?.konfhub_client_secret) {
    return NextResponse.json({ error: 'Set the KonfHub Event ID, Client ID and Client Secret first, then fetch categories.' }, { status: 422 })
  }

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    const categories = await fetchKonfhubSpeakerCategories(website.konfhub_event_id, token)
    return NextResponse.json({ categories })
  } catch (e) {
    const status = e instanceof KonfhubApiError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not fetch speaker categories from KonfHub' }, { status: status >= 400 && status < 600 ? status : 500 })
  }
}
