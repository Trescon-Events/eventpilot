import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { createPlaylist, listPlaylists, tokenFor } from '@/app/lib/session-videos/youtube'
import { setChannel } from '@/app/lib/session-videos/playlists'

/* GET  /api/events/youtube-channel?event_id=X — the event's chosen channel + the connected channels it can choose from + that channel's playlists.
   PUT  /api/events/youtube-channel?event_id=X { connection_id | null } — choose / clear (changing it clears the event's playlist choices).
   Playlists are mapped per day/stage in Session Videos → YouTube.
   POST /api/events/youtube-channel?event_id=X { title } — create a playlist on the chosen channel (public) and make it the default.
   Session videos always upload UNLISTED for review and go public at the Publish step, so there is no per-event "visibility" any more. */

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
    supabaseAdmin.from('event_youtube_channel').select('connection_id, default_privacy, default_playlist_id, default_playlist_title').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('youtube_connections').select('id, channel_title, channel_handle, channel_thumbnail_url, google_email, status').order('channel_title'),
  ])
  let playlists: Array<{ id: string; title: string; count: number; privacy: string }> | null = null, playlistsError: string | null = null
  if (sel?.connection_id) {
    try { playlists = await listPlaylists(await tokenFor(sel.connection_id as string)) } catch (e) { playlistsError = e instanceof Error ? e.message : 'Could not read the channel’s playlists.' }
  }
  return NextResponse.json({ connectionId: sel?.connection_id ?? null, defaultPrivacy: sel?.default_privacy ?? 'private', connections: conns ?? [],
    defaultPlaylistId: sel?.default_playlist_id ?? null, defaultPlaylistTitle: sel?.default_playlist_title ?? null, playlists, playlistsError })
}

export async function PUT(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const session = await allowed(req, eventId)
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const body = await req.json().catch(() => null) as { connection_id?: string | null } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })
  try { await setChannel(eventId, body.connection_id || null, session.sid ?? null) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save.' }, { status: 500 }) }
  return NextResponse.json({ connectionId: body.connection_id || null })
}

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const session = await allowed(req, eventId)
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const body = await req.json().catch(() => null) as { title?: string } | null
  const title = (body?.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Give the playlist a name.' }, { status: 400 })
  const { data: sel } = await supabaseAdmin.from('event_youtube_channel').select('connection_id').eq('event_id', eventId).maybeSingle()
  if (!sel?.connection_id) return NextResponse.json({ error: 'Choose and save the channel first.' }, { status: 409 })
  try {
    const p = await createPlaylist(await tokenFor(sel.connection_id as string), title, 'public')
    await supabaseAdmin.from('event_youtube_channel').update({ default_playlist_id: p.id, default_playlist_title: p.title, updated_by: session.sid, updated_at: new Date().toISOString() }).eq('event_id', eventId)
    return NextResponse.json({ playlist: p })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not create the playlist.' }, { status: 502 }) }
}
