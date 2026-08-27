import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { PostizError } from '@/app/lib/postiz'
import { checkAnnouncementPublishStatus, PublishValidationError } from '@/app/lib/events/postiz-publish'

/* POST /api/events/stakeholders/announcements/[id]/publish-check
   On-demand status check for the live "Post Now" progress modal — checks
   Postiz right now instead of waiting for the 15-min sync-status cron.
   Called repeatedly (every few seconds) while the modal is open; a no-op
   once the announcement is already terminal (published/failed). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: existing } = await supabaseAdmin.from('stakeholder_announcements').select('event_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, existing.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  try {
    const data = await checkAnnouncementPublishStatus(id)
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof PublishValidationError) return NextResponse.json({ error: e.message }, { status: e.status })
    const message = e instanceof PostizError ? e.message : 'Could not check publish status'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
