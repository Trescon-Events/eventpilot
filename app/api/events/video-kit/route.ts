import { NextRequest, NextResponse } from 'next/server'
import { actorOf } from '@/app/lib/content/doc-audit'
import { requireVideos, VideoError } from '@/app/lib/session-videos/service'
import { getKit, startKitUpload, presignKitPart, completeKitUpload, removeKitFile, type KitField } from '@/app/lib/session-videos/kit'

/* Video kit per event (intro/outro clip + background music).
   GET  ?event_id=…          → { intro_path, outro_path, music_path }
   POST { event_id, action, field, … }
        start_upload   { field, file_name, size, content_type }
        presign_parts  { field, key, upload_id, part_numbers[] }
        complete_upload{ field, key, upload_id }
        remove         { field } */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FIELDS = new Set<KitField>(['intro', 'outro', 'music'])

function asField(v: unknown): KitField {
  if (typeof v === 'string' && FIELDS.has(v as KitField)) return v as KitField
  throw new VideoError('field must be intro, outro or music.')
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  try {
    return NextResponse.json(await getKit(eventId))
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!b || !UUID.test(eventId) || typeof b.action !== 'string') return NextResponse.json({ error: 'event_id and action required' }, { status: 400 })
  const a = await requireVideos(req, eventId); if ('error' in a) return a.error
  const by = actorOf(req)
  try {
    switch (b.action) {
      case 'start_upload': {
        const field = asField(b.field)
        const name = typeof b.file_name === 'string' ? b.file_name.trim() : ''
        const size = typeof b.size === 'number' ? Math.floor(b.size) : 0
        const ct = typeof b.content_type === 'string' ? b.content_type : 'video/mp4'
        if (!name || size <= 0) throw new VideoError('file_name and size required.')
        return NextResponse.json(await startKitUpload(eventId, field, name, size, ct, by))
      }
      case 'presign_parts': {
        const key = typeof b.key === 'string' ? b.key : ''
        const uid = typeof b.upload_id === 'string' ? b.upload_id : ''
        const parts = Array.isArray(b.part_numbers) ? (b.part_numbers as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1) : []
        if (!key || !uid || !parts.length) throw new VideoError('key, upload_id and part_numbers required.')
        return NextResponse.json({ urls: await presignKitPart(key, uid, parts.slice(0, 8)) })
      }
      case 'complete_upload': {
        const field = asField(b.field)
        const key = typeof b.key === 'string' ? b.key : ''
        const uid = typeof b.upload_id === 'string' ? b.upload_id : ''
        if (!key || !uid) throw new VideoError('key and upload_id required.')
        await completeKitUpload(eventId, field, key, uid, by)
        return NextResponse.json({ ok: true })
      }
      case 'remove': {
        const field = asField(b.field)
        await removeKitFile(eventId, field, by)
        return NextResponse.json({ ok: true })
      }
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}
