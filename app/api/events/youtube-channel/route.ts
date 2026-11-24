import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET /api/events/youtube-channel?event_id=X — the event's chosen channel + the connected channels it can choose from.
   PUT /api/events/youtube-channel?event_id=X { connection_id | null, default_privacy } — choose / clear. */

async function allowed(req: NextRequest, eventId: string) {
  const session = getSession(req)
  if (!session) return null
  if (session.adm || (await hasEventPermission(session.sid, eventId, 'sae.integrations.manage'))) return session
  return null
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await allowed(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const [{ data: sel }, { data: conns }] = await Promise.all([
    supabaseAdmin.from('event_youtube_channel').select('connection_id, default_privacy').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('youtube_connections').select('id, channel_title, channel_handle, channel_thumbnail_url, google_email, status').order('channel_title'),
  ])
  return NextResponse.json({ connectionId: sel?.connection_id ?? null, defaultPrivacy: sel?.default_privacy ?? 'private', connections: conns ?? [] })
}

export async function PUT(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const session = await allowed(req, eventId)
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const body = await req.json().catch(() => null) as { connection_id?: string | null; default_privacy?: string } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })
  if (!body.connection_id) {
    await supabaseAdmin.from('event_youtube_channel').delete().eq('event_id', eventId)
    return NextResponse.json({ connectionId: null })
  }
  const privacy = ['private', 'unlisted', 'public'].includes(body.default_privacy ?? '') ? body.default_privacy! : 'private'
  const { error } = await supabaseAdmin.from('event_youtube_channel').upsert({
    event_id: eventId, connection_id: body.connection_id, default_privacy: privacy, updated_by: session.sid, updated_at: new Date().toISOString(),
  }, { onConflict: 'event_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connectionId: body.connection_id, defaultPrivacy: privacy })
}
