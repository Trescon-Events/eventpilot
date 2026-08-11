import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET /api/events/stakeholders/invites?event_id=X&form_type=Y
   Powers the Stakeholder Hub's Invites card — same view permission as the
   rest of the Hub (sae.stakeholders.view), not the narrower
   sae.invites.send (that gates composing/sending/reminding, not viewing
   the tracker — mirrors how the Submissions Inbox already splits
   sae.submissions.view from .process/.reject). */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const formType = req.nextUrl.searchParams.get('form_type')
  if (!eventId || !formType) return NextResponse.json({ error: 'event_id and form_type required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('stakeholder_invites')
    .select('*, submission:submission_id(status, processed_into)')
    .eq('event_id', eventId)
    .eq('form_type', formType)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
