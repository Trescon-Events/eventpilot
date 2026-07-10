// R2 object storage for Knowledge Base originals — private bucket, same
// aws4fetch S3-compatible signing pattern as app/lib/smartexcel/lib/storage.ts.
// Objects are never made public; downloads always go through a presigned GET
// URL minted on demand by /api/kb/download after an access check.
import { AwsClient } from 'aws4fetch'

const PRESIGN_TTL_SECONDS = 300

function r2Client() {
  const accountId = process.env.KB_R2_ACCOUNT_ID
  const accessKeyId = process.env.KB_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.KB_R2_SECRET_ACCESS_KEY
  const bucket = process.env.KB_R2_BUCKET

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('KB R2 storage is not configured. Set KB_R2_ACCOUNT_ID, KB_R2_ACCESS_KEY_ID, KB_R2_SECRET_ACCESS_KEY, KB_R2_BUCKET.')
  }

  return {
    aws: new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
  }
}

function objectUrl(endpoint: string, key: string): string {
  const path = key.split('/').map(seg => encodeURIComponent(seg)).join('/')
  return `${endpoint}/${path}`
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { aws, endpoint } = r2Client()
  // aws4fetch never sets Content-Length itself — it expects the runtime's fetch
  // to compute it from the body when the signed Request is actually dispatched.
  // That implicit computation doesn't reliably happen for a Uint8Array body on
  // a pre-built Request object re-fetched via a bare fetch() call in this
  // runtime, and R2 rejects the request outright without it (411
  // MissingContentLength) — so set it explicitly. 'content-length' is in
  // aws4fetch's own UNSIGNABLE_HEADERS list, so this can't affect the signature.
  const signed = await aws.sign(objectUrl(endpoint, key), {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: { 'Content-Type': contentType, 'Content-Length': String(body.byteLength) },
  })
  const res = await fetch(signed)
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${await res.text().catch(() => '')}`)
}

export async function presignGet(key: string): Promise<string> {
  const { aws, endpoint } = r2Client()
  const url = new URL(objectUrl(endpoint, key))
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL_SECONDS))
  const signed = await aws.sign(url.toString(), { method: 'GET', aws: { signQuery: true } })
  return signed.url
}

export async function deleteObject(key: string): Promise<void> {
  const { aws, endpoint } = r2Client()
  const signed = await aws.sign(objectUrl(endpoint, key), { method: 'DELETE' })
  await fetch(signed).catch(() => {})
}

/** Prefix used in the `documents.source_url` column to mark "this is an R2 object key, not an external link". */
export const KB_R2_PREFIX = 'r2:'
