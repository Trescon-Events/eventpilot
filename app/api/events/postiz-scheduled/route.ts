import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { listPostizPostsInRange } from '@/app/lib/postiz'

/* GET /api/events/postiz-scheduled?event_id=X&channel_ids=id1,id2
   "What else is already scheduled on these channels" (2026-08-27, per
   Madhu — a real producer-flagged need: avoid clashing with other posts
   when picking a time to schedule a new one). Read-only, no write path.

   Window is fixed at "now minus 14 days through +90 days" rather than
   centered on whatever date the producer has typed so far — a
   datetime-local input has no default value, so there's nothing to center
   on until they've already picked something, and showing the fuller
   landscape up front is more useful for actually choosing a good time
   than only reacting after a pick.

   Fixed 2026-08-28 (real bug, caught live): the start bound used to be
   exactly "now" — a post published earlier THIS SAME morning already has
   a publishDate before "now" by the time this loads, so Postiz's own
   date-range filter silently excluded it even though the week-calendar's
   own Today column should show it (confirmed live: Postiz's own calendar
   showed the post, EventPilot's didn't). The 14-day lookback comfortably
   covers "this week, including earlier today" and one page-back on the
   calendar's prev-week button, without turning this into an unbounded
   historical query. Channel filtering happens client-side against
   `integration.id`, since Postiz's own GET /posts has no per-channel
   filter param (only date range + `customer`, confirmed against their
   public docs). */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const channelIdsParam = req.nextUrl.searchParams.get('channel_ids')
  if (!eventId || !channelIdsParam) return NextResponse.json({ error: 'event_id and channel_ids required' }, { status: 400 })
  const channelIds = new Set(channelIdsParam.split(',').map(s => s.trim()).filter(Boolean))
  if (channelIds.size === 0) return NextResponse.json({ posts: [] })

  const { data: event } = await supabaseAdmin.from('events').select('postiz_profile_key').eq('id', eventId).single()

  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  let posts
  try {
    posts = await listPostizPostsInRange(startDate, endDate, event?.postiz_profile_key || undefined)
  } catch (e) {
    // Best-effort — a Postiz hiccup shouldn't block the scheduling UI from
    // rendering, it just means "can't show other scheduled posts right now."
    console.error('[postiz-scheduled] listPostizPostsInRange failed:', e)
    return NextResponse.json({ posts: [], error: 'Could not load other scheduled posts right now.' })
  }

  const relevant = posts
    .filter(p => p.integration?.id && channelIds.has(p.integration.id) && p.state !== 'ERROR')
    .map(p => ({
      id: p.id,
      channel_id: p.integration!.id,
      channel_name: p.integration!.name,
      // 2026-08-28 — the calendar renders a stable per-platform icon/color
      // instead of an arbitrary index-based color (see PostizCalendar.tsx's
      // own comment for the bug that caused), which needs the actual
      // platform type, not just the channel's display name.
      channel_identifier: p.integration!.providerIdentifier,
      channel_picture: p.integration!.picture ?? null,
      state: p.state,
      publish_date: p.publishDate ?? null,
      content_preview: (p.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
    }))
    .sort((a, b) => (a.publish_date ?? '').localeCompare(b.publish_date ?? ''))

  return NextResponse.json({ posts: relevant })
}
