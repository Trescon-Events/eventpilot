import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* POST /api/events/stakeholders/speakers/[id]/communications/[requestId]/close
   Producer closes a still-pending request: its link stops working, and a new
   request (new link) can be sent. Only a closed/submitted request lets a new
   link go out — see compose/route.ts's one-open-request guard. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id: speakerId, requestId } = await params
  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).maybeSingle()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('speaker_communication_requests')
    .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: session?.sid && session.sid !== 'super-admin' ? session.sid : null })
    .eq('id', requestId).eq('speaker_id', speakerId).eq('status', 'pending')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'That request is not open.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
