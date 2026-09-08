import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import type { AlignmentTarget, HeadBox } from '@/app/lib/media/face-alignment'
import { finalizeCleaningCycle, hasRealContentGap, CLEANING_CYCLE_CANVAS_SIZE } from '@/app/lib/media/photo-cleaning-pipeline'
import { MAX_STORED_PHOTO_DIMENSION } from '@/app/lib/media/speaker-photo-engine'

/* POST /api/events/stakeholders/speakers/[id]/clean-photo/finalize
   Body: { pending_photo_url, head_box, force? }
   Takes a producer-CONFIRMED head box on whatever .../clean-photo/generate
   produced (2026-08-21 — now EITHER branch's own clean-photo-pending-*.png,
   not just the AI-extended one; see that route's own doc comment on why
   both now defer to here instead of the deterministic branch committing
   directly), crops it to the Cleaning Cycle template's target, and
   OVERWRITES photo_processed_url/photo_head_box in place. This is the only
   place ANY head box is ever trusted as final, because it's producer-
   confirmed — including the deterministic-crop case, where confirming
   without adjusting is just a free no-op re-crop (head_box already equals
   target by construction), and adjusting re-crops for real, correctly,
   since alignAndCropPhoto only ever cares about the head's position within
   whatever buffer it's handed, not how that buffer was produced.

   Ground-truth pixel/gap check (2026-09-08, reintroduced — see history
   below for why it was pulled once already; do not re-remove without
   reading this) — runs ONLY when `force` is falsy, checking the ACTUAL
   cropped result via hasRealContentGap before saving anything. On a real
   gap, returns { needs_confirmation_gap: true } and does NOT write to
   event_speakers — the wizard's Confirm Cleaned Photo step shows a
   "doesn't look filled — regenerate?" popup instead (Checkpoint 2 of that
   flow; Checkpoint 1 runs the same check right after generation, before
   any manual adjustment — see clean-photo/generate's own runAiFillJob).
   The caller (PhotoCleaningWizard.tsx) is what decides when `force` is
   true: the good/enhance path (via runProcessing) always sends it, since a
   producer already explicitly judged that framing complete at Compose —
   re-litigating that decision here is exactly the false-positive class the
   2026-08-22 removal below was about, and this reintroduction deliberately
   does NOT reopen that path. The ai_fill/Confirm-Cleaned-Photo path sends
   `force` only once its own per-attempt popup-offer cap is reached
   (gapPromptCount), so a photo that structurally can't close the gap
   doesn't block forever on this check.

   History — first removal (2026-08-22): this same check used to run
   unconditionally, and was removed after a second real false-positive
   incident blocked a photo that visibly did reach the bottom of the frame.
   That incident was about running the check for good/enhance, or without
   any producer-controlled way to override it — this reintroduction avoids
   both: force-by-default on good/enhance, and an explicit human override
   (the popup's "Use As-Is") on ai_fill once a producer has actually looked
   at the result and disagrees with the check. */

type Body = { pending_photo_url?: string; head_box?: HeadBox; force?: boolean }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const body = await req.json().catch(() => null) as Body | null
  if (!body?.pending_photo_url || !body.head_box) {
    return NextResponse.json({ error: 'pending_photo_url, head_box required' }, { status: 400 })
  }

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, announcement_status')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const { data: template } = await supabaseAdmin
    .from('cleaning_cycle_template_global')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (!template) return NextResponse.json({ error: 'No Cleaning Cycle template set up' }, { status: 422 })

  const target: AlignmentTarget = { ...template, box: { x: 0, y: 0, width: CLEANING_CYCLE_CANVAS_SIZE, height: CLEANING_CYCLE_CANVAS_SIZE } }
  const reapprovalReset: Record<string, unknown> = speaker.announcement_status === 'ready' ? { announcement_status: 'pending_review' } : {}

  try {
    const imgRes = await fetch(body.pending_photo_url)
    if (!imgRes.ok) throw new Error(`Failed to fetch AI-extended photo: ${imgRes.status}`)
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    const { buffer: cropped } = await finalizeCleaningCycle(buffer, body.head_box, target)

    if (!body.force && await hasRealContentGap(cropped)) {
      return NextResponse.json({ needs_confirmation_gap: true })
    }

    const resized = await sharp(cropped).resize(MAX_STORED_PHOTO_DIMENSION, MAX_STORED_PHOTO_DIMENSION, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    const photoProcessedUrl = await uploadPublicAsset(
      `events/${speaker.event_id}/speakers/${speakerId}/photo-processed-${Date.now()}.png`,
      resized,
      'image/png'
    )
    // Same guarantee as the good-fit path: the crop lands the head exactly
    // on the template's own target ratios, so that's the new stored box.
    const newHeadBox: HeadBox = { centerXRatio: target.target_head_center_x, centerYRatio: target.target_head_center_y, heightRatio: target.target_head_height }

    const { data, error } = await supabaseAdmin
      .from('event_speakers')
      .update({ photo_processed_url: photoProcessedUrl, photo_head_box: newHeadBox, photo_cleaning_cycle_done: true, updated_at: new Date().toISOString(), ...reapprovalReset })
      .eq('id', speakerId)
      .select('photo_processed_url, photo_head_box, photo_cleaning_cycle_done')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not finalize the cleaned photo'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
