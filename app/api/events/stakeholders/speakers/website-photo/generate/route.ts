import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { compositeAnnouncement, type CreativeTemplateConfig, type ResolvedAssets } from '@/app/lib/announcements/composite'
import { applyWebsitePhotoLighting, WebsitePhotoEditError } from '@/app/lib/media/website-photo-engine'

/* POST /api/events/stakeholders/speakers/website-photo/generate
   Body: { event_id, speaker_id }

   Speaker-only (no partner/sponsor equivalent — see the plan discussion).
   Two-step pipeline: one PhotoRoom editWithAI call (relight + reframe the
   stored photo_processed_url cutout, per website-photo-engine.ts) then one
   local compositeAnnouncement() call (drop the result onto the variant's
   background layer — the same engine SAE's own creatives use, just a
   different, speaker-detail-page-scoped caller). Writes the result to
   event_speakers.website_card_url — a column that's existed unused since
   the original SAE migration ("generated speaker card — future use"),
   reused here rather than adding a new one. No stakeholder_announcements
   row: this isn't a social creative with its own publish/schedule
   lifecycle, just the speaker's current website photo, one per speaker. */

type GenerateBody = { event_id?: string; speaker_id?: string }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as GenerateBody | null
  if (!body?.event_id || !body?.speaker_id) {
    return NextResponse.json({ error: 'event_id, speaker_id required' }, { status: 400 })
  }

  const session = getSession(req)
  const canGenerate = session?.adm || await hasEventPermission(session?.sid, body.event_id, 'sae.announcements.generate')
  if (!canGenerate) {
    return NextResponse.json({ error: 'You do not have permission to generate website photos for this event' }, { status: 403 })
  }

  const [eventRes, speakerRes] = await Promise.all([
    supabaseAdmin.from('events').select('creative_template_config').eq('id', body.event_id).single(),
    supabaseAdmin.from('event_speakers').select('id, photo_processed_url, photo_url').eq('id', body.speaker_id).single(),
  ])

  const event = eventRes.data
  if (eventRes.error || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const speaker = speakerRes.data
  if (speakerRes.error || !speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const cleanPhotoUrl = speaker.photo_processed_url ?? speaker.photo_url
  if (!cleanPhotoUrl) {
    return NextResponse.json({ error: 'This speaker has no cleaned photo yet — upload one on the Overview tab first' }, { status: 422 })
  }

  const templateConfig = event.creative_template_config as CreativeTemplateConfig | null
  const variant = templateConfig?.speaker?.variants.find(v => v.category === 'website_photo')
  if (!variant) {
    return NextResponse.json({ error: "No Website Photo template configured for this event yet — set one up in Admin Console → Variants" }, { status: 422 })
  }

  const prompt = templateConfig?.ai_edit_prompts?.find(p => p.module_key === 'speaker_website_photo')?.prompt
  if (!prompt) {
    return NextResponse.json({ error: 'No lighting prompt configured yet — set one in Admin Console → AI Edit Prompts' }, { status: 422 })
  }

  const cutoutBuffer = await fetchAssetBuffer(cleanPhotoUrl)
  if (!cutoutBuffer) {
    return NextResponse.json({ error: "Could not fetch this speaker's cleaned photo" }, { status: 502 })
  }

  let litBuffer: Buffer
  try {
    litBuffer = await applyWebsitePhotoLighting(cutoutBuffer, {
      prompt,
      outputWidth: variant.canvas_width,
      outputHeight: variant.canvas_height,
      padding: variant.photoroom_padding ?? 0.08,
    })
  } catch (e) {
    const message = e instanceof WebsitePhotoEditError ? e.message : 'PhotoRoom lighting pass failed'
    const status = e instanceof WebsitePhotoEditError ? e.status : 502
    return NextResponse.json({ error: message }, { status })
  }

  const assets: ResolvedAssets = { speaker_photo: { buffer: litBuffer } }
  let compositeBuffer: Buffer
  try {
    compositeBuffer = await compositeAnnouncement(variant, assets, {})
  } catch (e) {
    console.error('Website photo compositing failed:', e)
    return NextResponse.json({ error: 'Compositing the final photo failed' }, { status: 500 })
  }

  const websiteCardUrl = await uploadPublicAsset(
    `events/${body.event_id}/speakers/${body.speaker_id}/website-photo/${Date.now()}.png`,
    compositeBuffer,
    'image/png'
  )

  const { error: updateErr } = await supabaseAdmin
    .from('event_speakers')
    .update({ website_card_url: websiteCardUrl })
    .eq('id', body.speaker_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ website_card_url: websiteCardUrl })
}
