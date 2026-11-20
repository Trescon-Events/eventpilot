import { supabaseAdmin } from '@/app/lib/supabase'
import { startMultipart, presignPart, completeMultipart, listParts, deleteObject, UPLOAD_PART_SIZE } from './storage'

export type KitField = 'intro' | 'outro' | 'music'
export type VideoKit = { intro_path: string | null; outro_path: string | null; music_path: string | null }

function kitKey(eventId: string, field: KitField, fileName: string): string {
  const safe = fileName.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'file'
  return `video-kit/${eventId}/${field}/${safe}`
}

export async function getKit(eventId: string): Promise<VideoKit> {
  const { data } = await supabaseAdmin.from('event_video_kit').select('intro_path, outro_path, music_path').eq('event_id', eventId).maybeSingle()
  return { intro_path: (data?.intro_path as string | null) ?? null, outro_path: (data?.outro_path as string | null) ?? null, music_path: (data?.music_path as string | null) ?? null }
}

export async function startKitUpload(
  eventId: string, field: KitField, fileName: string, size: number, contentType: string, by: string | null
): Promise<{ upload_id: string; key: string; part_size: number; parts: number }> {
  const key = kitKey(eventId, field, fileName)
  const uploadId = await startMultipart(key, contentType)
  // Store pending key so we can reference it on complete
  await supabaseAdmin.from('event_video_kit').upsert({ event_id: eventId, updated_at: new Date().toISOString(), ...(by ? { updated_by: by } : {}) }, { onConflict: 'event_id', ignoreDuplicates: false })
  return { upload_id: uploadId, key, part_size: UPLOAD_PART_SIZE, parts: Math.ceil(size / UPLOAD_PART_SIZE) }
}

export async function presignKitPart(key: string, uploadId: string, partNumbers: number[]): Promise<Array<{ part: number; url: string }>> {
  return Promise.all(partNumbers.map(async n => ({ part: n, url: await presignPart(key, uploadId, n) })))
}

export async function completeKitUpload(eventId: string, field: KitField, key: string, uploadId: string, by: string | null): Promise<void> {
  const parts = await listParts(key, uploadId)
  if (!parts.length) throw new Error('No parts uploaded yet.')
  await completeMultipart(key, uploadId, parts)
  const col = `${field}_path`
  await supabaseAdmin.from('event_video_kit').upsert({ event_id: eventId, [col]: key, updated_at: new Date().toISOString(), ...(by ? { updated_by: by } : {}) }, { onConflict: 'event_id' })
}

export async function removeKitFile(eventId: string, field: KitField, by: string | null): Promise<void> {
  const kit = await getKit(eventId)
  const col = `${field}_path` as keyof VideoKit
  const existing = kit[col]
  if (existing) await deleteObject(existing)
  await supabaseAdmin.from('event_video_kit').upsert({ event_id: eventId, [`${field}_path`]: null, updated_at: new Date().toISOString(), ...(by ? { updated_by: by } : {}) }, { onConflict: 'event_id' })
}
