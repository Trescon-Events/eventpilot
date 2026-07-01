import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { resolveReview } from '@/app/lib/review-auto-resolve'

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
  const { status, admin_notes, response, fix_commit_sha } = await req.json()

  const validStatuses = ['new', 'acknowledged', 'in_progress', 'resolved', 'wont_fix']
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  let adminName = 'Admin'
  if (session.sid && session.sid !== 'super-admin') {
    const { data: staff } = await supabaseAdmin
      .from('staff_members').select('name').eq('id', session.sid).maybeSingle()
    if (staff?.name) adminName = staff.name
  }

  const { data: review } = await supabaseAdmin
    .from('platform_reviews')
    .select('id, title, status, staff_id')
    .eq('id', id)
    .single()

  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  // Persist admin_notes / fix_commit_sha up front so resolveReview() reads
  // the fresh values when it drafts the auto-response.
  const preUpdate: Record<string, unknown> = {}
  if (admin_notes    !== undefined) preUpdate.admin_notes    = admin_notes
  if (fix_commit_sha !== undefined) preUpdate.fix_commit_sha = fix_commit_sha
  if (Object.keys(preUpdate).length > 0) {
    const { error } = await supabaseAdmin.from('platform_reviews').update(preUpdate).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Manual admin response comment — inserted before any resolve so the
  // resolveReview() guard sees it and skips its own auto-response.
  if (response?.trim()) {
    const { error: respErr } = await supabaseAdmin.from('review_comments').insert({
      review_id:        id,
      author_type:      'admin',
      author_name:      adminName,
      is_status_change: false,
      message:          response.trim(),
    })
    if (respErr) return NextResponse.json({ error: `Comment insert failed: ${respErr.message}` }, { status: 500 })

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

  if (status && status !== review.status) {
    if (status === 'resolved') {
      const outcome = await resolveReview(id, adminName)
      if (outcome.error) return NextResponse.json({ error: outcome.error }, { status: 500 })
    } else {
      const { error: sErr } = await supabaseAdmin
        .from('platform_reviews').update({ status }).eq('id', id)
      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

      const { error: scErr } = await supabaseAdmin.from('review_comments').insert({
        review_id:        id,
        author_type:      'admin',
        author_name:      adminName,
        is_status_change: true,
        new_status:       status,
        message:          null,
      })
      if (scErr) return NextResponse.json({ error: `Trail insert failed: ${scErr.message}` }, { status: 500 })

      if (review.staff_id && ['acknowledged', 'in_progress'].includes(status)) {
        const notifBody = `"${review.title}" — ${
          status === 'acknowledged'
            ? 'We have received your feedback and will look into it.'
            : 'We are actively working on this.'
        }`
        supabaseAdmin.from('notifications').insert({
          staff_id:  review.staff_id,
          type:      'review_update',
          title:     `Your feedback is now ${STATUS_LABELS[status]}`,
          body:      notifBody,
          review_id: id,
        }).then(() => {})
      }
    }
  }

  const { data: comments, error: trailErr } = await supabaseAdmin
    .from('review_comments')
    .select('*')
    .eq('review_id', id)
    .order('created_at', { ascending: true })

  if (trailErr) return NextResponse.json({ error: trailErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, comments: comments ?? [] })
}
