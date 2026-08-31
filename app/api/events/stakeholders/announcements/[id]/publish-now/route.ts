import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { PostizError } from '@/app/lib/postiz'
import { checkCanPublish, publishAnnouncementToPostiz, PublishValidationError } from '@/app/lib/events/postiz-publish'

/* POST /api/events/stakeholders/announcements/[id]/publish-now
   Body: { postiz_channel_ids: string[] }
   Same as schedule, but omits scheduledFor for immediate publish via
   Postiz. Same approval/skip-approval gate — see checkCanPublish.

   Also stamps scheduled_by, same as schedule/route.ts (2026-08-31 — the
   live progress modal this flow shows was assumed to be the only
   confirmation the user needs, but it gives up polling after ~88s and can
   be closed before Postiz confirms; when that happens resolution falls to
   the sync-status cron, whose notify-on-publish email is gated on
   scheduled_by being set. Without this stamp that fallback path notifies
   no one even though the post did go live.) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { postiz_channel_ids?: string[] } | null
  if (!body?.postiz_channel_ids?.length) {
    return NextResponse.json({ error: 'postiz_channel_ids required' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin.from('stakeholder_announcements').select('event_id, status').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const permCheck = await checkCanPublish(req, existing.event_id, id, existing.status)
  if (!permCheck.ok) return NextResponse.json({ error: permCheck.message }, { status: 422 })

  try {
    const data = await publishAnnouncementToPostiz(id, body.postiz_channel_ids, null)
    const session = getSession(req)
    if (session?.sid && session.sid !== 'super-admin') {
      await supabaseAdmin.from('stakeholder_announcements').update({ scheduled_by: session.sid }).eq('id', id)
    }
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof PublishValidationError) return NextResponse.json({ error: e.message }, { status: e.status })
    const message = e instanceof PostizError ? e.message : 'Failed to publish via Postiz'
    console.error('[publish-now] publish failed:', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
