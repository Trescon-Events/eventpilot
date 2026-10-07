import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { PostizError } from '@/app/lib/postiz'
import { PublishValidationError } from '@/app/lib/events/postiz-publish'
import { rescheduleAnnouncement } from '@/app/lib/events/postiz-unschedule'

/* POST /api/events/stakeholders/announcements/[id]/reschedule   Body: { scheduled_for: ISO datetime }
   Moves a still-future scheduled post to a new time on the same channels (cancel, then schedule again — Postiz can't
   edit a post). Same permission as scheduling. The new time must be at least 5 minutes ahead. Emails the person who
   rescheduled and whoever had scheduled it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { scheduled_for?: string } | null
  if (!body?.scheduled_for) return NextResponse.json({ error: 'scheduled_for required' }, { status: 400 })
  const { data: a } = await supabaseAdmin.from('stakeholder_announcements').select('event_id').eq('id', id).single()
  if (!a) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, a.event_id, 'sae.announcements.publish'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  try {
    return NextResponse.json(await rescheduleAnnouncement(id, body.scheduled_for, session?.sid))
  } catch (e) {
    if (e instanceof PublishValidationError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof PostizError ? e.message : 'Could not reschedule.' }, { status: 502 })
  }
}
