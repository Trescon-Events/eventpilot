import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET /api/events/stakeholders/announcements/[id]/external-approval-cc

   Per-person status for the CURRENT (most recent) External Approval
   round's CC'd recipients (an assistant, office, etc. — each with their
   own review link since 2026-09-22, see announcement_external_approval_cc's
   migration doc comment). Exact twin of client-approval-cc/route.ts. */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('event_id').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.stakeholders.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: latestRound } = await supabaseAdmin
    .from('announcement_approvals')
    .select('id')
    .eq('announcement_id', id)
    .eq('layer', 'external')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestRound) return NextResponse.json({ cc: [] })

  const { data: cc, error } = await supabaseAdmin
    .from('announcement_external_approval_cc')
    .select('id, name, email, status, comments, actioned_at, notified_at')
    .eq('parent_approval_id', latestRound.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ cc: cc ?? [] })
}
