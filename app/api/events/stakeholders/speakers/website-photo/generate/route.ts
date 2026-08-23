import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { type CreativeTemplateConfig, type ImageLayer, type PhotoSlotLayer } from '@/app/lib/announcements/composite'
import { alignAndCropPhoto, type HeadBox } from '@/app/lib/media/face-alignment'
import { compositeOnBackground } from '@/app/lib/media/composite-on-background'

/* POST /api/events/stakeholders/speakers/website-photo/generate
   Body: { event_id, speaker_id }

   Reverted to face-aligned cropping (2026-08-21, briefly replaced with a
   plain crop-box — see git history) — per Madhu: this should be the exact
   same mechanism SAE's own Promo/Self Promo generation already uses
   (alignAndCropPhoto against photoLayer.alignment + photo_head_box), not a
   second, different method invented for this one category. The crop-box
   detour traded that proven mechanism for a plain rectangle with no
   built-in head-size consistency guarantee (a circle/alignment target
   scales by head HEIGHT only, so width always follows automatically; a
   freeform rectangle has no such guarantee and needs its own aspect-ratio
   handling to avoid distortion or an invisible extra crop) — worse on
   every axis for no real gain. The original reason for moving away from
   alignment here (this variant's own tight target needing more zoom than
   the Cleaning Cycle reliably supplied) is now fixed at its actual root —
   the Cleaning Cycle's own gate no longer accepts a photo with a real gap
   (see photo-cleaning-pipeline.ts's hasRealContentGap) — so there's no
   remaining reason for this category to work any differently than Promo/
   Self Promo. */

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
    supabaseAdmin.from('event_speakers').select('id, photo_processed_url, photo_url, photo_head_box').eq('id', body.speaker_id).single(),
  ])

  const event = eventRes.data
  if (eventRes.error || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const speaker = speakerRes.data
  if (speakerRes.error || !speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const cleanPhotoUrl = speaker.photo_processed_url ?? speaker.photo_url
  if (!cleanPhotoUrl) {
    return NextResponse.json({ error: 'This speaker has no cleaned photo yet — upload one on the Overview tab first' }, { status: 422 })
  }
  const headBox = speaker.photo_head_box as HeadBox | null
  if (!headBox) {
    return NextResponse.json({ error: 'This speaker has no confirmed head position yet — use "Fix Head Position" first, so the system knows where their head is (never guessed automatically for this step).' }, { status: 422 })
  }

  const templateConfig = event.creative_template_config as CreativeTemplateConfig | null
  const variant = templateConfig?.speaker?.variants.find(v => v.category === 'website_photo')
  if (!variant) {
    return NextResponse.json({ error: "No Website Photo template configured for this event yet — set one up in Admin Console → Variants" }, { status: 422 })
  }

  const photoLayer = variant.layers.find((l): l is PhotoSlotLayer => l.type === 'photo_slot' && l.source === 'speaker_photo')
  if (!photoLayer?.alignment) {
    return NextResponse.json({
      error: 'The Website Photo variant has no reference photo layer set up yet — in Admin Console → Variants, open the Photo/Logo Slot layer and click "Upload Reference Layer (auto-position)" to set the target head position first',
    }, { status: 422 })
  }

  const backgroundLayer = variant.layers.find((l): l is ImageLayer => l.type === 'image')
  if (!backgroundLayer?.asset_url) {
    return NextResponse.json({ error: 'The Website Photo variant has no background image set yet — add an Image layer in Admin Console → Variants' }, { status: 422 })
  }

  const [cutoutBuffer, backgroundBuffer] = await Promise.all([
    fetchAssetBuffer(cleanPhotoUrl),
    fetchAssetBuffer(backgroundLayer.asset_url),
  ])
  if (!cutoutBuffer) return NextResponse.json({ error: "Could not fetch this speaker's cleaned photo" }, { status: 502 })
  if (!backgroundBuffer) return NextResponse.json({ error: 'Could not fetch the background image' }, { status: 502 })

  const target = { ...photoLayer.alignment, box: { x: 0, y: 0, width: variant.canvas_width, height: variant.canvas_height } }

  try {
    const { buffer: cropped, padding } = await alignAndCropPhoto(cutoutBuffer, target, headBox)
    const PADDING_WARNING_THRESHOLD_PX = 3
    const cropWarning = Math.max(padding.left, padding.top, padding.right, padding.bottom) > PADDING_WARNING_THRESHOLD_PX ? padding : null
    const finalBuffer = await compositeOnBackground(cropped, backgroundBuffer, { canvasWidth: variant.canvas_width, canvasHeight: variant.canvas_height })

    const websiteCardUrl = await uploadPublicAsset(`events/${body.event_id}/speakers/${body.speaker_id}/website-photo/${Date.now()}.png`, finalBuffer, 'image/png')
    const { error: updateErr } = await supabaseAdmin.from('event_speakers').update({ website_card_url: websiteCardUrl, website_photo_crop_warning: cropWarning }).eq('id', body.speaker_id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    return NextResponse.json({ website_card_url: websiteCardUrl, crop_warning: cropWarning })
  } catch (e) {
    console.error('Website photo generation failed:', e)
    return NextResponse.json({ error: 'Generating the website photo failed' }, { status: 500 })
  }
}
