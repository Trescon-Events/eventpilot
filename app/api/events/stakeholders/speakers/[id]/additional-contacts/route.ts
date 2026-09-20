import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET  /api/events/stakeholders/speakers/[id]/additional-contacts
   POST /api/events/stakeholders/speakers/[id]/additional-contacts
   Body (POST): { first_name?, last_name?, email }

   A speaker's own small pool of extra people a producer coordinates with
   about them — see supabase/speaker_additional_contacts_migration.sql's
   doc comment for the full design. Same sae.stakeholders.edit permission
   as every other producer-editable field on the speaker Details page
   (this is its own section there, not a separate settings surface) —
   GET is also readable by that same permission so the send-composers
   (SendToSpeakerComposer/SendForExternalApprovalComposer/
   NotifyExternalComposer) can default their CC list from it without
   needing a broader grant. */

async function loadSpeakerEventId(speakerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).maybeSingle()
  return data?.event_id ?? null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const eventId = await loadSpeakerEventId(speakerId)
  if (!eventId) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('speaker_additional_contacts')
    .select('*')
    .eq('speaker_id', speakerId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const eventId = await loadSpeakerEventId(speakerId)
  if (!eventId) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { first_name?: string; last_name?: string; email?: string } | null
  if (!body?.email?.trim()) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('speaker_additional_contacts')
    .insert({
      speaker_id: speakerId,
      first_name: body.first_name?.trim() || null,
      last_name: body.last_name?.trim() || null,
      email: body.email.trim(),
      source: 'manual',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
