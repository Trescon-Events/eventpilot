import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* POST /api/events/stakeholders/announcements/[id]/bypass-approval
   Body: { layer: 'internal' | 'external' }
   Per Madhu (2026-08-26): "let there be an option for the user to bypass
   [internal approval]... similar to internal approval [also for external]".
   Records WHO bypassed a round and WHEN — distinct from that round having
   actually happened — rather than silently faking a real approval. Never
   touches stakeholder_announcements.status (internal approval's own
   signal) or the announcement_approvals table; the Publishing panel's
   readiness check treats a bypassed round the same as a resolved-approved
   one, purely at read time. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { layer?: 'internal' | 'external' } | null
  if (body?.layer !== 'internal' && body?.layer !== 'external') {
    return NextResponse.json({ error: "layer must be 'internal' or 'external'" }, { status: 400 })
  }

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('event_id').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const row = body.layer === 'internal'
    ? { internal_approval_bypassed_by: session!.sid, internal_approval_bypassed_at: now }
    : { external_approval_bypassed_by: session!.sid, external_approval_bypassed_at: now }

  const { error } = await supabaseAdmin.from('stakeholder_announcements').update(row).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...row })
}
