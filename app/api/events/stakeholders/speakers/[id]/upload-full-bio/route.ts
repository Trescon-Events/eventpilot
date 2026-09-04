import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { toStoredBioPdf } from '@/app/lib/events/full-bio-upload'

/* POST /api/events/stakeholders/speakers/[id]/upload-full-bio
   multipart/form-data: file (PDF or Word doc)

   Producer-side counterpart to the public onboarding form's `bio_full`
   file field — same conversion rule via toStoredBioPdf() (see that file's
   doc comment): a Word doc is converted to PDF via CloudConvert and only
   the PDF is ever stored. */

const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id, announcement_status').eq('id', speakerId).single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: `File too large (max ${MAX_SIZE / (1024 * 1024)} MB)` }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let pdfBuffer: Buffer, source: 'pdf' | 'docx_converted'
  try {
    ;({ pdfBuffer, source } = await toStoredBioPdf(buffer, file.name, file.type))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Full Bio upload failed' }, { status: 400 })
  }

  const url = await uploadPublicAsset(`events/${speaker.event_id}/speakers/${speakerId}/bio-full-${Date.now()}.pdf`, pdfBuffer, 'application/pdf')

  // Same reapproval-reset precedent as photo/logo uploads (upload-asset/
  // route.ts) — a new source document on an already-approved speaker
  // should trigger a fresh review.
  const reapprovalReset: Record<string, unknown> = speaker.announcement_status === 'ready' ? { announcement_status: 'pending_review' } : {}

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update({ bio_full_url: url, bio_full_source: source, updated_at: new Date().toISOString(), ...reapprovalReset })
    .eq('id', speakerId)
    .select('bio_full_url, bio_full_source')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
