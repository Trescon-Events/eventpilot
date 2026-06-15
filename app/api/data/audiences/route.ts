import { smartdataAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET  /api/data/audiences              — list all saved audiences
   POST /api/data/audiences              — create saved audience
   DELETE /api/data/audiences?id=<uuid> — delete saved audience
*/

export async function GET() {
  const { data, error } = await smartdataAdmin
    .from('sd_saved_audiences')
    .select('id, name, description, results_count, last_run_at, created_at, updated_at, final_icp_json')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name, description, final_icp_json } = await req.json().catch(() => ({}))

  if (!name?.trim())     return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!final_icp_json)   return NextResponse.json({ error: 'final_icp_json required' }, { status: 400 })

  const { data, error } = await smartdataAdmin
    .from('sd_saved_audiences')
    .insert({
      name:          name.trim(),
      description:   description?.trim() ?? null,
      final_icp_json,
      updated_at:    new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await smartdataAdmin
    .from('sd_saved_audiences')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
