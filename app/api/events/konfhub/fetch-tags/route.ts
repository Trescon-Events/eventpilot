import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, fetchKonfhubTags, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* GET /api/events/konfhub/fetch-tags?event_id=X

   Read-only — returns every tag KonfHub has configured for this event, for
   a human to pick Speaker/Moderator from (see fetchKonfhubTags's own doc
   comment for why this never auto-matches by name). Saving the chosen
   ids is a separate step via the existing generic PATCH /api/events/
   website route — this route only ever fetches. */

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
    return NextResponse.json({ error: 'Set the KonfHub Event ID, Client ID and Client Secret first, then fetch tags.' }, { status: 422 })
  }

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    const tags = await fetchKonfhubTags(website.konfhub_event_id, token)
    return NextResponse.json({ tags })
  } catch (e) {
    const status = e instanceof KonfhubApiError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not fetch tags from KonfHub' }, { status: status >= 400 && status < 600 ? status : 500 })
  }
}
