import { NextRequest, NextResponse } from 'next/server'
import { actorOf } from '@/app/lib/content/doc-audit'
import { requireVideos } from '@/app/lib/session-videos/service'
import { addToMappedPlaylist, publishState, publishVideo, PublishError, refreshYoutube, sendRound, setExempt, syncYoutube, unschedule, withdrawRound, type Layer } from '@/app/lib/session-videos/publish'

/* Session videos Steps 7 + 8 for one video (see app/lib/session-videos/publish.ts). Permission sae.videos.manage.
   GET  ?event_id                                        upload / approval / publish state
   POST { event_id, action, ... }
        youtube_sync { playlist_id? }                    upload (first time / new final) or update the details on YouTube
        youtube_refresh                                  re-read privacy from YouTube
        send_round { layer, ids[], message?, save_default? }   email reviewers (internal: staff ids; client: contact ids)
        withdraw { layer } | exempt { layer, on }
        publish { publish_at? }                          public now, or scheduled
        unschedule */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: e instanceof PublishError ? e.status : 500 })

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId) || !UUID.test(id)) return NextResponse.json({ error: 'event_id and id required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  try { return NextResponse.json(await publishState(eventId, id)) } catch (e) { return fail(e) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!b || !UUID.test(eventId) || !UUID.test(id) || typeof b.action !== 'string') return NextResponse.json({ error: 'event_id and action required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  const by = actorOf(req) ?? a.session.sid ?? null
  const layer = (b.layer === 'client' ? 'client' : b.layer === 'internal' ? 'internal' : null) as Layer | null
  const needLayer = () => { if (!layer) throw new PublishError('layer required.'); return layer }
  try {
    switch (b.action) {
      case 'youtube_sync': return NextResponse.json(await syncYoutube(eventId, id, typeof b.playlist_id === 'string' || b.playlist_id === null ? (b.playlist_id as string | null) : undefined))
      case 'youtube_refresh': await refreshYoutube(eventId, id); break
      case 'youtube_playlist': await addToMappedPlaylist(eventId, id); break
      case 'send_round': return NextResponse.json(await sendRound(eventId, id, needLayer(), { ids: Array.isArray(b.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [], message: typeof b.message === 'string' ? b.message : null, saveDefault: b.save_default === true }, by))
      case 'withdraw': await withdrawRound(eventId, id, needLayer()); break
      case 'exempt': await setExempt(eventId, id, needLayer(), b.on !== false, by); break
      case 'publish': return NextResponse.json(await publishVideo(eventId, id, { publishAt: typeof b.publish_at === 'string' ? b.publish_at : null }))
      case 'unschedule': await unschedule(eventId, id); break
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) { return fail(e) }
}
