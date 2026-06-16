import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

const STATUS_LABELS: Record<string, string> = {
  new:          'New',
  acknowledged: 'Acknowledged',
  in_progress:  'In Progress',
  resolved:     'Resolved',
  wont_fix:     "Won't Fix",
}

// ── GET /api/reviews/[id] — review + comment trail ───────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req)
  if (!session?.adm && !session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const [{ data: review, error: rErr }, { data: comments, error: cErr }] = await Promise.all([
    supabaseAdmin.from('platform_reviews').select('*').eq('id', id).single(),
    supabaseAdmin.from('review_comments').select('*').eq('review_id', id).order('created_at', { ascending: true }),
  ])

  if (rErr || !review) return NextResponse.json({ error: rErr?.message ?? 'Not found' }, { status: 404 })
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Non-admin staff can only see their own review
  if (!session?.adm && review.staff_id !== session?.sid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ ...review, comments: comments ?? [] })
}

// ── PATCH /api/reviews/[id] — admin updates status, notes, or sends a response

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { status, admin_notes, response } = await req.json()

  const validStatuses = ['new', 'acknowledged', 'in_progress', 'resolved', 'wont_fix']
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  // Resolve admin name
  let adminName = 'Admin'
  if (session.sid && session.sid !== 'super-admin') {
    const { data: staff } = await supabaseAdmin
      .from('staff_members').select('name').eq('id', session.sid).maybeSingle()
    if (staff?.name) adminName = staff.name
  }

  // Fetch current review to get staff_id, title, current status
  const { data: review } = await supabaseAdmin
    .from('platform_reviews')
    .select('id, title, status, staff_id')
    .eq('id', id)
    .single()

  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  // ── Build DB patch ────────────────────────────────────────────────────────
  const patch: Record<string, unknown> = {}
  if (status)                    patch.status       = status
  if (admin_notes !== undefined) patch.admin_notes  = admin_notes
  if (status === 'resolved') {
    patch.resolved_at        = new Date().toISOString()
    patch.resolved_by_name   = adminName
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from('platform_reviews').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Status change comment (blocking — must succeed) ──────────────────────
  if (status && status !== review.status) {
    const { error: scErr } = await supabaseAdmin.from('review_comments').insert({
      review_id:        id,
      author_type:      'admin',
      author_name:      adminName,
      is_status_change: true,
      new_status:       status,
      message:          null,
    })
    if (scErr) return NextResponse.json({ error: `Trail insert failed: ${scErr.message}` }, { status: 500 })

    // Notify staff — fire and forget
    if (review.staff_id && ['acknowledged', 'in_progress', 'resolved'].includes(status)) {
      const notifTitle = status === 'resolved'
        ? 'Your feedback has been resolved'
        : `Your feedback is now ${STATUS_LABELS[status]}`
      const notifBody = `"${review.title}" — ${
        status === 'acknowledged' ? 'We have received your feedback and will look into it.'
        : status === 'in_progress' ? 'We are actively working on this.'
        : 'This has been resolved. Thank you for the input.'
      }`
      supabaseAdmin.from('notifications').insert({
        staff_id:  review.staff_id,
        type:      'review_update',
        title:     notifTitle,
        body:      notifBody,
        review_id: id,
      }).then(() => {})
    }
  }

  // ── Admin response comment (blocking — must succeed) ──────────────────────
  if (response?.trim()) {
    const { error: respErr } = await supabaseAdmin.from('review_comments').insert({
      review_id:        id,
      author_type:      'admin',
      author_name:      adminName,
      is_status_change: false,
      message:          response.trim(),
    })
    if (respErr) return NextResponse.json({ error: `Comment insert failed: ${respErr.message}` }, { status: 500 })

    // Notify staff — fire and forget
    if (review.staff_id) {
      supabaseAdmin.from('notifications').insert({
        staff_id:  review.staff_id,
        type:      'review_update',
        title:     `${adminName} responded to your feedback`,
        body:      response.trim(),
        review_id: id,
      }).then(() => {})
    }
  }

  // Return the full updated comment trail
  const { data: comments, error: trailErr } = await supabaseAdmin
    .from('review_comments')
    .select('*')
    .eq('review_id', id)
    .order('created_at', { ascending: true })

  if (trailErr) return NextResponse.json({ error: trailErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, comments: comments ?? [] })
}
