import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/stakeholders/speakers/website-photo/upload
   multipart/form-data: file, event_id, speaker_id

   Manual override for Website Photo (2026-08-21, part of the guided Photo
   Cleaning wizard's final review step) — for when the deterministic crop +
   composite (.../website-photo/generate) doesn't look right and branding
   team hand-produces one instead. Unlike a raw speaker photo, this is
   already a finished, ready-to-publish creative, not an input for anything
   downstream — so no crop/compositing here, only a format normalization.
   Sets website_card_url directly and clears website_photo_crop_warning,
   which only ever meant something for a generated result.

   Re-encoded to WebP on the way in (2026-09-12, per Madhu) — website_card_url
   is what KonfHub publishes straight to the public event website, and it
   must always be WebP regardless of which of the two write paths (this one,
   or .../website-photo/generate) produced it, or the whole point of the
   size fix breaks the moment branding team uploads a hand-made PNG/JPEG. */

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 20 * 1024 * 1024

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  const speakerId = form.get('speaker_id') as string | null

  if (!file || !eventId || !speakerId) {
    return NextResponse.json({ error: 'file, event_id, speaker_id required' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type ${file.type}` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `File too large (max ${MAX_SIZE / (1024 * 1024)} MB)` }, { status: 413 })
  }

  const session = getSession(req)
  const canGenerate = session?.adm || await hasEventPermission(session?.sid, eventId, 'sae.announcements.generate')
  if (!canGenerate) {
    return NextResponse.json({ error: 'You do not have permission to set website photos for this event' }, { status: 403 })
  }

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('id').eq('id', speakerId).single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const rawBuffer = Buffer.from(await file.arrayBuffer())
  // Already-WebP uploads skip re-encoding — sharp round-tripping a WebP
  // through .webp() again is a pure loss for no benefit, and this file was
  // presumably already sized deliberately by whoever produced it.
  const buffer = file.type === 'image/webp' ? rawBuffer : await sharp(rawBuffer).webp({ quality: 85 }).toBuffer()
  const websiteCardUrl = await uploadPublicAsset(
    `events/${eventId}/speakers/${speakerId}/website-photo/${Date.now()}.webp`,
    buffer,
    'image/webp'
  )

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update({ website_card_url: websiteCardUrl, website_photo_crop_warning: null, updated_at: new Date().toISOString() })
    .eq('id', speakerId)
    .select('website_card_url')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
