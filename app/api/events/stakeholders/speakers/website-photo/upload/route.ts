import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/stakeholders/speakers/website-photo/upload
   multipart/form-data: file, event_id, speaker_id

   Manual override for Website Photo (2026-08-21, part of the guided Photo
   Cleaning wizard's final review step) — for when the deterministic crop +
   composite (.../website-photo/generate) doesn't look right and branding
   team hand-produces one instead. Stored as-is, no processing: unlike a raw
   speaker photo, this is already a finished, ready-to-publish creative, not
   an input for anything downstream. Sets website_card_url directly and
   clears website_photo_crop_warning, which only ever meant something for a
   generated result. */

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

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const buffer = Buffer.from(await file.arrayBuffer())
  const websiteCardUrl = await uploadPublicAsset(
    `events/${eventId}/speakers/${speakerId}/website-photo/${Date.now()}.${ext}`,
    buffer,
    file.type
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
