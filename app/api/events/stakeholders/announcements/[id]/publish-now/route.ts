import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { schedulePostizPost, PostizError } from '@/app/lib/postiz'

/* POST /api/events/stakeholders/announcements/[id]/publish-now
   Body: { platforms: string[] }
   Same as schedule, but omits scheduledFor for immediate publish via Postiz. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { platforms?: string[] } | null
  if (!body?.platforms?.length) {
    return NextResponse.json({ error: 'platforms required' }, { status: 400 })
  }

  const { data: announcement, error: annErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('*, event:event_id(postiz_profile_key)')
    .eq('id', id)
    .single()
  if (annErr || !announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  if (announcement.status !== 'approved' && announcement.status !== 'approved_with_comments') {
    return NextResponse.json({ error: `Cannot publish an announcement with status '${announcement.status}' — must be approved first` }, { status: 422 })
  }

  const event = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event
  if (!event?.postiz_profile_key) {
    return NextResponse.json({ error: 'This event has no Postiz Profile Key configured' }, { status: 422 })
  }

  try {
    const { postizPostId } = await schedulePostizPost({
      profileKey: event.postiz_profile_key,
      content: announcement.post_copy ?? '',
      platforms: body.platforms,
      mediaUrl: announcement.creative_url,
      scheduledFor: null,
    })

    // Postiz accepting the request confirms it was queued, not that it's
    // actually live on every platform yet — status stays 'scheduled' (with
    // scheduled_for = now) so the same sync-status cron that confirms
    // scheduled posts also confirms this one, rather than optimistically
    // marking it published before Postiz has actually delivered it.
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('stakeholder_announcements')
      .update({
        status: 'scheduled',
        scheduled_for: now,
        platforms: body.platforms,
        postiz_post_id: postizPostId,
        updated_at: now,
      })
      .eq('id', id)
      .select('id, status, scheduled_for, postiz_post_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof PostizError ? e.message : 'Failed to publish via Postiz'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
