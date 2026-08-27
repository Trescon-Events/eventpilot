import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* POST /api/events/stakeholders/announcements/[id]/confirm-tagging
   Body: { confirmed: boolean }
   Per Madhu (2026-08-27): tagging speakers/companies on each platform has
   to happen manually (no platform exposes a usable tagging API here) — one
   checkbox that is BOTH the real "I did it" confirmation and the bypass
   for when there's nothing to tag. There is no separate bypass control;
   checking it for any reason is what unlocks the internal/external notify
   step (a hard gate — the notify routes below re-check this server-side,
   not just the UI). Toggleable like the approval bypass checkboxes, for
   an honest undo if checked by mistake. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { confirmed?: boolean } | null
  if (typeof body?.confirmed !== 'boolean') {
    return NextResponse.json({ error: 'confirmed (boolean) required' }, { status: 400 })
  }

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('event_id').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const row = {
    tagging_confirmed_at: body.confirmed ? new Date().toISOString() : null,
    tagging_confirmed_by: body.confirmed ? session!.sid : null,
  }
  const { error } = await supabaseAdmin.from('stakeholder_announcements').update(row).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...row })
}
