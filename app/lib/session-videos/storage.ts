import { AwsClient } from 'aws4fetch'
import { createReadStream, createWriteStream, mkdirSync, statSync, copyFileSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/* Session video storage: a PRIVATE Cloudflare R2 bucket (VIDEO_R2_*), reached through the S3 API with aws4fetch like DocuHub's. Browsers send the original straight to R2 in parts through
   presigned URLs (never through Next.js); the worker on Railway reads the original and writes the proxy and audio copies. The original is only ever READ here (non-negotiable 3).
   For testing the worker on a laptop without R2 keys, VIDEO_STORAGE_LOCAL_DIR switches to plain files in that folder (never set in production). */

const PART_SIZE = 64 * 1024 * 1024      // 64 MiB: a 4 GB file is 64 parts; R2 needs >= 5 MiB per part except the last
export const UPLOAD_PART_SIZE = PART_SIZE

const localDir = () => process.env.VIDEO_STORAGE_LOCAL_DIR || null
export const videoStorageConfigured = (): boolean => !!localDir() || !!(process.env.VIDEO_R2_ACCOUNT_ID && process.env.VIDEO_R2_ACCESS_KEY_ID && process.env.VIDEO_R2_SECRET_ACCESS_KEY && process.env.VIDEO_R2_BUCKET)

function r2() {
  const accountId = process.env.VIDEO_R2_ACCOUNT_ID, accessKeyId = process.env.VIDEO_R2_ACCESS_KEY_ID, secretAccessKey = process.env.VIDEO_R2_SECRET_ACCESS_KEY, bucket = process.env.VIDEO_R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error('Session video storage is not configured. Set VIDEO_R2_ACCOUNT_ID, VIDEO_R2_ACCESS_KEY_ID, VIDEO_R2_SECRET_ACCESS_KEY and VIDEO_R2_BUCKET.')
  return { aws: new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' }), endpoint: `https://${accountId}.r2.cloudflarestorage.com/${bucket}` }
}
const objectUrl = (endpoint: string, key: string) => `${endpoint}/${key.split('/').map(encodeURIComponent).join('/')}`

// ── pure helpers (tested) ────────────────────────────────────────────────────

/** Object keys for one session video. Everything lives under the event and the video id. */
export const keysFor = (eventId: string, videoId: string, fileName: string) => {
  const safe = fileName.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'video.mp4'
  const base = `session-videos/${eventId}/${videoId}`
  return { original: `${base}/original/${safe}`, proxy: `${base}/proxy.mp4`, audio: `${base}/audio.m4a` }
}
/** R2 keys for per-voice clip and frame, produced by the identify job. */
export const clipKeyFor = (eventId: string, videoId: string, voiceId: string) => {
  const safe = voiceId.replace(/\s+/g, '_').toLowerCase()
  const base = `session-videos/${eventId}/${videoId}/clips`
  return { clip: `${base}/${safe}.mp4`, frame: `${base}/${safe}.jpg` }
}
export const uploadIdFromXml = (xml: string): string | null => xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1] ?? null
export const partsFromXml = (xml: string): Array<{ PartNumber: number; ETag: string; Size: number }> =>
  [...xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map(m => ({ PartNumber: Number(m[1].match(/<PartNumber>(\d+)<\/PartNumber>/)?.[1]), ETag: (m[1].match(/<ETag>([^<]+)<\/ETag>/)?.[1] ?? '').replace(/&quot;/g, '"'), Size: Number(m[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0) })).filter(p => p.PartNumber > 0 && p.ETag)
export const completeXml = (parts: Array<{ PartNumber: number; ETag: string }>): string =>
  `<CompleteMultipartUpload>${[...parts].sort((a, b) => a.PartNumber - b.PartNumber).map(p => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag.replace(/"/g, '&quot;')}</ETag></Part>`).join('')}</CompleteMultipartUpload>`

// ── browser upload (R2 only) ─────────────────────────────────────────────────

async function s3(method: string, key: string, query: Record<string, string>, body?: string): Promise<Response> {
  const { aws, endpoint } = r2()
  const url = new URL(objectUrl(endpoint, key)); for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const res = await aws.fetch(url.toString(), { method, ...(body !== undefined ? { body, headers: { 'Content-Type': 'application/xml' } } : {}) })
  return res
}
export async function startMultipart(key: string, contentType: string): Promise<string> {
  const { aws, endpoint } = r2()
  const url = new URL(objectUrl(endpoint, key)); url.searchParams.set('uploads', '')
  const res = await aws.fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': contentType || 'video/mp4' } })
  if (!res.ok) throw new Error(`Could not start the upload (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const id = uploadIdFromXml(await res.text()); if (!id) throw new Error('The storage service did not return an upload id.')
  return id
}
/** A presigned PUT for one part; the browser sends the slice to it directly. The part's ETag comes back in the response header (the bucket's CORS rule must expose it). */
export async function presignPart(key: string, uploadId: string, partNumber: number, ttlSeconds = 3600): Promise<string> {
  const { aws, endpoint } = r2()
  const url = new URL(objectUrl(endpoint, key)); url.searchParams.set('partNumber', String(partNumber)); url.searchParams.set('uploadId', uploadId); url.searchParams.set('X-Amz-Expires', String(ttlSeconds))
  return (await aws.sign(url.toString(), { method: 'PUT', aws: { signQuery: true } })).url
}
export async function listParts(key: string, uploadId: string): Promise<Array<{ PartNumber: number; ETag: string; Size: number }>> {
  const out: Array<{ PartNumber: number; ETag: string; Size: number }> = []; let marker = '0'
  for (let i = 0; i < 20; i++) {
    const res = await s3('GET', key, { uploadId, 'part-number-marker': marker, 'max-parts': '1000' })
    if (!res.ok) throw new Error(`Could not list the uploaded parts (${res.status}).`)
    const xml = await res.text(); const parts = partsFromXml(xml); out.push(...parts)
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml) || !parts.length) break
    marker = String(parts[parts.length - 1].PartNumber)
  }
  return out
}
export async function completeMultipart(key: string, uploadId: string, parts: Array<{ PartNumber: number; ETag: string }>): Promise<void> {
  const res = await s3('POST', key, { uploadId }, completeXml(parts))
  const text = await res.text()
  if (!res.ok || /<Error>/.test(text)) throw new Error(`Could not finish the upload (${res.status}): ${text.slice(0, 200)}`)
}
export async function abortMultipart(key: string, uploadId: string): Promise<void> { await s3('DELETE', key, { uploadId }).catch(() => undefined) }

// ── read / write (worker and playback) ───────────────────────────────────────

export async function presignGet(key: string, ttlSeconds = 3600): Promise<string> {
  if (localDir()) return `file://${join(localDir()!, key)}`
  const { aws, endpoint } = r2()
  const url = new URL(objectUrl(endpoint, key)); url.searchParams.set('X-Amz-Expires', String(ttlSeconds))
  return (await aws.sign(url.toString(), { method: 'GET', aws: { signQuery: true } })).url
}
export async function objectSize(key: string): Promise<number | null> {
  if (localDir()) { try { return statSync(join(localDir()!, key)).size } catch { return null } }
  const { aws, endpoint } = r2()
  const res = await aws.fetch(objectUrl(endpoint, key), { method: 'HEAD' })
  return res.ok ? Number(res.headers.get('content-length') ?? 0) : null
}
/** Streams an object to a file (the worker's scratch disk). The original is never written back. */
export async function downloadToFile(key: string, path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true })
  if (localDir()) { copyFileSync(join(localDir()!, key), path); return }
  const res = await fetch(await presignGet(key, 6 * 3600))
  if (!res.ok || !res.body) throw new Error(`Could not download ${key} (${res.status}).`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(path))
}
/** Uploads a local file as an object, in parts so a large proxy never needs to fit in memory. */
export async function uploadFile(key: string, path: string, contentType: string): Promise<void> {
  if (localDir()) { const dest = join(localDir()!, key); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(path, dest); return }
  const size = statSync(path).size
  if (size <= PART_SIZE) {
    const { aws, endpoint } = r2()
    const chunks: Buffer[] = []; for await (const c of createReadStream(path)) chunks.push(c as Buffer)
    const body = Buffer.concat(chunks)
    const signed = await aws.sign(objectUrl(endpoint, key), { method: 'PUT', body: new Uint8Array(body), headers: { 'Content-Type': contentType, 'Content-Length': String(body.byteLength) } })
    const res = await fetch(signed); if (!res.ok) throw new Error(`Upload of ${key} failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    return
  }
  const uploadId = await startMultipart(key, contentType); const parts: Array<{ PartNumber: number; ETag: string }> = []
  try {
    let n = 1; let buf: Buffer[] = []; let have = 0
    const flush = async () => {
      const body = Buffer.concat(buf); buf = []; have = 0
      const { aws, endpoint } = r2(); const url = new URL(objectUrl(endpoint, key)); url.searchParams.set('partNumber', String(n)); url.searchParams.set('uploadId', uploadId)
      const signed = await aws.sign(url.toString(), { method: 'PUT', body: new Uint8Array(body), headers: { 'Content-Length': String(body.byteLength) } })
      const res = await fetch(signed); if (!res.ok) throw new Error(`Part ${n} of ${key} failed (${res.status}).`)
      parts.push({ PartNumber: n, ETag: res.headers.get('etag') ?? '' }); n++
    }
    for await (const c of createReadStream(path, { highWaterMark: 8 * 1024 * 1024 })) { buf.push(c as Buffer); have += (c as Buffer).length; if (have >= PART_SIZE) await flush() }
    if (have) await flush()
    await completeMultipart(key, uploadId, parts)
  } catch (e) { await abortMultipart(key, uploadId); throw e }
}
export async function deleteObject(key: string): Promise<void> {
  if (localDir()) { rmSync(join(localDir()!, key), { force: true }); return }
  const { aws, endpoint } = r2(); await aws.fetch(objectUrl(endpoint, key), { method: 'DELETE' }).catch(() => undefined)
}
export const localObjectExists = (key: string): boolean => !!localDir() && existsSync(join(localDir()!, key))
