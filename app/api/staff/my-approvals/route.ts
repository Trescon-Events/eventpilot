import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/staff/my-approvals
   Lists pending announcement_approvals rows assigned to the logged-in
   staff member — the internal counterpart to the external, token-based
   review page (app/admin/events/[id]/announcements/[announcementId]/
   review/page.tsx). Global, not per-event — a staff member's approval
   inbox spans whatever events they're an approver on, same as how a real
   approval inbox works, not filtered by whichever event happens to be
   open. 2026-08-16 build-out. */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('announcement_approvals')
    .select('id, approver_role, status, notified_at, announcement:announcement_id(id, post_copy, creative_url, status, scheduled_for, event:event_id(id, name))')
    .eq('approver_id', session.sid)
    .eq('status', 'pending')
    .order('notified_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
