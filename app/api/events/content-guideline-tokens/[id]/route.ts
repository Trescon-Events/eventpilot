import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* DELETE /api/events/content-guideline-tokens/[id]?event_id=X — revoke
   Sets revoked_at rather than deleting, matching this codebase's other
   revoke actions (e.g. access assignments) — keeps the row (and its
   last_used_at history) around for an audit trail instead of losing it. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('content_guideline_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('event_id', eventId) // scoped so an event_id caller can't revoke another event's token by guessing its id
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
