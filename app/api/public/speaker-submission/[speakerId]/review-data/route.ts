import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { missingItemLabel, MissingItemKey } from '@/app/lib/stakeholders/missing-items'

/* GET /api/public/speaker-submission/[speakerId]/review-data?token=X
   Public (see middleware.ts's /api/public prefix), read-only. Deliberately
   a separate, narrow endpoint — a token only ever unlocks exactly what a
   speaker needs to see (their name, the event name, and the specific
   items being asked for), nothing else from their record. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ speakerId: string }> }) {
  const { speakerId } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: request } = await supabaseAdmin
    .from('speaker_communication_requests')
    .select('status, token_expires_at, requested_fields, submitted_at')
    .eq('speaker_id', speakerId)
    .eq('token', token)
    .single()
  if (!request) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (!request.token_expires_at || new Date(request.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })
  }

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('name, public_name, event_id').eq('id', speakerId).single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const { data: event } = await supabaseAdmin.from('events').select('name, public_name').eq('id', speaker.event_id).single()

  const requestedFields = (request.requested_fields as MissingItemKey[]) ?? []

  return NextResponse.json({
    speaker_name: speaker.public_name || speaker.name,
    event_name: event?.public_name || event?.name || null,
    status: request.status,
    submitted_at: request.submitted_at,
    requested_fields: requestedFields.map(key => ({ key, label: missingItemLabel(key) })),
  })
}
