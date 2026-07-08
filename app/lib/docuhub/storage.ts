// R2 object storage for DocuHub — a dedicated, private bucket separate from
// the Knowledge Base's (app/lib/kb/storage.ts), per the decision to keep
// DocuHub's storage and lifecycle fully decoupled from KB. Same aws4fetch
// S3-compatible signing pattern as the rest of this app's R2 clients.
import { AwsClient } from 'aws4fetch'

const PRESIGN_TTL_SECONDS = 300

function r2Client() {
  const accountId = process.env.DOCUHUB_R2_ACCOUNT_ID
  const accessKeyId = process.env.DOCUHUB_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.DOCUHUB_R2_SECRET_ACCESS_KEY
  const bucket = process.env.DOCUHUB_R2_BUCKET

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('DocuHub R2 storage is not configured. Set DOCUHUB_R2_ACCOUNT_ID, DOCUHUB_R2_ACCESS_KEY_ID, DOCUHUB_R2_SECRET_ACCESS_KEY, DOCUHUB_R2_BUCKET.')
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
  const signed = await aws.sign(objectUrl(endpoint, key), { method: 'PUT', body: new Uint8Array(body), headers: { 'Content-Type': contentType } })
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
