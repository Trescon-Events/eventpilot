// Public asset storage for the Stakeholder Announcement Engine — speaker
// photos, partner logos, generated creatives, messaging doc PDFs. Uses a
// public Supabase Storage bucket, matching the pattern already established
// by Website Builder (app/api/events/website/upload-url/route.ts's
// 'event-website-assets' bucket) rather than the private-R2-with-presigned-
// URL pattern used by KB/DocuHub/SmartExcel — SAE's URLs need to stay valid
// indefinitely (Postiz media URLs, approval-email inline images, public
// form display), not expire after a few minutes.
import { supabaseAdmin } from '@/app/lib/supabase'

const BUCKET = 'event-stakeholder-assets'
let bucketReady = false

// 50 MB — this project's actual hard ceiling on Supabase's current storage
// plan tier, confirmed by direct API probing 2026-08-06 (150/100/60MB were
// all rejected with "The object exceeded the maximum allowed size" even on
// a metadata-only updateBucket() call — not something app code can raise;
// requires upgrading the Supabase plan). Requested target for the Corporate
// Brand PDF import was 150MB; 50MB is what's actually achievable today.
// Shared across every uploadPublicAsset() caller, but each endpoint still
// enforces its own tighter per-asset limit before calling this (speaker
// photo 5MB, company logo 3MB, partner logo 10MB, etc.) — this is just the
// outer ceiling, not a new default.
const FILE_SIZE_LIMIT = 52428800

async function ensureBucket() {
  if (bucketReady) return
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: FILE_SIZE_LIMIT,
  })
  // Bucket already existing (from before FILE_SIZE_LIMIT was raised, or any
  // earlier run) is the expected steady-state case, not an error to ignore —
  // it's exactly when an existing bucket needs to be brought up to the
  // current limit via an explicit update call.
  if (error) {
    await supabaseAdmin.storage.updateBucket(BUCKET, { public: true, fileSizeLimit: FILE_SIZE_LIMIT }).catch(() => {})
  }
  bucketReady = true
}

export async function uploadPublicAsset(path: string, body: Buffer, contentType: string): Promise<string> {
  await ensureBucket()
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true })
  if (error) throw new Error(`Asset upload failed: ${error.message}`)

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function deletePublicAsset(path: string): Promise<void> {
  await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {})
}
