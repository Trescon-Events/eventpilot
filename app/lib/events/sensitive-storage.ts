import { supabaseAdmin } from '@/app/lib/supabase'

/* Private-bucket counterpart to app/lib/events/storage.ts's
   uploadPublicAsset() — used only by the Sensitive Documents module
   (Passport/National ID). Bucket is provisioned by
   supabase/sensitive_documents_migration.sql (public: false), not
   lazily created here, since a bucket that's briefly public before its
   first updateBucket() call is exactly the failure mode this module
   exists to avoid. Every read goes through a short-lived signed URL. */

const BUCKET = 'speaker-sensitive-documents'
const SIGNED_URL_TTL_SECONDS = 3600

export async function uploadSensitiveDocument(path: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, body, { contentType, upsert: false })
  if (error) throw new Error(`Sensitive document upload failed: ${error.message}`)
}

export async function getSensitiveDocumentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}

export async function deleteSensitiveDocument(path: string): Promise<void> {
  await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {})
}

/* Server-side read of the raw file bytes (Phase 3 vendor batch download,
   streamed through an authenticated route — the vendor never receives a
   storage URL). Returns null if the object is gone (e.g. purged). */
export async function downloadSensitiveDocument(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}
