import { supabaseAdmin } from '@/app/lib/supabase'

/* Private bucket for licence copies (supabase/ops_vendor_portal_migration.sql,
   public: false). Reads are always server-mediated: staff get a short-lived
   signed URL after a permission check + audit row; vendors never read these. */

const BUCKET = 'ops-license-files'

export const LICENSE_ALLOWED: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
export const LICENSE_MAX_BYTES = 20 * 1024 * 1024

/** Verifies the file's real type from its first bytes — the browser-declared type is not trusted. */
export function sniffLicenseType(bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  return null
}

export async function uploadLicenseFile(path: string, body: Uint8Array, contentType: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, body, { contentType, upsert: false })
  if (error) throw new Error(`Licence upload failed: ${error.message}`)
}

export async function licenseSignedUrl(path: string, ttlSeconds = 300): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  return error ? null : data.signedUrl
}

export async function removeLicenseFile(path: string): Promise<void> {
  await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {})
}
