import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'
import { auditOwner, scopeOfRow } from '@/app/lib/ops/scope'
import { canManageSectionAccess } from '@/app/lib/ops/section-access'
import { knownStaffId } from '@/app/lib/badges/service'

/* DELETE /api/events/operations/section-assignments/[assignmentId] — un-assign. Needs ops.access.manage (admins always). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const { data: row } = await supabaseAdmin.from('ops_section_assignments').select('id, event_id, umbrella_id, section, staff_id').eq('id', assignmentId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })
  const scope = await scopeOfRow(row)
  if (!scope) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })
  const session = getSession(req)
  if (!(await canManageSectionAccess(session, scope))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { error } = await supabaseAdmin.from('ops_section_assignments').delete().eq('id', assignmentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logOpsAccess({ ...auditOwner(scope), actorType: 'staff', actorId: await knownStaffId(session?.sid), action: 'ops_section_unassigned', targetType: 'ops_section', targetId: assignmentId, meta: { section: row.section, staff_id: row.staff_id }, ip: clientIp(req) })
  return NextResponse.json({ ok: true })
}
