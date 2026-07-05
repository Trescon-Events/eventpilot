import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/bd-workspaces — list all workspaces with member + document counts */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('bd_workspaces')
    .select('*, bd_workspace_members(count), documents(count)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/* POST /api/bd-workspaces — create a workspace
   Body: { name, client_name?, client_country?, event_name?, event_type?, created_by? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const slug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const { data, error } = await supabaseAdmin
    .from('bd_workspaces')
    .insert({
      name:           body.name.trim(),
      slug:           slug || null,
      client_name:    body.client_name || null,
      client_country: body.client_country || null,
      event_name:     body.event_name || null,
      event_type:     body.event_type || null,
      created_by:     body.created_by || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/* PATCH /api/bd-workspaces — update status
   Body: { id, status } */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id || !body?.status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('bd_workspaces')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/* DELETE /api/bd-workspaces?id=uuid */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabaseAdmin.from('bd_workspaces').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
