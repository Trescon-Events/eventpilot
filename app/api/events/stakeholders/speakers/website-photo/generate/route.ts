import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { type CreativeTemplateConfig, type ImageLayer, type PhotoSlotLayer } from '@/app/lib/announcements/composite'
import { alignAndCropPhoto, type HeadBox } from '@/app/lib/media/face-alignment'
import { applyDeterministicLighting } from '@/app/lib/media/deterministic-lighting'

/* POST /api/events/stakeholders/speakers/website-photo/generate
   Body: { event_id, speaker_id }

   Speaker-only (no partner/sponsor equivalent — see the plan discussion).
   Two-step pipeline: (1) crop the stored photo_processed_url cutout to the
   variant's canvas size using the SPEAKER'S OWN known head position
   (photo_head_box, same source Promo/Self Promo variants already trust via
   alignAndCropPhoto); (2) composite it onto the variant's background with a
   deterministic rim-light + key-light effect (deterministic-lighting.ts) —
   NOT PhotoRoom/AI. That's a deliberate, evidence-based call (2026-08-18,
   per Madhu, after a full day investigating PhotoRoom's editWithAI): these
   photos go out publicly across every speaker and "must all look the
   same," which a generative model fundamentally can't guarantee — proven
   two separate ways (it doesn't reliably obey framing instructions, and
   correcting it afterward requires re-detecting the head on its output,
   which is itself too imprecise to correct with). See
   deterministic-lighting.ts's doc comment for the full reasoning. Writes
   the result to event_speakers.website_card_url — a column that's existed
   unused since the original SAE migration ("generated speaker card —
   future use"), reused here rather than adding a new one. No
   stakeholder_announcements row: this isn't a social creative with its own
   publish/schedule lifecycle, just the speaker's current website photo,
   one per speaker. */

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

  const backgroundLayer = variant.layers.find((l): l is ImageLayer => l.type === 'image')
  if (!backgroundLayer?.asset_url) {
    return NextResponse.json({ error: 'The Website Photo variant has no background image set yet — add an Image layer in Admin Console → Variants' }, { status: 422 })
  }

  const [cutoutBuffer, backgroundBuffer] = await Promise.all([
    fetchAssetBuffer(cleanPhotoUrl),
    fetchAssetBuffer(backgroundLayer.asset_url),
  ])
  if (!cutoutBuffer) {
    return NextResponse.json({ error: "Could not fetch this speaker's cleaned photo" }, { status: 502 })
  }
  if (!backgroundBuffer) {
    return NextResponse.json({ error: 'Could not fetch the background image' }, { status: 502 })
  }

  // Crop using the speaker's own known head position — not a re-detection
  // against generated output (see deterministic-lighting.ts's doc comment
  // for why that's unreliable). Falls back to live detection inside
  // alignAndCropPhoto itself if this speaker has never had "Fix Head
  // Position" run for them.
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
    finalBuffer = await applyDeterministicLighting(croppedBuffer, backgroundBuffer, {
      canvasWidth: variant.canvas_width,
      canvasHeight: variant.canvas_height,
      headCenterXRatio: photoLayer.alignment.target_head_center_x,
      headCenterYRatio: photoLayer.alignment.target_head_center_y,
      headHeightRatio: photoLayer.alignment.target_head_height,
      effect: variant.lighting_effect,
    })
  } catch (e) {
    console.error('Website photo lighting/composite failed:', e)
    return NextResponse.json({ error: 'Compositing the final photo failed' }, { status: 500 })
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
