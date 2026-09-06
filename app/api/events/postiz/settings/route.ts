import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET   /api/events/postiz/settings?event_id=X
   PATCH /api/events/postiz/settings?event_id=X

   Dedicated, permission-checked save path for the Integrations page's
   Postiz card — same reasoning as /api/events/konfhub/settings: the
   existing generic PATCH /api/events?id= route has no permission check at
   all, so a new gated settings page needs its own gated save path rather
   than inherit that gap. postiz_profile_key (the Postiz "group"/Customer
   id) is fetch-and-select ONLY from this page — never a free-typed value —
   enforced by the UI, not this route (the route just persists whatever it's
   given, matching every other settings-save route's contract). */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('postiz_profile_key, postiz_default_channel_ids')
    .eq('id', eventId)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { postiz_profile_key?: string | null; postiz_default_channel_ids?: string[] } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if ('postiz_profile_key' in body) patch.postiz_profile_key = body.postiz_profile_key
  if ('postiz_default_channel_ids' in body) patch.postiz_default_channel_ids = body.postiz_default_channel_ids
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No recognised Postiz fields in body' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('events')
    .update(patch)
    .eq('id', eventId)
    .select('postiz_profile_key, postiz_default_channel_ids')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
