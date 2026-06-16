import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET /api/notifications?staff_id=UUID — fetch unread notifications */
export async function GET(req: NextRequest) {
  const staff_id = req.nextUrl.searchParams.get('staff_id')
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, type, title, body, course_id, review_id, created_at')
    .eq('staff_id', staff_id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/* PATCH /api/notifications — mark one or all as read */
export async function PATCH(req: NextRequest) {
  const { staff_id, notification_id } = await req.json().catch(() => ({}))
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  let query = supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('staff_id', staff_id)

  if (notification_id) query = query.eq('id', notification_id)

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
