import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { listPostizPostsInRange, type PostizPostSummary } from '@/app/lib/postiz'
import { resolveChannelResults } from '@/app/lib/events/postiz-publish'

/* GET /api/cron/announcements/sync-status
   cron-job.org, every 15 minutes, Authorization: Bearer CRON_SECRET.
   For every 'scheduled' announcement past its scheduled_for, checks Postiz
   and marks published/failed. Matches this repo's existing cron auth
   convention (see app/api/cron/content-analytics/route.ts).

   2026-08-16 rewrite: the real Postiz public API has no per-post status
   lookup, only GET /posts?from=&to= (a date-range LIST) — and a 30
   requests/hour rate limit, which the original one-call-per-due-row design
   would blow through with more than a few posts in flight. Batches instead:
   one listPostizPostsInRange call per EVENT per run (grouped by
   postiz_profile_key), covering every due announcement for that event in
   a single request. A post can target several channels at once (see
   publish_results, keyed by Postiz integration id) — the announcement only
   flips to a terminal status once every one of its channels has resolved
   (no channel still 'QUEUE'), matching the real multi-channel shape rather
   than the old single-postiz_post_id assumption. */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: due, error } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('id, scheduled_for, publish_results, event:event_id(id, name, postiz_profile_key), creator:created_by(email)')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .not('publish_results', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ checked: 0, published: 0, failed: 0 })

  // Group due rows by event so each event's Postiz workspace is queried
  // exactly once this run, regardless of how many announcements are due.
  const byEvent = new Map<string, { profileKey: string; id: string; name: string; rows: typeof due }>()
  for (const row of due) {
    const event = Array.isArray(row.event) ? row.event[0] : row.event
    if (!event?.postiz_profile_key) continue
    const bucket = byEvent.get(event.postiz_profile_key) ?? { profileKey: event.postiz_profile_key, id: event.id, name: event.name, rows: [] as typeof due }
    bucket.rows.push(row)
    byEvent.set(event.postiz_profile_key, bucket)
  }

  let publishedCount = 0
  let failedCount = 0

  for (const { profileKey, id: eventId, name, rows } of byEvent.values()) {
    const earliestScheduled = rows.reduce((min, r) => (r.scheduled_for! < min ? r.scheduled_for! : min), rows[0].scheduled_for!)
    let posts: PostizPostSummary[]
    try {
      posts = await listPostizPostsInRange(earliestScheduled, new Date().toISOString(), profileKey)
    } catch (e) {
      console.error(`Postiz posts list failed for event "${name}":`, e)
      continue
    }
    for (const row of rows) {
      const results = (row.publish_results ?? {}) as Record<string, { success: boolean; postId: string; state?: string; url?: string }>
      const channelIds = Object.keys(results)
      if (channelIds.length === 0) continue

      const { updatedResults, anyQueue, anyError } = resolveChannelResults(results, posts)

      if (anyQueue) {
        // Still in flight on at least one channel — leave as 'scheduled',
        // just refresh the per-channel state detail for the UI.
        await supabaseAdmin.from('stakeholder_announcements').update({ publish_results: updatedResults, updated_at: new Date().toISOString() }).eq('id', row.id)
        continue
      }

      if (anyError) {
        await supabaseAdmin
          .from('stakeholder_announcements')
          .update({ status: 'failed', publish_results: updatedResults, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        failedCount++
        await notifyMMOfFailure(row, { id: eventId, name }).catch(e => console.error('Failure notification failed:', e))
      } else {
        await supabaseAdmin
          .from('stakeholder_announcements')
          .update({ status: 'published', published_at: new Date().toISOString(), publish_results: updatedResults, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        publishedCount++
      }
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
           <p><a href="${siteUrl}/admin/events/${event.id}/creative-templates" style="color:#00695C">Review in EventPilot →</a></p>`,
    /* eslint-enable no-restricted-syntax */
  })
}
