import { supabaseAdmin } from '@/app/lib/supabase'
import { azureConfigured, azureUpload, azureDownload, azureDelete } from '@/app/lib/storage/azure-blob'

/* Storage for Passport / National ID files (Sensitive Documents module).

   Two backends, chosen by DOCUMENT_STORAGE_BACKEND ('supabase' = default, 'azure'):
     supabase — the original private bucket (project region: Singapore).
     azure    — Azure Blob in UAE North (Dubai); see app/lib/storage/azure-blob.ts.
   Same object key on both (event/speaker/type-timestamp.ext), so the database never has to
   change when documents move.

   When the backend is azure:
     - uploads go to Azure ONLY, and FAIL if Azure isn't configured — they never silently
       fall back to Supabase (that would put a passport outside the UAE);
     - reads try Azure first and fall back to the legacy Supabase copy, so a document that
       hasn't been migrated yet still opens (the fallback is harmless once Supabase is empty);
     - deletes remove BOTH copies, so a purge or a manual delete can't leave one behind.
   There is deliberately no "signed URL" helper any more: staff view documents through the
   watermarked viewer and vendors through the authenticated ZIP — nobody is handed a storage link. */

const BUCKET = 'speaker-sensitive-documents'

const azureSelected = () => process.env.DOCUMENT_STORAGE_BACKEND === 'azure'

export async function uploadSensitiveDocument(path: string, body: Buffer, contentType: string): Promise<void> {
  if (azureSelected()) {
    if (!azureConfigured()) throw new Error('Sensitive document upload failed: Azure storage is selected but not configured')
    try { await azureUpload('docs', path, body, contentType) }
    catch (e) { throw new Error(`Sensitive document upload failed: ${e instanceof Error ? e.message : 'Azure error'}`) }
    return
  }
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, body, { contentType, upsert: false })
  if (error) throw new Error(`Sensitive document upload failed: ${error.message}`)
}

async function downloadFromSupabase(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

/** The raw file bytes (server-side only — used by the watermarked viewer and the vendor ZIP). Null if it can't be found anywhere. */
export async function downloadSensitiveDocument(path: string): Promise<Uint8Array | null> {
  if (azureSelected()) {
    if (!azureConfigured()) throw new Error('Azure storage is selected but not configured')
    return (await azureDownload('docs', path)) ?? (await downloadFromSupabase(path))
  }
  return downloadFromSupabase(path)
}

/** Removes the file from every place it might be. Never throws (a failed delete must not block the caller's own bookkeeping). */
export async function deleteSensitiveDocument(path: string): Promise<void> {
  await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {})
  if (azureConfigured()) await azureDelete('docs', path).catch(e => console.error('[sensitive-storage] Azure delete failed:', e instanceof Error ? e.message : e))
}
