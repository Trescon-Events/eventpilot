import { NextRequest, NextResponse } from 'next/server'
import { actorOf } from '@/app/lib/content/doc-audit'
import { videoStorageConfigured } from '@/app/lib/session-videos/storage'
import { approveText, completeUpload, createVideo, createVideoFromDrive, createVideoFromDriveLink, generateCuesForVideo, listVideos, matchSessions, presignParts, removeVideo, requestRender, requestRenderPreview, requestTextPack, requireVideos, retryVideo, saveText, saveVoices, setSession, sharePreview, unsharePreview, uploadedParts, videoDetail, VideoError } from '@/app/lib/session-videos/service'
import { abortMultipart } from '@/app/lib/session-videos/storage'
import { videoOf } from '@/app/lib/session-videos/service'
import { supabaseAdmin } from '@/app/lib/supabase'
import { existingLinksBySession } from '@/app/lib/session-videos/existing'

/* Session Videos (docs/build_suggestions/session-video-pipeline.md, Phase 1). Permission sae.videos.manage. Nothing here publishes or sends anything.
   GET   ?event_id                  the event's videos, its speaker sessions (for the match dropdown), whether storage is set up
   GET   ?event_id&id               one video: jobs, speakers, transcript with voices, text, approved thumbnail, a playback link for the proxy
   POST  { event_id, action, id?, ... }
         create {file_name, size, content_type}        starts a multipart upload; the browser then sends 64 MB parts straight to storage
         presign_parts {id, part_numbers[]} | list_parts {id} | complete {id} | abort {id}
         set_session {id, session_id} | save_voices {id, voices[]} | make_text {id}
         save_text {id, selected_title?, titles?, description_working?, chapters?, tags?} | approve {id} | retry {id} | remove {id} */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (id) { if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 }); return NextResponse.json(await videoDetail(eventId, id)) }
    return NextResponse.json({ storage_ready: videoStorageConfigured(), videos: await listVideos(eventId), sessions: await matchSessions(eventId), on_youtube: await existingLinksBySession(eventId) })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: e instanceof VideoError ? e.status : 500 }) }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!b || !UUID.test(eventId) || typeof b.action !== 'string') return NextResponse.json({ error: 'event_id and action required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  const by = actorOf(req); const id = typeof b.id === 'string' && UUID.test(b.id) ? b.id : ''
  const need = () => { if (!id) throw new VideoError('id required.') ; return id }
  try {
    switch (b.action) {
      case 'create': return NextResponse.json(await createVideo(eventId, b, by))
      case 'create_from_drive': return NextResponse.json(await createVideoFromDrive(eventId, b, by))
      case 'import_drive_link': return NextResponse.json(await createVideoFromDriveLink(eventId, b, by))
      case 'presign_parts': return NextResponse.json(await presignParts(eventId, need(), b.part_numbers))
      case 'list_parts': return NextResponse.json(await uploadedParts(eventId, need()))
      case 'complete': await completeUpload(eventId, need()); return NextResponse.json({ ok: true })
      case 'abort': {
        const v = await videoOf(need(), eventId)
        if (v.status === 'uploading') { if (v.upload_id && v.original_path) await abortMultipart(v.original_path, v.upload_id); await supabaseAdmin.from('session_videos').delete().eq('id', v.id) }
        return NextResponse.json({ ok: true })
      }
      case 'set_session': await setSession(eventId, need(), b.session_id ?? null); return NextResponse.json({ ok: true })
      case 'save_voices': await saveVoices(eventId, need(), b.voices, by); return NextResponse.json({ ok: true })
      case 'make_text': await requestTextPack(eventId, need()); return NextResponse.json({ ok: true })
      case 'save_text': await saveText(eventId, need(), b); return NextResponse.json({ ok: true })
      case 'approve': await approveText(eventId, need(), by); return NextResponse.json({ ok: true })
      case 'retry': await retryVideo(eventId, need()); return NextResponse.json({ ok: true })
      case 'remove': await removeVideo(eventId, need()); return NextResponse.json({ ok: true })
      case 'generate_cues': await generateCuesForVideo(eventId, need(), by); return NextResponse.json({ ok: true })
      case 'request_render_preview': await requestRenderPreview(eventId, need(), by); return NextResponse.json({ ok: true })
      case 'request_render': await requestRender(eventId, need(), by); return NextResponse.json({ ok: true })
      case 'share_preview': return NextResponse.json(await sharePreview(eventId, need()))
      case 'unshare_preview': await unsharePreview(eventId, need()); return NextResponse.json({ ok: true })
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: e instanceof VideoError ? e.status : 500 }) }
}
