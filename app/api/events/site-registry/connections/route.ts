import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET  /api/events/site-registry/connections?event_id=X
   POST /api/events/site-registry/connections?event_id=X
   Body (POST): { provider: 'ga4' | 'search_console', account_ref?, property_ref, stream_ref? }

   Commissioning Orchestrator's fetch-and-select finalize step: saves
   which already-fetched GA4 property or Search Console site applies to
   this event's site. Never accepts a free-typed value the UI didn't get
   from an actual /api/connect/google-org/{ga4-accounts,search-console-sites}
   fetch — this route just persists whatever it's given, same contract as
   every other settings-save route in this app; enforcing "came from a
   real fetch" is the UI's job, not this route's.

   v1.4: no connectionId anymore — one shared service account handles
   every site's GA4/Search Console access (google_connection_id column
   stays in the schema but is no longer written; harmless leftover from
   the v1.3 multi-account model this replaces). */

const PROVIDERS = ['ga4', 'search_console'] as const

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: site } = await supabaseAdmin.from('event_sites').select('id').eq('event_id', eventId).maybeSingle()
  if (!site) return NextResponse.json({ connections: [] })

  const { data, error } = await supabaseAdmin
    .from('site_connections')
    .select('provider, account_ref, property_ref, stream_ref, status, last_verified_at, last_error, google_connection_id')
    .eq('site_id', site.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connections: data ?? [] })
}

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { provider?: string; account_ref?: string; property_ref?: string; stream_ref?: string } | null
  if (!body?.provider || !PROVIDERS.includes(body.provider as typeof PROVIDERS[number])) {
    return NextResponse.json({ error: 'provider must be ga4 or search_console' }, { status: 400 })
  }
  if (!body.property_ref) return NextResponse.json({ error: 'property_ref required' }, { status: 400 })

  const { data: site } = await supabaseAdmin.from('event_sites').select('id').eq('event_id', eventId).maybeSingle()
  if (!site) return NextResponse.json({ error: 'Register the site first.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('site_connections')
    .upsert({
      site_id: site.id,
      provider: body.provider,
      account_ref: body.account_ref ?? null,
      property_ref: body.property_ref,
      stream_ref: body.stream_ref ?? null,
      status: 'connected_unverified',
      last_error: null,
    }, { onConflict: 'site_id,provider' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connection: data })
}
