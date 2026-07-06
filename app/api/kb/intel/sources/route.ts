import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

/*
  GET /api/kb/intel/sources
  Params: ?category=press_media&active=true

  POST /api/kb/intel/sources
  Body: { admin_staff_id, name, source_type, category, config, crawl_frequency?, crawl_behaviour? }
*/
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category')
  const active   = req.nextUrl.searchParams.get('active')

  let query = supabaseAdmin.from('kb_intel_sources').select('*').order('category').order('name')
  if (category) query = query.eq('category', category)
  if (active === 'true') query = query.eq('is_active', true)
  if (active === 'false') query = query.eq('is_active', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { admin_staff_id, name, source_type, category, config, crawl_frequency, crawl_behaviour } = body ?? {}

  if (!(await isKbAdmin(admin_staff_id))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  if (!name?.trim() || !source_type || !category || !config) {
    return NextResponse.json({ error: 'name, source_type, category and config are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('kb_intel_sources')
    .insert({
      name: name.trim(),
      source_type,
      category,
      config,
      crawl_frequency: crawl_frequency ?? 'weekly',
      crawl_behaviour: crawl_behaviour ?? 'article_discovery',
      created_by: admin_staff_id === 'super-admin' ? null : admin_staff_id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, source: data })
}
