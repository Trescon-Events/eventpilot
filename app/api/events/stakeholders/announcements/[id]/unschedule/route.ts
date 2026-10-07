import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { PostizError } from '@/app/lib/postiz'
import { PublishValidationError } from '@/app/lib/events/postiz-publish'
import { cancelScheduledPost } from '@/app/lib/events/postiz-unschedule'

/* POST /api/events/stakeholders/announcements/[id]/unschedule
   Cancels a still-future scheduled post: removes it from Postiz on every channel and puts the announcement back to
   ready-to-publish (approvals untouched). Same permission as scheduling (sae.announcements.publish). Refused once the
   post is due / being delivered. Emails the person who cancelled and whoever had scheduled it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: a } = await supabaseAdmin.from('stakeholder_announcements').select('event_id').eq('id', id).single()
  if (!a) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, a.event_id, 'sae.announcements.publish'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  try {
    return NextResponse.json(await cancelScheduledPost(id, session?.sid))
  } catch (e) {
    if (e instanceof PublishValidationError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof PostizError ? e.message : 'Could not cancel the schedule.' }, { status: 502 })
  }
}
