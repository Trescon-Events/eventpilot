import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { type AlignmentTarget, type HeadBox } from '@/app/lib/media/face-alignment'
import { generateAIFilledPhoto, removeGreenScreenBackground, finalizeCleaningCycle, CLEANING_CYCLE_CANVAS_SIZE } from '@/app/lib/media/photo-cleaning-pipeline'
import { MAX_STORED_PHOTO_DIMENSION } from '@/app/lib/media/speaker-photo-engine'
import type { CreativeTemplateConfig } from '@/app/lib/announcements/composite'

/* POST /api/events/stakeholders/speakers/[id]/clean-photo/generate
   Body: { mode: 'ai_fill' | 'enhance' | 'good', quality?: 'medium' | 'high' }
   `quality` only applies to 'ai_fill' (default 'medium' if omitted) — the
   wizard's "Regenerate at Higher Quality" button on Confirm Cleaned Photo
   is the only caller that ever sends 'high' (2026-08-22, per Madhu: don't
   pay the costlier tier's price on every generation by default, only when
   a producer has actually looked at a medium result and asked for a
   sharper re-run). Operates on the
   speaker's own CURRENT photo_processed_url + photo_head_box (must already
   be human-confirmed via the wizard's Compose step first; 422 if not set,
   same contract as the other photo routes in this module).

   Which of the three modes runs is now the PRODUCER'S own explicit choice
   (2026-08-22, replaces an automated padding-heuristic gate — checkQualityGate
   — removed after repeated real false positives/negatives; see
   photo-cleaning-pipeline.ts's top comment). The Compose step shows the
   producer the actual composed canvas live and lets them pick:
   - 'good': body already fully reaches the bottom, no processing needed
     beyond the deterministic crop.
   - 'enhance': body already reaches the bottom, just needs quality
     enhancement (no framing change).
   - 'ai_fill': body is cut off before the bottom, needs GPT Image 2 to
     fill in the missing content.

   Every mode returns the SAME response shape and none commits anything to
   the speaker record directly — each uploads its own working result as a
   clean-photo-pending-*.png and returns
   { needs_confirmation: true, pending_photo_url, suggested_head_box,
   ai_extended }: false for 'good'/'enhance' (already exact, so confirming
   without adjusting is a free no-op re-crop in .../finalize — see that
   route's own doc comment), true for 'ai_fill'. Either way,
   .../clean-photo/finalize is what actually saves — this route never
   writes to event_speakers at all. For 'ai_fill', the wizard always shows
   a second "Confirm Cleaned Photo" checkpoint (AI output isn't guaranteed
   pixel-perfect); for 'good'/'enhance' the wizard skips straight to
   finalize with head_box = the template's own target ratios, since the
   deterministic crop already landed the head exactly there.

   When ai_extended is true, the response also includes ai_edited_photo_url
   — the raw GPT Image 2 output, uploaded as-is before removeGreenScreen-
   Background or any cropping touches it (2026-08-22, per Madhu: seeing this
   exact buffer is the only way to tell whether a bad result is the AI not
   following the template's own head-size/margin instructions, versus
   something later in the pipeline). The wizard's "AI Edited" step shows it. */
type Body = { mode?: 'ai_fill' | 'enhance' | 'good'; quality?: 'medium' | 'high' }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const body = await req.json().catch(() => null) as Body | null
  const mode = body?.mode
  if (mode !== 'ai_fill' && mode !== 'enhance' && mode !== 'good') {
    return NextResponse.json({ error: "mode must be 'ai_fill', 'enhance', or 'good'" }, { status: 400 })
  }
  const quality = body?.quality === 'high' ? 'high' : 'medium'

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, photo_processed_url, photo_url, photo_head_box')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const sourceUrl = speaker.photo_processed_url || speaker.photo_url
  if (!sourceUrl) return NextResponse.json({ error: 'No processed photo yet — upload a photo first' }, { status: 422 })
  const headBox = speaker.photo_head_box as HeadBox | null
  if (!headBox) return NextResponse.json({ error: 'Position the head before running the Cleaning Cycle' }, { status: 422 })

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('creative_template_config')
    .eq('id', speaker.event_id)
    .single()
  const template = (event?.creative_template_config as CreativeTemplateConfig | null)?.cleaning_cycle_template
  if (!template || !template.reference_url) {
    return NextResponse.json({ error: 'No Cleaning Cycle template set up yet — set one up in Admin Console → AI Edit Prompts first' }, { status: 422 })
  }

  const target: AlignmentTarget = { ...template, box: { x: 0, y: 0, width: CLEANING_CYCLE_CANVAS_SIZE, height: CLEANING_CYCLE_CANVAS_SIZE } }
  const suggestedHeadBox: HeadBox = { centerXRatio: target.target_head_center_x, centerYRatio: target.target_head_center_y, heightRatio: target.target_head_height }

  try {
    const imgRes = await fetch(sourceUrl)
    if (!imgRes.ok) throw new Error(`Failed to fetch current photo: ${imgRes.status}`)
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    if (mode === 'good' || mode === 'enhance') {
      const { buffer: cropped } = await finalizeCleaningCycle(buffer, headBox, target)
      // 'enhance' applies the same deterministic, pixel-position-preserving
      // local enhancement already used at upload time (speaker-photo-
      // engine.ts) — deliberately NOT any PhotoRoom AI endpoint, since
      // composite.ts already documents PhotoRoom's editWithAI was tried and
      // abandoned for shifting subject scale/position. Sharp filters only
      // touch pixel values, never geometry, so the crop's exact framing
      // (and therefore suggestedHeadBox below) stays valid either way.
      const finalBuffer = mode === 'enhance' ? await sharp(cropped).normalize().sharpen().png().toBuffer() : cropped
      // No hasRealContentGap check on this path (2026-08-22, per Madhu,
      // real incident: a genuinely good photo got rejected here) — the
      // producer already looked at the actual composed canvas in Compose
      // and explicitly judged it complete; re-running an automated check
      // that can override that explicit human judgment defeats the whole
      // point of Compose existing. The gap check still runs for 'ai_fill'
      // (see .../finalize), where it's catching GPT's imperfect output,
      // not second-guessing a human.
      const resized = await sharp(finalBuffer).resize(MAX_STORED_PHOTO_DIMENSION, MAX_STORED_PHOTO_DIMENSION, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
      const pendingPhotoUrl = await uploadPublicAsset(
        `events/${speaker.event_id}/speakers/${speakerId}/clean-photo-pending-${Date.now()}.png`,
        resized,
        'image/png'
      )
      // The crop guarantees the head now sits exactly at the template's
      // own target ratios — no re-detection needed, and more reliable
      // than one (see photo-cleaning-pipeline.ts's top comment on
      // detection variance). Not committed here — see this file's top
      // comment on why every branch now returns needs_confirmation and
      // lets .../finalize do the actual save.
      return NextResponse.json({ needs_confirmation: true, pending_photo_url: pendingPhotoUrl, suggested_head_box: suggestedHeadBox, ai_extended: false })
    }

    const aiExtended = await generateAIFilledPhoto(buffer, headBox, target, template.prompt || undefined, quality)
    // Uploaded and returned as-is, before ANY further processing touches it
    // (2026-08-22, per Madhu — real need: comparing this against the actual
    // GPT Image 2 output was the only way to tell whether a result that
    // looked wrong was the AI not following the template's own head-size/
    // margin instructions, or something later in the pipeline (green-screen
    // removal, cropping) introducing the problem afterward. The wizard's own
    // "AI Edited" step shows this exact buffer, full canvas, untouched.
    const aiEditedPhotoUrl = await uploadPublicAsset(
      `events/${speaker.event_id}/speakers/${speakerId}/clean-photo-ai-edited-${Date.now()}.png`,
      aiExtended,
      'image/png'
    )
    // GPT Image 2's edit endpoint can't output transparency for this model
    // (confirmed this session — `background: 'transparent'` 400s), so
    // aiExtended has a real, opaque chroma-key-green background baked in.
    // Every consumer of photo_processed_url (SAE, Website Photo) needs it
    // transparent to composite onto its own background — without this step,
    // the color bakes in permanently: cropping/resizing later never touches
    // the alpha channel, so nothing downstream can recover it. PhotoRoom's
    // dedicated green-screen despill mode does this properly — see
    // removeGreenScreenBackground's own doc comment for what was tried and
    // abandoned before landing here.
    const transparent = await removeGreenScreenBackground(aiExtended)
    const pendingPhotoUrl = await uploadPublicAsset(
      `events/${speaker.event_id}/speakers/${speakerId}/clean-photo-pending-${Date.now()}.png`,
      transparent,
      'image/png'
    )
    // UI seed only, per policy never trusted as final — a producer must
    // confirm/adjust it via the head-fix modal before .../finalize is called.
    // Seeded from the template's OWN target ratios (2026-08-21, was a fresh
    // detectHeadBox() call against the AI output) — that's exactly where the
    // AI was steered to place the head, so it's a better starting guess than
    // a second, independent, unreliable detection call, and skips a whole
    // network round-trip that was previously part of every needs-fix wait.
    return NextResponse.json({ needs_confirmation: true, pending_photo_url: pendingPhotoUrl, ai_edited_photo_url: aiEditedPhotoUrl, suggested_head_box: suggestedHeadBox, ai_extended: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Cleaning Cycle failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
