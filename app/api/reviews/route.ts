import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

// ── GET /api/reviews?my=1 — staff sees their own submissions with trail ───────

async function getMyReviews(staffId: string) {
  const { data: reviews, error } = await supabaseAdmin
    .from('platform_reviews')
    .select('id, tool, review_type, severity, title, description, status, screenshot_url, resolved_at, resolved_by_name, created_at')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false })

  if (error || !reviews?.length) return reviews ?? []

  const ids = reviews.map(r => r.id)
  const { data: comments } = await supabaseAdmin
    .from('review_comments')
    .select('*')
    .in('review_id', ids)
    .order('created_at', { ascending: true })

  const commentsByReview: Record<string, unknown[]> = {}
  for (const c of comments ?? []) {
    const rc = c as { review_id: string }
    if (!commentsByReview[rc.review_id]) commentsByReview[rc.review_id] = []
    commentsByReview[rc.review_id].push(c)
  }

  return reviews.map(r => ({ ...r, comments: commentsByReview[r.id] ?? [] }))
}

// ── GET /api/reviews — admin list with optional filters ──────────────────────

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  if (searchParams.get('my') === '1') {
    if (session.sid === 'super-admin') return NextResponse.json([])
    return NextResponse.json(await getMyReviews(session.sid))
  }

  if (!session?.adm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tool     = searchParams.get('tool')
  const type     = searchParams.get('type')
  const status   = searchParams.get('status')
  const severity = searchParams.get('severity')

  let q = supabaseAdmin
    .from('platform_reviews')
    .select('*')
    .order('created_at', { ascending: false })

  if (tool     && tool !== 'all')     q = q.eq('tool', tool)
  if (type     && type !== 'all')     q = q.eq('review_type', type)
  if (status   && status !== 'all')   q = q.eq('status', status)
  if (severity && severity !== 'all') q = q.eq('severity', severity)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST /api/reviews — staff submits a review ───────────────────────────────

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { tool, review_type, severity, title, description, screenshot_url } = await req.json()

  if (!tool || !review_type || !severity || !title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
  }

  // Look up staff name + email from sid
  let staffName  = 'Unknown'
  let staffEmail = ''
  let staffId: string | null = null

  if (session.sid !== 'super-admin') {
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, email')
      .eq('id', session.sid)
      .maybeSingle()

    if (staff) {
      staffId    = staff.id
      staffName  = staff.name
      staffEmail = staff.email
    }
  } else {
    staffName  = 'Super Admin'
    staffEmail = process.env.SUPER_ADMIN_EMAIL ?? ''
  }

  const { error } = await supabaseAdmin.from('platform_reviews').insert({
    staff_id:       staffId,
    staff_name:     staffName,
    staff_email:    staffEmail,
    tool,
    review_type,
    severity,
    title:          title.trim(),
    description:    description.trim(),
    status:         'new',
    ...(screenshot_url ? { screenshot_url } : {}),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
