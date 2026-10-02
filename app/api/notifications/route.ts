import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'

/* The staff id comes from the signed session cookie, never from the request: this endpoint used to trust a
   client-supplied staff_id, so anyone could read or clear another person's notifications (2026-10-02). The old
   `staff_id` query/body field is still accepted by callers but ignored. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* GET /api/notifications — the signed-in person's unread notifications */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid || !UUID.test(session.sid)) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, type, title, body, course_id, review_id, link, created_at')
    .eq('staff_id', session.sid)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/* PATCH /api/notifications — mark one or all of the signed-in person's notifications as read */
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid || !UUID.test(session.sid)) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { notification_id } = await req.json().catch(() => ({}))

  let query = supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('staff_id', session.sid)

  if (notification_id) query = query.eq('id', notification_id)

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
