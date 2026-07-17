import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

/* GET /api/pilots
   - Admins: all projects with all members + all checklist items
   - Others: only projects the user is a member of, with only their checklist items
*/
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: projects, error: projErr } = await supabaseAdmin
    .from('pilot_projects')
    .select('*')
    .order('created_at', { ascending: true })

  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 })

  const { data: members } = await supabaseAdmin
    .from('pilot_project_members')
    .select('*')

  // tool_grants is only ever included in the response when the caller is an
  // admin (stripped below for non-admins) — it's needed by the admin Manage
  // Members UI to show/edit each member's current per-project grant state,
  // but non-admins already only see their own project memberships, so there's
  // no separate access check needed here beyond the existing admin/member gate.
  const { data: staffRows } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, role, department, tool_grants')

  const staffMap = Object.fromEntries((staffRows ?? []).map(s => [s.id, s]))

  const { data: allItems } = await supabaseAdmin
    .from('pilot_checklist_items')
    .select('*')
    .order('sort_order', { ascending: true })

  const result = (projects ?? []).map(p => {
    const projectMembers = (members ?? [])
      .filter(m => m.project_id === p.id)
      .map(m => {
        const staff = staffMap[m.staff_id] ?? null
        if (staff && !session.adm) {
          const { tool_grants: _tool_grants, ...staffWithoutGrants } = staff
          return { ...m, staff: staffWithoutGrants }
        }
        return { ...m, staff }
      })

    const isMember = projectMembers.some(m => m.staff_id === session.sid)
    if (!session.adm && !isMember) return null

    const projectItems = (allItems ?? []).filter(i => i.project_id === p.id)

    // Non-admins only see their own checklist items
    const visibleItems = session.adm
      ? projectItems.map(i => ({ ...i, staff: staffMap[i.assigned_to] ?? null }))
      : projectItems
          .filter(i => i.assigned_to === session.sid)
          .map(i => ({ ...i, staff: staffMap[i.assigned_to] ?? null }))

    const myRole = projectMembers.find(m => m.staff_id === session.sid)?.role ?? null

    return { ...p, members: projectMembers, checklist: visibleItems, myRole }
  }).filter(Boolean)

  return NextResponse.json({ projects: result })
}
