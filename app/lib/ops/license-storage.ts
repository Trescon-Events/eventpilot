import { supabaseAdmin } from '@/app/lib/supabase'
import { azureConfigured, azureUpload, azureDownload, azureDelete } from '@/app/lib/storage/azure-blob'

/* Licence copies uploaded by vendors or ops. Same two-backend rule as
   app/lib/events/sensitive-storage.ts (DOCUMENT_STORAGE_BACKEND = 'supabase' default | 'azure'):
   azure uploads never fall back to Supabase, reads fall back to the legacy copy, deletes remove
   both. Nobody is handed a storage link — ops open a licence through an authenticated, audited
   route that streams the bytes. */

const BUCKET = 'ops-license-files'
const azureSelected = () => process.env.DOCUMENT_STORAGE_BACKEND === 'azure'

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
  if (azureSelected()) {
    if (!azureConfigured()) throw new Error('Licence upload failed: Azure storage is selected but not configured')
    try { await azureUpload('license', path, body, contentType) }
    catch (e) { throw new Error(`Licence upload failed: ${e instanceof Error ? e.message : 'Azure error'}`) }
    return
  }
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, body, { contentType, upsert: false })
  if (error) throw new Error(`Licence upload failed: ${error.message}`)
}

async function downloadFromSupabase(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

/** The licence file's bytes, or null if it can't be found. */
export async function downloadLicenseFile(path: string): Promise<Uint8Array | null> {
  if (azureSelected()) {
    if (!azureConfigured()) throw new Error('Azure storage is selected but not configured')
    return (await azureDownload('license', path)) ?? (await downloadFromSupabase(path))
  }
  return downloadFromSupabase(path)
}

export async function removeLicenseFile(path: string): Promise<void> {
  await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {})
  if (azureConfigured()) await azureDelete('license', path).catch(e => console.error('[license-storage] Azure delete failed:', e instanceof Error ? e.message : e))
}
