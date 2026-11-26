import { NextRequest, NextResponse } from 'next/server'
import { actorOf } from '@/app/lib/content/doc-audit'
import { requireVideos, videoOf, VideoError, generateCuesForVideo } from '@/app/lib/session-videos/service'
import { loadCues, moveCue, deleteCue, addCue, cuesFingerprint } from '@/app/lib/session-videos/cues'
import { supabaseAdmin } from '@/app/lib/supabase'
import { presignGet } from '@/app/lib/session-videos/storage'
import { loadLowerThirdSessions } from '@/app/lib/lower-thirds/data'
import { sessionSpeakers } from '@/app/lib/session-videos/speakers'
import { generateLowerThirdStill, enqueueLowerThirdJob } from '@/app/lib/lower-thirds/service'

/** Cues + lower-third readiness + whether the producer's confirmation still applies. */
async function reviewState(eventId: string, id: string) {
  const v = await videoOf(id, eventId)
  const cues = await loadCues(id)
  const confirmed = cues.length > 0 && (v.cues_confirmed_fingerprint as string | null) === cuesFingerprint(cues)
  let lowerThirds: Array<{ speaker_id: string; status: string; still_url: string | null; ready: boolean }> = []
  let setupMissing: string[] = []
  if (v.agenda_session_id) {
    const lt = await loadLowerThirdSessions(eventId, { sessionIds: [v.agenda_session_id] })
    setupMissing = lt.setup.missing
    // The web app stores a public URL for the still; the worker replaces it with a private R2 key once the animated clip exists — sign that for the browser.
    lowerThirds = await Promise.all((lt.sessions[0]?.speakers ?? []).map(async s => ({
      speaker_id: s.speakerId, status: s.status,
      still_url: s.stillUrl && !/^https?:\/\//.test(s.stillUrl) ? await presignGet(s.stillUrl, 3600).catch(() => null) : s.stillUrl,
      ready: s.status === 'generated' && !!(s.movUrl || s.previewUrl),
    })))
  }
  const candidates = (Array.isArray(v.cue_candidates) ? v.cue_candidates : []) as Array<{ speaker_id: string; start_s: number; run_s: number; seen?: string }>
  const skipped = (Array.isArray(v.cue_skipped) ? v.cue_skipped : []) as string[]
  const speakers = v.agenda_session_id ? (await sessionSpeakers(eventId, v.agenda_session_id)).map(s => ({ id: s.id, name: s.name, moderator: s.moderator })) : []
  return { cues, confirmed, lowerThirds, setupMissing, sessionId: v.agenda_session_id, scanStatus: (v.cue_scan_status as string | null) ?? null, scanError: (v.cue_scan_error as string | null) ?? null, candidates, skipped, speakers }
}

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
    return NextResponse.json(await reviewState(eventId, id))
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
      case 'select': {
        // One lower third per speaker: selecting a moment replaces that speaker's previous one (and un-skips them).
        const spId = typeof b.speaker_id === 'string' && UUID.test(b.speaker_id) ? b.speaker_id : ''
        const startS = typeof b.start_s === 'number' && isFinite(b.start_s) ? b.start_s : -1
        if (!spId || startS < 0) throw new VideoError('speaker_id and start_s required.')
        for (const c of await loadCues(id)) if (c.speaker_id === spId) await deleteCue(id, c.id)
        await addCue(id, spId, startS, by)
        await setSkipped(id, spId, false)
        return NextResponse.json(await reviewState(eventId, id))
      }
      case 'skip': {
        const spId = typeof b.speaker_id === 'string' && UUID.test(b.speaker_id) ? b.speaker_id : ''
        if (!spId) throw new VideoError('speaker_id required.')
        for (const c of await loadCues(id)) if (c.speaker_id === spId) await deleteCue(id, c.id)
        await setSkipped(id, spId, true)
        return NextResponse.json(await reviewState(eventId, id))
      }
      case 'prepare': {
        // Make sure every cued speaker has a lower-third still + animated clip (the render silently skips speakers without one).
        const st = await reviewState(eventId, id)
        if (st.setupMissing.length) throw new VideoError(`Set up the lower-third design first: ${st.setupMissing.join('; ')}`, 409)
        if (!st.sessionId) throw new VideoError('Pick the agenda session first.')
        const byId = new Map(st.lowerThirds.map(l => [l.speaker_id, l]))
        let started = 0
        for (const spId of new Set(st.cues.map(c => c.speaker_id))) {
          const lt = byId.get(spId)
          if (lt?.ready || lt?.status === 'generating') continue
          await generateLowerThirdStill(eventId, st.sessionId, spId, by)
          await enqueueLowerThirdJob(eventId, st.sessionId, spId, by)
          started++
        }
        return NextResponse.json({ started, ...(await reviewState(eventId, id)) })
      }
      case 'confirm': {
        // Only the cues the producer ticked are kept; the rest are removed, then the remaining set is confirmed.
        if (Array.isArray(b.keep_ids)) {
          const keep = new Set((b.keep_ids as unknown[]).filter((x): x is string => typeof x === 'string'))
          if (!keep.size) throw new VideoError('Tick at least one lower third to keep.')
          for (const c of await loadCues(id)) if (!keep.has(c.id)) await deleteCue(id, c.id)
        }
        const st = await reviewState(eventId, id)
        const undecided = st.speakers.filter(sp => !st.cues.some(c => c.speaker_id === sp.id) && !st.skipped.includes(sp.id))
        if (undecided.length) throw new VideoError(`Select a moment (or "no lower third") for: ${undecided.map(s => s.name).join(', ')}.`)
        if (!st.cues.length) throw new VideoError('Select at least one lower third.')
        const byId = new Map(st.lowerThirds.map(l => [l.speaker_id, l]))
        if (st.cues.some(c => !byId.get(c.speaker_id)?.ready)) throw new VideoError('Some lower thirds are still being prepared — try again in a moment.', 409)
        await supabaseAdmin.from('session_videos').update({ cues_confirmed_fingerprint: cuesFingerprint(st.cues), updated_at: new Date().toISOString() }).eq('id', id)
        return NextResponse.json(await reviewState(eventId, id))
      }
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}

async function setSkipped(videoId: string, speakerId: string, on: boolean) {
  const { data } = await supabaseAdmin.from('session_videos').select('cue_skipped').eq('id', videoId).single()
  const cur = new Set((Array.isArray(data?.cue_skipped) ? data!.cue_skipped : []) as string[])
  if (on) cur.add(speakerId); else cur.delete(speakerId)
  await supabaseAdmin.from('session_videos').update({ cue_skipped: [...cur], updated_at: new Date().toISOString() }).eq('id', videoId)
}
