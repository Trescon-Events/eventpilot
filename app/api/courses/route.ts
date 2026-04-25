import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026'

export async function POST(req: NextRequest) {
  const { admin_code, course } = await req.json()
  if (admin_code !== ADMIN_CODE) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!course) return NextResponse.json({ error: 'No course data provided.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert({ ...course, source: 'gemini', status: 'published' })
    .select('id, title, tier_level')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, course: data })
}

export async function GET(req: NextRequest) {
  const tier   = req.nextUrl.searchParams.get('tier')
  const dept   = req.nextUrl.searchParams.get('dept')
  const source = req.nextUrl.searchParams.get('source')

  let query = supabaseAdmin
    .from('courses')
    .select('id, title, subtitle, tool_name, tier_level, dept_tags, is_mandatory, estimated_minutes, overview, source, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (tier && tier !== 'all') query = query.eq('tier_level', tier)
  if (source) query = query.eq('source', source)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dept filter in JS (array contains)
  const filtered = (dept && dept !== 'all')
    ? (data ?? []).filter(c => c.dept_tags.length === 0 || c.dept_tags.includes(dept))
    : data ?? []

  return NextResponse.json(filtered)
}
