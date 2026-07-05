import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/bd-workspaces/members?workspace_id=uuid */
export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspace_id')
  if (!workspaceId) return NextResponse.json({ error: 'workspace_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('bd_workspace_members')
    .select('id, role, added_at, staff_members(id, name, email, department)')
    .eq('workspace_id', workspaceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/* POST /api/bd-workspaces/members — add a member
   Body: { workspace_id, staff_id, role? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.workspace_id || !body?.staff_id) {
    return NextResponse.json({ error: 'workspace_id and staff_id required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('bd_workspace_members')
    .upsert(
      { workspace_id: body.workspace_id, staff_id: body.staff_id, role: body.role || 'member' },
      { onConflict: 'workspace_id,staff_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/* DELETE /api/bd-workspaces/members?workspace_id=uuid&staff_id=uuid */
export async function DELETE(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspace_id')
  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!workspaceId || !staffId) return NextResponse.json({ error: 'workspace_id and staff_id required' }, { status: 400 })

  await supabaseAdmin.from('bd_workspace_members').delete().eq('workspace_id', workspaceId).eq('staff_id', staffId)
  return NextResponse.json({ success: true })
}
