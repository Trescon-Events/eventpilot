import { supabaseAdmin } from '@/app/lib/supabase'
import { completeMultipart, listParts, presignPart, startMultipart, keysFor, UPLOAD_PART_SIZE } from '@/app/lib/session-videos/storage'
import { enqueueJob, logJob, type Job } from '@/app/lib/session-videos/jobs'

/* Drive import job: streams the chosen Google Drive file into R2 in 64 MB range chunks, then hands off to the ingest job.
   The access token is stored temporarily in drive_access_token and cleared once the import finishes.
   Google OAuth access tokens expire in ~1 hour; files larger than ~4 GB should be expected to complete within that window. */

const CHUNK = UPLOAD_PART_SIZE   // 64 MiB — matches R2 multipart and browser upload part size

export async function runDriveImport(job: Job): Promise<void> {
  const { data: v, error: ve } = await supabaseAdmin.from('session_videos')
    .select('id, event_id, source_ref, drive_file_id, drive_access_token, size_bytes, content_type, original_path, upload_id')
    .eq('id', job.session_video_id).single()
  if (ve || !v) throw new Error(`Video record not found: ${ve?.message ?? 'no data'}`)

  const fileId = v.drive_file_id as string | null
  const token = v.drive_access_token as string | null
  if (!fileId || !token) throw new Error('drive_file_id or drive_access_token missing from the video record.')

  const sizeBytes = v.size_bytes as number
  const contentType = (v.content_type as string | null) ?? 'video/mp4'
  let originalPath = v.original_path as string | null
  let uploadId = v.upload_id as string | null

  // If the record was somehow left without a multipart in progress, restart it
  if (!originalPath || !uploadId) {
    const name = (v.source_ref as string | null) ?? 'video.mp4'
    originalPath = keysFor(v.event_id as string, job.session_video_id, name).original
    uploadId = await startMultipart(originalPath, contentType)
    await supabaseAdmin.from('session_videos').update({ original_path: originalPath, upload_id: uploadId }).eq('id', job.session_video_id)
  }

  // Resume: find which parts are already in R2
  const existing = await listParts(originalPath, uploadId)
  const done = new Map(existing.map(p => [p.PartNumber, p.ETag]))
  const totalParts = Math.ceil(sizeBytes / CHUNK)

  await logJob(job.id, `Importing ${totalParts} part(s) from Google Drive (${done.size} already done)`)

  const allParts: Array<{ PartNumber: number; ETag: string }> = [...existing.map(p => ({ PartNumber: p.PartNumber, ETag: p.ETag }))]

  for (let n = 1; n <= totalParts; n++) {
    if (done.has(n)) continue

    const start = (n - 1) * CHUNK
    const end = Math.min(sizeBytes - 1, n * CHUNK - 1)

    const driveUrl = token
      ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY}`
    const driveHeaders: Record<string, string> = { Range: `bytes=${start}-${end}` }
    if (token) driveHeaders['Authorization'] = `Bearer ${token}`
    const driveRes = await fetch(driveUrl, { headers: driveHeaders })
    if (!driveRes.ok) {
      const body = await driveRes.text().catch(() => '')
      throw new Error(`Drive API returned ${driveRes.status} for bytes ${start}-${end}: ${body.slice(0, 200)}`)
    }
    const chunk = await driveRes.arrayBuffer()

    const url = await presignPart(originalPath, uploadId, n)
    const r2Res = await fetch(url, { method: 'PUT', body: chunk })
    if (!r2Res.ok) throw new Error(`R2 upload failed for part ${n}/${totalParts} (${r2Res.status}).`)

    const etag = r2Res.headers.get('etag') ?? ''
    allParts.push({ PartNumber: n, ETag: etag })

    const transferred = Math.min(sizeBytes, n * CHUNK)
    await supabaseAdmin.from('session_videos').update({ bytes_transferred: transferred }).eq('id', job.session_video_id)
    await logJob(job.id, `Part ${n}/${totalParts} done (${Math.round(transferred / sizeBytes * 100)}%)`)
  }

  await completeMultipart(originalPath, uploadId, allParts)

  await supabaseAdmin.from('session_videos').update({
    status: 'uploaded', upload_id: null, drive_access_token: null, bytes_transferred: sizeBytes, error: null, updated_at: new Date().toISOString(),
  }).eq('id', job.session_video_id)

  await enqueueJob(job.session_video_id, 'ingest')
}
