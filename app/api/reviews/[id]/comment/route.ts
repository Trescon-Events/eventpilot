import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

/* POST /api/reviews/[id]/comment
   Staff replies to their own issue.
   - Validates the review belongs to this staff member
   - Inserts a review_comment with author_type: 'staff'
   - Creates bell notifications for all admins (they decide whether to reopen)
*/
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { message } = await req.json().catch(() => ({}))

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  // Fetch the review — ensure it belongs to this staff member
  const { data: review, error: rErr } = await supabaseAdmin
    .from('platform_reviews')
    .select('id, title, status, staff_id, staff_name')
    .eq('id', id)
    .single()

  if (rErr || !review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  if (review.staff_id !== session.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Resolve staff name
  let staffName = review.staff_name ?? 'Staff'
  if (session.sid !== 'super-admin') {
    const { data: sm } = await supabaseAdmin
      .from('staff_members').select('name').eq('id', session.sid).maybeSingle()
    if (sm?.name) staffName = sm.name
  }

  // Insert staff comment
  const { error: cErr } = await supabaseAdmin.from('review_comments').insert({
    review_id:        id,
    author_type:      'staff',
    author_name:      staffName,
    is_status_change: false,
    message:          message.trim(),
  })
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Notify all admins
  const { data: admins } = await supabaseAdmin
    .from('staff_members')
    .select('id')
    .contains('access_roles', ['admin'])

  const { data: superAdmins } = await supabaseAdmin
    .from('staff_members')
    .select('id')
    .contains('access_roles', ['super_admin'])

  const adminIds = [
    ...(admins ?? []).map(a => a.id),
    ...(superAdmins ?? []).map(a => a.id),
  ].filter((v, i, arr) => arr.indexOf(v) === i) // dedupe

  if (adminIds.length > 0) {
    await supabaseAdmin.from('notifications').insert(
      adminIds.map(adminId => ({
        staff_id:  adminId,
        type:      'review_reply',
        title:     `${staffName} replied to an issue`,
        body:      `"${review.title}" — ${message.trim().slice(0, 100)}${message.trim().length > 100 ? '…' : ''}`,
        review_id: id,
      }))
    )
  }

  // Return updated comment trail
  const { data: comments } = await supabaseAdmin
    .from('review_comments')
    .select('*')
    .eq('review_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    ok: true,
    comments: comments ?? [],
  })
}
