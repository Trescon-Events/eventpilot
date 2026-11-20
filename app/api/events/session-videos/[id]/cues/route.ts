import { NextRequest, NextResponse } from 'next/server'
import { actorOf } from '@/app/lib/content/doc-audit'
import { requireVideos, videoOf, VideoError, generateCuesForVideo } from '@/app/lib/session-videos/service'
import { loadCues, moveCue, deleteCue, addCue } from '@/app/lib/session-videos/cues'

/* Cue CRUD for one session video.
   GET  ?event_id=…          → { cues: Cue[], speakers: {id,name}[] }
   POST { event_id, action, … }
        generate               → auto-generate from transcript
        move    { cue_id, delta_s }
        delete  { cue_id }
        add     { speaker_id, start_s } */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId) || !UUID.test(id)) return NextResponse.json({ error: 'event_id and id required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  try {
    await videoOf(id, eventId)
    const cues = await loadCues(id)
    return NextResponse.json({ cues })
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!b || !UUID.test(eventId) || !UUID.test(id) || typeof b.action !== 'string') return NextResponse.json({ error: 'event_id and action required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  const by = actorOf(req)
  try {
    switch (b.action) {
      case 'generate':
        await generateCuesForVideo(eventId, id, by)
        return NextResponse.json({ cues: await loadCues(id) })
      case 'move': {
        const cueId = typeof b.cue_id === 'string' && UUID.test(b.cue_id) ? b.cue_id : ''
        const delta = typeof b.delta_s === 'number' && isFinite(b.delta_s) ? b.delta_s : 0
        if (!cueId) throw new VideoError('cue_id required.')
        await moveCue(id, cueId, delta, by)
        return NextResponse.json({ cues: await loadCues(id) })
      }
      case 'delete': {
        const cueId = typeof b.cue_id === 'string' && UUID.test(b.cue_id) ? b.cue_id : ''
        if (!cueId) throw new VideoError('cue_id required.')
        await deleteCue(id, cueId)
        return NextResponse.json({ cues: await loadCues(id) })
      }
      case 'add': {
        const spId = typeof b.speaker_id === 'string' && UUID.test(b.speaker_id) ? b.speaker_id : ''
        const startS = typeof b.start_s === 'number' && isFinite(b.start_s) ? b.start_s : -1
        if (!spId || startS < 0) throw new VideoError('speaker_id and start_s required.')
        await addCue(id, spId, startS, by)
        return NextResponse.json({ cues: await loadCues(id) })
      }
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}
