import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { publishPost } from '@/app/lib/content-publish'

// Cron: Auto-publish approved posts that have reached their scheduled time
// Schedule: Every 15 minutes

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const todayStr = now.toISOString().substring(0, 10) // YYYY-MM-DD
  const timeStr = now.toTimeString().substring(0, 5)   // HH:MM

  // Find approved posts scheduled for now or earlier
  const { data: posts, error } = await supabaseAdmin
    .from('content_posts')
    .select('id, campaign_id, platform, scheduled_date, scheduled_time')
    .eq('status', 'approved')
    .lte('scheduled_date', todayStr)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter by time (posts scheduled for today need time check, past dates publish immediately)
  const readyPosts = (posts || []).filter(p => {
    if (p.scheduled_date < todayStr) return true // past date, publish now
    return (p.scheduled_time || '00:00') <= timeStr // today, check time
  })

  if (readyPosts.length === 0) {
    return NextResponse.json({ message: 'No posts ready to publish', published: 0 })
  }

  // Get campaign → event mapping for each post
  const campaignIds = [...new Set(readyPosts.map(p => p.campaign_id))]
  const { data: campaigns } = await supabaseAdmin
    .from('content_campaigns')
    .select('id, event_id')
    .in('id', campaignIds)

  const campaignEventMap: Record<string, string> = {}
  for (const c of campaigns || []) {
    if (c.event_id) campaignEventMap[c.id] = c.event_id
  }

  let published = 0
  let failed = 0
  const errors: string[] = []

  for (const post of readyPosts) {
    const eventId = campaignEventMap[post.campaign_id]
    if (!eventId) {
      errors.push(`${post.id}: no event linked to campaign`)
      failed++
      continue
    }

    const result = await publishPost(post.id, eventId)
    if (result.success) {
      published++
    } else {
      failed++
      errors.push(`${post.id} (${post.platform}): ${result.error}`)
    }
  }

  return NextResponse.json({
    message: `Published ${published}/${readyPosts.length} posts`,
    published,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  })
}
