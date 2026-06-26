import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// Cron: Pull engagement metrics for recently published posts
// Schedule: Every 6 hours
// Pulls from Meta Graph API and LinkedIn API for posts published in last 7 days

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Get recently published posts with external IDs
  const { data: posts } = await supabaseAdmin
    .from('content_posts')
    .select('id, platform, external_post_id, campaign_id')
    .eq('status', 'posted')
    .not('external_post_id', 'is', null)
    .gte('published_at', sevenDaysAgo)

  if (!posts || posts.length === 0) {
    return NextResponse.json({ message: 'No recent published posts', fetched: 0 })
  }

  // Get campaign → event → social account mapping
  const campaignIds = [...new Set(posts.map(p => p.campaign_id))]
  const { data: campaigns } = await supabaseAdmin
    .from('content_campaigns')
    .select('id, event_id')
    .in('id', campaignIds)

  const campaignEventMap: Record<string, string> = {}
  for (const c of campaigns || []) {
    if (c.event_id) campaignEventMap[c.id] = c.event_id
  }

  let fetched = 0
  const errors: string[] = []

  for (const post of posts) {
    if (!post.external_post_id || post.external_post_id.startsWith('dummy_')) continue

    const eventId = campaignEventMap[post.campaign_id]
    if (!eventId) continue

    // Get social account token
    const { data: account } = await supabaseAdmin
      .from('event_social_accounts')
      .select('access_token, page_id')
      .eq('event_id', eventId)
      .eq('platform', post.platform)
      .single()

    if (!account?.access_token || account.access_token.startsWith('DUMMY')) continue

    try {
      let analytics = { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0 }

      if (post.platform === 'Facebook' || post.platform === 'Instagram') {
        // Meta Graph API — get post insights
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${post.external_post_id}/insights?metric=post_impressions,post_reach,post_reactions_like_total,post_comments,post_shares&access_token=${account.access_token}`
        )
        const data = await res.json()
        if (data.data) {
          for (const metric of data.data) {
            const val = metric.values?.[0]?.value || 0
            if (metric.name === 'post_impressions') analytics.impressions = val
            else if (metric.name === 'post_reach') analytics.reach = val
            else if (metric.name === 'post_reactions_like_total') analytics.likes = val
            else if (metric.name === 'post_comments') analytics.comments = val
            else if (metric.name === 'post_shares') analytics.shares = val
          }
        }
      } else if (post.platform === 'LinkedIn') {
        // LinkedIn API — get share statistics
        const res = await fetch(
          `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${account.page_id}&shares=List(${post.external_post_id})`,
          { headers: { Authorization: `Bearer ${account.access_token}` } }
        )
        const data = await res.json()
        const stats = data.elements?.[0]?.totalShareStatistics
        if (stats) {
          analytics.impressions = stats.impressionCount || 0
          analytics.clicks = stats.clickCount || 0
          analytics.likes = stats.likeCount || 0
          analytics.comments = stats.commentCount || 0
          analytics.shares = stats.shareCount || 0
        }
      }

      // Calculate engagement rate
      const totalEngagements = analytics.likes + analytics.comments + analytics.shares + analytics.clicks
      const engagementRate = analytics.impressions > 0
        ? Math.round((totalEngagements / analytics.impressions) * 10000) / 100
        : 0

      // Store snapshot
      await supabaseAdmin.from('content_post_analytics').insert({
        post_id: post.id,
        platform: post.platform,
        external_post_id: post.external_post_id,
        ...analytics,
        engagement_rate: engagementRate,
      })

      fetched++
    } catch (e) {
      errors.push(`${post.id} (${post.platform}): ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  return NextResponse.json({
    message: `Fetched analytics for ${fetched}/${posts.length} posts`,
    fetched,
    errors: errors.length > 0 ? errors : undefined,
  })
}
