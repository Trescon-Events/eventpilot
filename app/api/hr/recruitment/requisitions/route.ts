import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/hr/recruitment/requisitions           — list all
   GET  /api/hr/recruitment/requisitions?id=uuid  — single
   POST /api/hr/recruitment/requisitions           — create
   PATCH /api/hr/recruitment/requisitions          — update status/fields */

export async function GET(req: NextRequest) {
  const id     = req.nextUrl.searchParams.get('id')
  const status = req.nextUrl.searchParams.get('status') // open | paused | closed | filled

  if (id) {
    const { data, error } = await supabaseAdmin
      .from('job_requisitions')
      .select('*, hiring_manager:hiring_manager_id(id, name, department)')
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  let q = supabaseAdmin
    .from('job_requisitions')
    .select('*, hiring_manager:hiring_manager_id(id, name, department)')
    .order('created_at', { ascending: false })

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('job_requisitions')
    .insert({
      title:              body.title,
      department:         body.department ?? null,
      location:           body.location ?? null,
      employment_type:    body.employment_type ?? 'full_time',
      headcount:          body.headcount ?? 1,
      description:        body.description ?? null,
      requirements:       body.requirements ?? null,
      salary_min:         body.salary_min ?? null,
      salary_max:         body.salary_max ?? null,
      currency:           body.currency ?? 'AED',
      hiring_manager_id:  body.hiring_manager_id ?? null,
      status:             'open',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { id, ...fields } = body
  const { data, error } = await supabaseAdmin
    .from('job_requisitions')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
