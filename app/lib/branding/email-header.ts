import { supabaseAdmin } from '@/app/lib/supabase'

/* Named "template" slots from admin/branding/corporate → Templates tab —
   each a single row in corporate_brand_assets (category='template',
   subcategory=<slot key>), enforced unique per slot by
   idx_corporate_brand_assets_template_slot so there's always exactly one
   current asset per slot or none. getTemplateAssetUrl() is the shared
   lookup; the named wrappers below are what callers actually use. */
async function getTemplateAssetUrl(slot: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('corporate_brand_assets')
    .select('file_url')
    .eq('category', 'template')
    .eq('subcategory', slot)
    .maybeSingle()

  return data?.file_url ?? null
}

/* 'email_header' slot — consumed by every outgoing email actually sent TO
   an event stakeholder (speaker/sponsor/partner/external approver), and by
   the public stakeholder-form page as its header image. Not the internal
   staff-facing emails in app/lib/email.ts, which already have their own
   "Event Pilot" product-branded header — except the SAE-scoped internal
   notifications (marketing-manager submission alert, announcement-creator
   approval alert), which use it too per Madhu's explicit instruction
   (2026-08-07) that this corporate header should appear on SAE's internal
   emails as well, not just the external-facing ones.

   Returns an <img> tag ready to prepend to an email's HTML body, or an
   empty string if no header has been uploaded yet — callers just prepend
   the result, no conditional needed on their end. */
export async function getStakeholderEmailHeaderHtml(altText = 'Trescon'): Promise<string> {
  const url = await getTemplateAssetUrl('email_header')
  if (!url) return ''
  return `<img src="${url}" alt="${altText}" width="520" style="width:100%;max-width:520px;display:block;border:0;margin:0 0 20px;" />`
}

/* Same 'email_header' slot as a bare URL, for callers that need to render
   it themselves rather than getting ready-made email HTML (e.g. the public
   stakeholder-form page). */
export async function getStakeholderHeaderUrl(): Promise<string | null> {
  return getTemplateAssetUrl('email_header')
}

/* 'favicon' slot — the corporate default favicon for any public-facing
   page (event microsites, landing pages) that doesn't define its own.
   Not used for the EventPilot admin app itself (app/layout.tsx keeps its
   own static product favicon). */
export async function getDefaultFaviconUrl(): Promise<string | null> {
  return getTemplateAssetUrl('favicon')
}

/* 'social_share_image' slot — the corporate default OG/Twitter link-preview
   image for public-facing pages and shared document links (e.g. post-event
   reports) that don't define their own. */
export async function getDefaultSocialShareImageUrl(): Promise<string | null> {
  return getTemplateAssetUrl('social_share_image')
}
