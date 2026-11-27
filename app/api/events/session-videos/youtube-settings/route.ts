import { NextRequest, NextResponse } from 'next/server'
import { actorOf } from '@/app/lib/content/doc-audit'
import { requireVideos } from '@/app/lib/session-videos/service'
import { assignPlaylist, createAndAssign, loadYoutubeSettings, setChannel, type Target } from '@/app/lib/session-videos/playlists'
import { YoutubeError } from '@/app/lib/session-videos/youtube'
import { existingState, linkManual, scanExisting, unlink } from '@/app/lib/session-videos/existing'

/* Session Videos → YouTube tab (lib: app/lib/session-videos/playlists.ts). Permission sae.videos.manage.
   GET  ?event_id                     channel, the channel's playlists, day × stage groups with their sessions, mappings, overrides, fallback
   POST { event_id, action, ... }
        set_channel { connection_id | null }                       (changing it clears this event's playlist choices)
        assign { target, playlist_id | null, playlist_title? }     target = { kind: 'stage', key } | { kind: 'session', sessionId } | { kind: 'event' }
        create { title, target }                                   new public playlist on the channel, assigned to the target
        scan                                                       find sessions the team already uploaded by hand (auto-links confident matches)
        link { session_id, video_id } | unlink { session_id }      fix a match by hand */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: e instanceof YoutubeError ? e.status : 500 })

function target(x: unknown): Target | null {
  const t = x as { kind?: string; key?: string; sessionId?: string } | null
  if (t?.kind === 'event') return { kind: 'event' }
  if (t?.kind === 'stage' && typeof t.key === 'string') return { kind: 'stage', key: t.key }
  if (t?.kind === 'session' && typeof t.sessionId === 'string') return { kind: 'session', sessionId: t.sessionId }
  return null
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  try { const [s, existing] = await Promise.all([loadYoutubeSettings(eventId), existingState(eventId)]); return NextResponse.json({ ...s, existing }) } catch (e) { return fail(e) }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!b || !UUID.test(eventId) || typeof b.action !== 'string') return NextResponse.json({ error: 'event_id and action required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  const by = actorOf(req)
  try {
    if (b.action === 'scan') return NextResponse.json(await scanExisting(eventId, by))
    if (b.action === 'link' || b.action === 'unlink') {
      const sid = typeof b.session_id === 'string' ? b.session_id : ''
      if (b.action === 'unlink') await unlink(eventId, sid)
      else await linkManual(eventId, sid, typeof b.video_id === 'string' ? b.video_id : '', by)
      return NextResponse.json({ ok: true })
    }
    if (b.action === 'set_channel') { await setChannel(eventId, typeof b.connection_id === 'string' && UUID.test(b.connection_id) ? b.connection_id : null, by); return NextResponse.json({ ok: true }) }
    const t = target(b.target)
    if (!t) return NextResponse.json({ error: 'target required' }, { status: 400 })
    if (b.action === 'assign') {
      const pid = typeof b.playlist_id === 'string' && b.playlist_id ? b.playlist_id : null
      await assignPlaylist(eventId, t, pid ? { id: pid, title: typeof b.playlist_title === 'string' ? b.playlist_title : null } : null, by)
      return NextResponse.json({ ok: true })
    }
    if (b.action === 'create') return NextResponse.json({ playlist: await createAndAssign(eventId, typeof b.title === 'string' ? b.title : '', t, by) })
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) { return fail(e) }
}
