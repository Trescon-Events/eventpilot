import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

/* PATCH /api/admin/pilots/[id]/members/[staffId]
   Admin-session-only. Updates an existing membership's role/label/color, and/or
   adds to that staff member's tool_grants (additive merge — same pattern as
   POST /api/admin/pilots and POST /api/admin/pilots/[id]/members — never revokes).

   Body: any subset of { role, role_label, role_color, tool_grants: string[] }
*/
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; staffId: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id: projectId, staffId } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('pilot_project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('staff_id', staffId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })

  const memberUpdate: Record<string, unknown> = {}
  if (body.role !== undefined) {
    if (!String(body.role).trim()) return NextResponse.json({ error: 'role cannot be empty' }, { status: 400 })
    memberUpdate.role = String(body.role).trim()
  }
  if (body.role_label !== undefined) memberUpdate.role_label = body.role_label || null
  if (body.role_color !== undefined) memberUpdate.role_color = body.role_color || null

  let updatedMember = null
  if (Object.keys(memberUpdate).length) {
    const { data, error } = await supabaseAdmin
      .from('pilot_project_members')
      .update(memberUpdate)
      .eq('project_id', projectId)
      .eq('staff_id', staffId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    updatedMember = data
  }

  let grantError: string | null = null
  const toolGrants: string[] = Array.isArray(body.tool_grants) ? body.tool_grants : []
  if (toolGrants.length) {
    const { data: staff } = await supabaseAdmin.from('staff_members').select('tool_grants').eq('id', staffId).single()
    const merged = { ...(staff?.tool_grants ?? {}) }
    for (const key of toolGrants) merged[key] = true
    const { error } = await supabaseAdmin.from('staff_members').update({ tool_grants: merged }).eq('id', staffId)
    if (error) grantError = error.message
  }

  if (!updatedMember) {
    const { data } = await supabaseAdmin
      .from('pilot_project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('staff_id', staffId)
      .single()
    updatedMember = data
  }

  return NextResponse.json({ member: updatedMember, ...(grantError ? { grant_error: grantError } : {}) })
}

/* DELETE /api/admin/pilots/[id]/members/[staffId]
   Admin-session-only. Removes the membership row. tool_grants live purely on
   staff_members (JSONB), completely decoupled from project membership, so
   removing someone from a project does NOT automatically revoke anything —
   there's no reliable way to know which grants were "for this project" vs.
   needed elsewhere. Revoking is opt-in and explicit: pass
   { revoke_grant_keys: string[] } in the body naming exactly which
   tool_grants keys to unset (set to false) on this staff member. Omit the
   body (or the field) to just remove them from the project untouched.
*/
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; staffId: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id: projectId, staffId } = await params
  const body = await req.json().catch(() => ({}))
  const revokeKeys: string[] = Array.isArray(body?.revoke_grant_keys) ? body.revoke_grant_keys : []

  const { data: existing } = await supabaseAdmin
    .from('pilot_project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('staff_id', staffId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })

  const { error: delErr } = await supabaseAdmin
    .from('pilot_project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('staff_id', staffId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  let revoked: string[] = []
  if (revokeKeys.length) {
    const { data: staff } = await supabaseAdmin.from('staff_members').select('tool_grants').eq('id', staffId).single()
    const current = { ...(staff?.tool_grants ?? {}) }
    for (const key of revokeKeys) current[key] = false
    const { error: grantErr } = await supabaseAdmin.from('staff_members').update({ tool_grants: current }).eq('id', staffId)
    if (grantErr) return NextResponse.json({ success: true, removed: true, grant_error: grantErr.message })
    revoked = revokeKeys
  }

  return NextResponse.json({ success: true, removed: true, revoked })
}
