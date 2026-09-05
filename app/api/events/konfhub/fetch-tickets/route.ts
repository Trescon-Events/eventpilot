import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, fetchKonfhubTickets, stripHtml, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* GET /api/events/konfhub/fetch-tickets?event_id=X

   Read-only — every ticket type KonfHub has configured for this event
   (grouped into KonfHub's own categories), each with its custom-form field
   list, HTML stripped for display. Used both to let a human pick which
   ticket is "Speaker Registration" and to populate the field-mapping table
   once one is picked. Saving is a separate step. */

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
    return NextResponse.json({ error: 'Set the KonfHub Event ID, Client ID and Client Secret first, then fetch tickets.' }, { status: 422 })
  }

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    const categories = await fetchKonfhubTickets(website.konfhub_event_id, token)
    const cleaned = categories.map(cat => ({
      ...cat,
      tickets: cat.tickets.map(t => ({ ...t, forms: t.forms.map(f => ({ ...f, form_name: stripHtml(f.form_name) })) })),
    }))
    return NextResponse.json({ categories: cleaned })
  } catch (e) {
    const status = e instanceof KonfhubApiError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not fetch tickets from KonfHub' }, { status: status >= 400 && status < 600 ? status : 500 })
  }
}
