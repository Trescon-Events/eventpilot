import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { getCachedCourses, invalidateCourseCache } from '@/app/lib/courseCache'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026'

/* POST — save generated course as draft, notify super admin */
export async function POST(req: NextRequest) {
  const { admin_code, course } = await req.json()
  if (admin_code !== ADMIN_CODE) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!course) return NextResponse.json({ error: 'No course data provided.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert({
      ...course,
      source: 'gemini',
      status: 'draft',
    })
    .select('id, title, tier_level, suggested_by_id, suggested_by_name')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* ── Notify super admin that a course is pending approval ── */
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase()
  if (superAdminEmail) {
    const { data: superAdminStaff } = await supabaseAdmin
      .from('staff_members')
      .select('id')
      .eq('email', superAdminEmail)
      .single()

    const notifyId = superAdminStaff?.id ?? 'super-admin'
    await supabaseAdmin.from('notifications').insert({
      staff_id:  notifyId,
      type:      'course_pending',
      title:     'New course pending your approval',
      body:      `"${data.title}" has been submitted for review.${data.suggested_by_name ? ` Suggested by ${data.suggested_by_name}.` : ''} Open the Review Queue in Admin to approve or reject it.`,
      course_id: data.id,
    })
  }

  return NextResponse.json({ success: true, course: data })
}

/* PATCH — approve a draft course: publish it and notify the suggester */
export async function PATCH(req: NextRequest) {
  const { admin_code, course_id } = await req.json()
  if (admin_code !== ADMIN_CODE) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!course_id) return NextResponse.json({ error: 'course_id is required.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('courses')
    .update({ status: 'published' })
    .eq('id', course_id)
    .select('id, title, suggested_by_id, suggested_by_name')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  invalidateCourseCache()

  /* ── Notify the person who suggested the course ── */
  if (data.suggested_by_id && data.suggested_by_id !== 'super-admin') {
    await supabaseAdmin.from('notifications').insert({
      staff_id:  data.suggested_by_id,
      type:      'course_published',
      title:     'Your course suggestion is live',
      body:      `"${data.title}" has been reviewed, approved, and published to the Event Pilot library. Every staff member who needs it will see it recommended on their dashboard.`,
      course_id: data.id,
    })
  }

  return NextResponse.json({ success: true, course: data })
}

/* DELETE — reject and remove a draft course */
export async function DELETE(req: NextRequest) {
  const { admin_code, course_id } = await req.json()
  if (admin_code !== ADMIN_CODE) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!course_id) return NextResponse.json({ error: 'course_id is required.' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('courses')
    .delete()
    .eq('id', course_id)
    .eq('status', 'draft') // safety: never delete published courses this way

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

/* GET — list courses (published only for staff; drafts for admin review queue) */
export async function GET(req: NextRequest) {
  const tier   = req.nextUrl.searchParams.get('tier')
  const dept   = req.nextUrl.searchParams.get('dept')
  const source = req.nextUrl.searchParams.get('source')
  const status = req.nextUrl.searchParams.get('status') // 'draft' for review queue

  // Draft review queue (admin only)
  if (status === 'draft') {
    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('id, title, subtitle, tool_name, tier_level, dept_tags, is_mandatory, estimated_minutes, overview, source, created_at, suggested_by_name, suggested_by_role, status')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (!source && !dept) {
    const all = await getCachedCourses()
    const filtered = tier && tier !== 'all' ? all.filter(c => c.tier_level === tier) : all
    return NextResponse.json(filtered)
  }

  let query = supabaseAdmin
    .from('courses')
    .select('id, title, subtitle, tool_name, tier_level, dept_tags, is_mandatory, estimated_minutes, overview, source, created_at, suggested_by_name, suggested_by_role')
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (tier && tier !== 'all') query = query.eq('tier_level', tier)
  if (source) query = query.eq('source', source)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filtered = (dept && dept !== 'all')
    ? (data ?? []).filter(c => c.dept_tags.length === 0 || c.dept_tags.includes(dept))
    : data ?? []

  return NextResponse.json(filtered)
}
