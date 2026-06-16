import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/community?category=X&dept=Y&limit=N&offset=M */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const category = searchParams.get('category')
  const dept     = searchParams.get('dept')
  const limit    = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))
  const offset   = parseInt(searchParams.get('offset') ?? '0')

  let query = supabaseAdmin
    .from('community_posts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category && category !== 'all') query = query.eq('category', category)
  if (dept     && dept     !== 'all') query = query.eq('department', dept)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data ?? [], total: count ?? 0 })
}

/* POST /api/community — create a new post */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { staff_id, staff_name, department, category, title, body: postBody, tool_name } = body
  if (!staff_id || !staff_name || !category || !title || !postBody) {
    return NextResponse.json({ error: 'staff_id, staff_name, category, title, body required' }, { status: 400 })
  }

  const VALID_CATS = ['prompt', 'use_case', 'automation', 'tip']
  if (!VALID_CATS.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('community_posts')
    .insert({ staff_id, staff_name, department, category, title, body: postBody, tool_name: tool_name || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/* PATCH /api/community — toggle like on a post */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { post_id, staff_id } = body ?? {}
  if (!post_id || !staff_id) return NextResponse.json({ error: 'post_id and staff_id required' }, { status: 400 })

  // Check if already liked
  const { data: existing } = await supabaseAdmin
    .from('community_likes')
    .select('post_id')
    .eq('post_id', post_id)
    .eq('staff_id', staff_id)
    .maybeSingle()

  if (existing) {
    // Unlike
    await supabaseAdmin.from('community_likes').delete().eq('post_id', post_id).eq('staff_id', staff_id)
    await supabaseAdmin.rpc('decrement_community_likes', { p_post_id: post_id })
    return NextResponse.json({ liked: false })
  } else {
    // Like
    await supabaseAdmin.from('community_likes').insert({ post_id, staff_id })
    await supabaseAdmin.rpc('increment_community_likes', { p_post_id: post_id })
    return NextResponse.json({ liked: true })
  }
}
