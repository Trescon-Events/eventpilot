import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET   /api/events/konfhub/settings?event_id=X
   PATCH /api/events/konfhub/settings?event_id=X

   Dedicated, permission-checked save path for the Integrations page's
   KonfHub card — deliberately NOT reusing the existing generic PATCH
   /api/events/website route, which has no permission check at all (any
   caller who knows a website-record id can rewrite any field, including
   konfhub_client_secret). That route stays as-is for Website Builder's own
   unrelated fields (content/colors/sections); this one only ever touches
   the KonfHub columns and is gated on sae.integrations.manage, matching
   the whole point of this page existing. Upserts on event_id so it works
   whether or not an event_websites row already exists yet. */

const KONFHUB_FIELDS = [
  'konfhub_event_id', 'konfhub_client_id', 'konfhub_client_secret',
  'konfhub_speaker_category_id', 'konfhub_speaker_tag_id', 'konfhub_moderator_tag_id',
  'konfhub_speaker_ticket', 'konfhub_partner_ticket', 'konfhub_registration_field_map',
  'konfhub_api_key',
] as const

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_websites')
    .select(KONFHUB_FIELDS.join(', '))
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? Object.fromEntries(KONFHUB_FIELDS.map(f => [f, null])))
}

export async function PATCH(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const key of KONFHUB_FIELDS) {
    if (key in body) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No recognised KonfHub fields in body' }, { status: 400 })

  // update(), not upsert() — event_websites.slug is NOT NULL with no
  // default, so creating a fresh row here without one would either fail or
  // (worse) need this route to start inventing slugs, which isn't its
  // job. Every event reaching this page will already have a row from
  // Website Builder setup; a missing row means that hasn't happened yet.
  const { data, error } = await supabaseAdmin
    .from('event_websites')
    .update(patch)
    .eq('event_id', eventId)
    .select(KONFHUB_FIELDS.join(', '))
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Set up this event’s website first (Website Builder) before configuring KonfHub.' }, { status: 422 })
  return NextResponse.json(data)
}
