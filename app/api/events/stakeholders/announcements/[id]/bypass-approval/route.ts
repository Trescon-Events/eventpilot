import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* POST /api/events/stakeholders/announcements/[id]/bypass-approval
   Body: { layer: 'internal' | 'external' | 'client', bypassed: boolean }
   Per Madhu (2026-08-26, extended 2026-08-29 with 'client'): a real,
   toggleable "Not required / Reviewed" checkbox per layer — not a one-shot
   button — checkable any time that layer isn't already genuinely approved
   (including while pending or after changes were requested — feedback
   often gets resolved outside the formal loop), and uncheckable as an
   honest undo. Records WHO bypassed/un-bypassed and WHEN — distinct from
   that round having actually happened — rather than silently faking a
   real approval. Never touches stakeholder_announcements.status (internal
   approval's own signal) or the announcement_approvals table; the
   Publishing panel's readiness check treats a bypassed round the same as
   a resolved-approved one, purely at read time, and a bypass always wins
   regardless of what a stale approval response later does (see the
   readiness check's own comment in AnnouncementDetailPanel.tsx). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { layer?: 'internal' | 'external' | 'client'; bypassed?: boolean } | null
  if (body?.layer !== 'internal' && body?.layer !== 'external' && body?.layer !== 'client') {
    return NextResponse.json({ error: "layer must be 'internal', 'external', or 'client'" }, { status: 400 })
  }
  const bypassed = body.bypassed !== false

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('event_id').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const now = bypassed ? new Date().toISOString() : null
  const by = bypassed ? session!.sid : null
  const row = body.layer === 'internal'
    ? { internal_approval_bypassed_by: by, internal_approval_bypassed_at: now }
    : body.layer === 'external'
    ? { external_approval_bypassed_by: by, external_approval_bypassed_at: now }
    : { client_approval_bypassed_by: by, client_approval_bypassed_at: now }

  const { error } = await supabaseAdmin.from('stakeholder_announcements').update(row).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...row })
}
