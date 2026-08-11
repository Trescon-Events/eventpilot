import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* DELETE /api/events/access/assignments/[assignmentId] — unassign a role
   from a staff member for an event. Platform admin only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { assignmentId } = await params

  const { error } = await supabaseAdmin.from('event_access_assignments').delete().eq('id', assignmentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
