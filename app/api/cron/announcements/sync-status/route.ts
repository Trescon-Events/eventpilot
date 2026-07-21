import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getPostizPostStatus } from '@/app/lib/postiz'

/* GET /api/cron/announcements/sync-status
   cron-job.org, every 15 minutes, Authorization: Bearer CRON_SECRET.
   For every 'scheduled' announcement past its scheduled_for, checks Postiz
   and marks published/failed. Matches this repo's existing cron auth
   convention (see app/api/cron/content-analytics/route.ts). */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: due, error } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('id, postiz_post_id, scheduled_for, event:event_id(id, name, postiz_profile_key), creator:created_by(email)')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .not('postiz_post_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ checked: 0, published: 0, failed: 0 })

  let publishedCount = 0
  let failedCount = 0

  for (const row of due) {
    const event = Array.isArray(row.event) ? row.event[0] : row.event
    if (!event?.postiz_profile_key || !row.postiz_post_id) continue

    try {
      const { status, raw } = await getPostizPostStatus(event.postiz_profile_key, row.postiz_post_id)

      if (status === 'published' || status === 'success' || status === 'posted') {
        await supabaseAdmin
          .from('stakeholder_announcements')
          .update({ status: 'published', published_at: new Date().toISOString(), publish_results: raw, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        publishedCount++
      } else if (status === 'failed' || status === 'error') {
        await supabaseAdmin
          .from('stakeholder_announcements')
          .update({ status: 'failed', publish_results: raw, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        failedCount++
        await notifyMMOfFailure(row, event).catch(e => console.error('Failure notification failed:', e))
      }
      // any other status (e.g. still in_progress/queued): leave as 'scheduled', check again next run
    } catch (e) {
      console.error(`Postiz status check failed for announcement ${row.id}:`, e)
    }
  }

  return NextResponse.json({ checked: due.length, published: publishedCount, failed: failedCount })
}

type DueRow = { id: string; creator: { email: string } | { email: string }[] | null }
type EventInfo = { id: string; name: string }

async function notifyMMOfFailure(row: DueRow, event: EventInfo) {
  if (!process.env.RESEND_API_KEY) return
  const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator
  if (!creator?.email) return

  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'

  await resend.emails.send({
    from,
    to: creator.email,
    subject: `Publish failed: announcement for ${event.name}`,
    /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches app/api/content/posts/[id]/approve/route.ts's existing convention) */
    html: `<p style="font-family:sans-serif;font-size:14px;color:#2D3E50">
             Postiz reported a publishing failure for an announcement scheduled for ${event.name}. Please check the post and try again.
           </p>
           <p><a href="${siteUrl}/admin/events/${event.id}/stakeholders" style="color:#00695C">Review in EventPilot →</a></p>`,
    /* eslint-enable no-restricted-syntax */
  })
}
