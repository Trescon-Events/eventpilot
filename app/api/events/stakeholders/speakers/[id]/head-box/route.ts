import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { detectHeadBox } from '@/app/lib/media/face-alignment'

/* PATCH /api/events/stakeholders/speakers/[id]/head-box
   Body: { head_box: { centerXRatio, centerYRatio, heightRatio } } — all 0-1,
   relative to the speaker's own photo dimensions (same shape Gemini's
   detectHeadBox() produces — see app/lib/media/face-alignment.ts).

   Manual override for when auto-detection gets it wrong (2026-08-03, real
   case: Alistair Cavendish-Ponsonby's photo — re-running detection 6 times,
   with and without trimming transparent margins, produced heightRatio
   anywhere from 0.22 to 0.68 for the same image; whatever got cached was
   essentially a coin flip, and alignAndCropPhoto()'s scale math turns a bad
   ratio into a badly mis-sized/positioned creative). Lets a human drag a
   box directly over the photo in the Stakeholder Hub instead of re-running
   an unreliable model call and hoping for a better roll. Sets photo_head_box
   directly — no detection call here at all. */

type HeadBox = { centerXRatio: number; centerYRatio: number; heightRatio: number }

function isValidHeadBox(v: unknown): v is HeadBox {
  if (!v || typeof v !== 'object') return false
  const b = v as Record<string, unknown>
  return (['centerXRatio', 'centerYRatio', 'heightRatio'] as const)
    .every(k => typeof b[k] === 'number' && Number.isFinite(b[k] as number) && (b[k] as number) >= 0 && (b[k] as number) <= 1)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const body = await req.json().catch(() => null) as { head_box?: unknown } | null

  if (!isValidHeadBox(body?.head_box)) {
    return NextResponse.json({ error: 'head_box { centerXRatio, centerYRatio, heightRatio } required, each 0-1' }, { status: 400 })
  }

  // Manually repositioning the head marker on an already-approved speaker
  // must force a fresh review — same reset guard as the main PATCH route.
  const { data: existing } = await supabaseAdmin.from('event_speakers').select('announcement_status').eq('id', speakerId).single()
  const reapprovalReset: Record<string, unknown> = existing?.announcement_status === 'ready' ? { announcement_status: 'pending_review' } : {}

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update({ photo_head_box: body!.head_box, updated_at: new Date().toISOString(), ...reapprovalReset })
    .eq('id', speakerId)
    .select('photo_head_box')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/* POST /api/events/stakeholders/speakers/[id]/head-box
   Runs a fresh detectHeadBox() call against the speaker's current photo and
   caches the result — the "Re-detect" button in HeadBoxEditorModal.tsx
   (2026-08-03), for the rare case a photo has no cached photo_head_box at
   all (upload-time detection can fail silently) and the manual editor would
   otherwise start from a generic default box instead of a real starting
   point. Detection is already known to be unreliable (see this file's PATCH
   doc comment) — this is a starting point for a human to correct, not a
   substitute for the drag-to-fix workflow. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('photo_url, photo_processed_url, announcement_status')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const reapprovalReset: Record<string, unknown> = speaker.announcement_status === 'ready' ? { announcement_status: 'pending_review' } : {}

  const photoUrl = speaker.photo_processed_url || speaker.photo_url
  if (!photoUrl) return NextResponse.json({ error: 'No photo uploaded yet' }, { status: 422 })

  const imgRes = await fetch(photoUrl)
  if (!imgRes.ok) return NextResponse.json({ error: 'Could not fetch the photo' }, { status: 502 })
  const buffer = Buffer.from(await imgRes.arrayBuffer())

  let head_box = null
  try {
    head_box = await detectHeadBox(buffer)
  } catch (e) {
    console.error('Re-detect head box failed:', speakerId, e)
  }
  if (!head_box) return NextResponse.json({ error: 'No face detected — draw the box manually instead' }, { status: 422 })

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update({ photo_head_box: head_box, updated_at: new Date().toISOString(), ...reapprovalReset })
    .eq('id', speakerId)
    .select('photo_head_box')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
