// Public asset storage for the Stakeholder Announcement Engine — speaker
// photos, partner logos, generated creatives, messaging doc PDFs. Uses a
// public Supabase Storage bucket, matching the pattern already established
// by Website Builder (app/api/events/website/upload-url/route.ts's
// 'event-website-assets' bucket) rather than the private-R2-with-presigned-
// URL pattern used by KB/DocuHub/SmartExcel — SAE's URLs need to stay valid
// indefinitely (Ayrshare mediaUrls, approval-email inline images, public
// form display), not expire after a few minutes.
import { supabaseAdmin } from '@/app/lib/supabase'

const BUCKET = 'event-stakeholder-assets'
let bucketReady = false

async function ensureBucket() {
  if (bucketReady) return
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 20971520, // 20 MB — covers photos/logos/PDFs with headroom
  })
  if (error && error.message !== 'The resource already exists') {
    await supabaseAdmin.storage.updateBucket(BUCKET, { public: true, fileSizeLimit: 20971520 }).catch(() => {})
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
