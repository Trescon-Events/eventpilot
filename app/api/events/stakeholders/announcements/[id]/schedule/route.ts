import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { PostizError } from '@/app/lib/postiz'
import { checkCanPublish, publishAnnouncementToPostiz, PublishValidationError } from '@/app/lib/events/postiz-publish'

/* POST /api/events/stakeholders/announcements/[id]/schedule
   Body: { scheduled_for: ISO datetime, postiz_channel_ids: string[] }
   Requires the announcement be approved (approved/approved_with_comments)
   unless the requesting staff member has sae.announcements.publish —
   see checkCanPublish's own comment. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { scheduled_for?: string; postiz_channel_ids?: string[] } | null
  if (!body?.scheduled_for || !body?.postiz_channel_ids?.length) {
    return NextResponse.json({ error: 'scheduled_for and postiz_channel_ids required' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin.from('stakeholder_announcements').select('event_id, status').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const permCheck = await checkCanPublish(req, existing.event_id, existing.status)
  if (!permCheck.ok) return NextResponse.json({ error: permCheck.message }, { status: 422 })

  try {
    const data = await publishAnnouncementToPostiz(id, body.postiz_channel_ids, body.scheduled_for)
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof PublishValidationError) return NextResponse.json({ error: e.message }, { status: e.status })
    const message = e instanceof PostizError ? e.message : 'Failed to schedule via Postiz'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
