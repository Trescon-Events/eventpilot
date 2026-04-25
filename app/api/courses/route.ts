import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

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
