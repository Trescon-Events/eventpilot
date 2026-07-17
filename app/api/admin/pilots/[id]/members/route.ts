import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

/* POST /api/admin/pilots/[id]/members
   Admin-session-only. Adds one staff member to an existing pilot project —
   the edit-time counterpart to the members[] array in the create wizard
   (app/admin/pilots/new/page.tsx / POST /api/admin/pilots). Not an upsert:
   if the person is already a member, use PATCH
   /api/admin/pilots/[id]/members/[staffId] to change their role/grants instead.

   Body: { staff_id, role, role_label?, role_color?, tool_grants?: string[] }
   tool_grants are merged into staff_members.tool_grants the same additive,
   true-only way POST /api/admin/pilots does — this never revokes an
   existing grant, it only ever adds new ones.
*/
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id: projectId } = await params
  const body = await req.json().catch(() => null)
  const staffId = body?.staff_id
  const role = body?.role?.trim?.()
  if (!staffId || !role) return NextResponse.json({ error: 'staff_id and role are required' }, { status: 400 })

  const { data: project } = await supabaseAdmin.from('pilot_projects').select('id').eq('id', projectId).single()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, tool_grants')
    .eq('id', staffId)
    .single()
  if (staffErr || !staff) return NextResponse.json({ error: 'Unknown staff_id' }, { status: 400 })

  const { data: existingMember } = await supabaseAdmin
    .from('pilot_project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('staff_id', staffId)
    .maybeSingle()
  if (existingMember) {
    return NextResponse.json({ error: 'Already a member of this project — use PATCH to edit their role or grants' }, { status: 409 })
  }

  const { data: member, error: memErr } = await supabaseAdmin
    .from('pilot_project_members')
    .insert({
      project_id: projectId, staff_id: staffId,
      role, role_label: body.role_label || role, role_color: body.role_color || '#374151',
    })
    .select()
    .single()
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  const toolGrants: string[] = Array.isArray(body.tool_grants) ? body.tool_grants : []
  if (toolGrants.length) {
    const merged = { ...(staff.tool_grants ?? {}) }
    for (const key of toolGrants) merged[key] = true
    const { error: grantErr } = await supabaseAdmin.from('staff_members').update({ tool_grants: merged }).eq('id', staffId)
    if (grantErr) return NextResponse.json({ member, staff: { ...staff, tool_grants: staff.tool_grants }, grant_error: grantErr.message })
  }

  return NextResponse.json({ member })
}
