import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { type CreativeTemplateConfig, type ImageLayer, type PhotoSlotLayer } from '@/app/lib/announcements/composite'
import { alignAndCropPhoto, type HeadBox } from '@/app/lib/media/face-alignment'
import { applyWebsitePhotoLighting, WebsitePhotoEditError } from '@/app/lib/media/website-photo-engine'

/* POST /api/events/stakeholders/speakers/website-photo/generate
   Body: { event_id, speaker_id }

   Speaker-only (no partner/sponsor equivalent — see the plan discussion).
   Two-step pipeline (redesigned twice 2026-08-18 per Madhu — see
   website-photo-engine.ts's doc comment for the full history): (1) crop
   the stored photo_processed_url cutout to the variant's canvas size using
   the SPEAKER'S OWN known head position (photo_head_box, same source
   Promo/Self Promo variants already trust via alignAndCropPhoto) — not a
   PhotoRoom guess; (2) one PhotoRoom editWithAI call, given BOTH that
   already-correctly-framed crop AND the variant's real background image
   (background.imageFile), to relight the subject and blend it onto that
   real background in one shot. PhotoRoom's own output IS the final image —
   no local compositeAnnouncement() step, unlike every other creative kind
   in this app. That's deliberate, not a shortcut: confirmed empirically
   that keeping the cutout transparent for local compositing doesn't work
   for a backlight/rim-glow prompt (PhotoRoom always paints something in
   the background area for that style, however forcefully told not to),
   and that PhotoRoom blending the glow into the REAL background image
   directly looks materially better than a local hard-edged composite ever
   could. Writes the result to event_speakers.website_card_url — a column
   that's existed unused since the original SAE migration ("generated
   speaker card — future use"), reused here rather than adding a new one.
   No stakeholder_announcements row: this isn't a social creative with its
   own publish/schedule lifecycle, just the speaker's current website
   photo, one per speaker. */

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

  const prompt = templateConfig?.ai_edit_prompts?.find(p => p.module_key === 'speaker_website_photo')?.prompt
  if (!prompt) {
    return NextResponse.json({ error: 'No lighting prompt configured yet — set one in Admin Console → AI Edit Prompts' }, { status: 422 })
  }

  const backgroundLayer = variant.layers.find((l): l is ImageLayer => l.type === 'image')

  const [cutoutBuffer, backgroundBuffer] = await Promise.all([
    fetchAssetBuffer(cleanPhotoUrl),
    backgroundLayer?.asset_url ? fetchAssetBuffer(backgroundLayer.asset_url) : Promise.resolve(null),
  ])
  if (!cutoutBuffer) {
    return NextResponse.json({ error: "Could not fetch this speaker's cleaned photo" }, { status: 502 })
  }

  // Crop first, using the speaker's own known head position — not a
  // PhotoRoom guess (see website-photo-engine.ts). Falls back to live
  // detection inside alignAndCropPhoto itself if this speaker has never had
  // "Fix Head Position" run for them.
  let croppedBuffer: Buffer
  try {
    croppedBuffer = await alignAndCropPhoto(
      cutoutBuffer,
      { ...photoLayer.alignment, box: { x: 0, y: 0, width: variant.canvas_width, height: variant.canvas_height } },
      speaker.photo_head_box as HeadBox | null
    )
  } catch (e) {
    console.error('Website photo crop failed:', e)
    return NextResponse.json({ error: 'Cropping this speaker\'s photo to the template failed' }, { status: 500 })
  }

  let finalBuffer: Buffer
  try {
    finalBuffer = await applyWebsitePhotoLighting(croppedBuffer, {
      prompt,
      outputWidth: variant.canvas_width,
      outputHeight: variant.canvas_height,
      backgroundBuffer,
    })
  } catch (e) {
    const message = e instanceof WebsitePhotoEditError ? e.message : 'PhotoRoom lighting pass failed'
    const status = e instanceof WebsitePhotoEditError ? e.status : 502
    return NextResponse.json({ error: message }, { status })
  }

  const websiteCardUrl = await uploadPublicAsset(
    `events/${body.event_id}/speakers/${body.speaker_id}/website-photo/${Date.now()}.png`,
    finalBuffer,
    'image/png'
  )

  const { error: updateErr } = await supabaseAdmin
    .from('event_speakers')
    .update({ website_card_url: websiteCardUrl })
    .eq('id', body.speaker_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ website_card_url: websiteCardUrl })
}
