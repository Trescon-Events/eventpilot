import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireProposalAccess } from '@/app/lib/proposals/server'
import { eligibleTeam, isStaffId } from '@/app/lib/proposals/owners'

/* GET ?event_id=  → what the "Create drop" window and the Client approvers list need: the event's producers (who can own a drop), who "me" is, and the saved approvers. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireProposalAccess(req, eventId, 'view'); if ('error' in a) return a.error
  const [team, { data: approvers }] = await Promise.all([
    eligibleTeam(eventId),
    supabaseAdmin.from('speaker_proposal_approvers').select('id, name, email').eq('event_id', eventId).order('name'),
  ])
  return NextResponse.json({ team, me: isStaffId(a.session.sid) ? a.session.sid : null, approvers: approvers ?? [] })
}
