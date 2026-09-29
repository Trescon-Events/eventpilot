import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* PATCH — edit name/email of one contact. DELETE /api/events/stakeholders/speakers/[id]/additional-contacts/[contactId]
   Removes one additional contact — same sae.stakeholders.edit gate as the
   parent route (see its own doc comment). */

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id: speakerId, contactId } = await params

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).maybeSingle()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('speaker_additional_contacts')
    .delete()
    .eq('id', contactId)
    .eq('speaker_id', speakerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id: speakerId, contactId } = await params
  const body = await req.json().catch(() => null) as { first_name?: string; last_name?: string; email?: string } | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).maybeSingle()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const email = (body.email ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('speaker_additional_contacts')
    .update({ first_name: body.first_name?.trim() || null, last_name: body.last_name?.trim() || null, email })
    .eq('id', contactId)
    .eq('speaker_id', speakerId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data })
}
