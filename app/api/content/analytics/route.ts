import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET ?post_id=X       — analytics for a single post
// GET ?campaign_id=X   — aggregated analytics for a campaign

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const postId = params.get('post_id')
  const campaignId = params.get('campaign_id')

  if (postId) {
    const { data, error } = await supabaseAdmin
      .from('content_post_analytics')
      .select('*')
      .eq('post_id', postId)
      .order('fetched_at', { ascending: false })
      .limit(10)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (campaignId) {
    // Get all posts for this campaign, then their latest analytics
    const { data: posts } = await supabaseAdmin
      .from('content_posts')
      .select('id, platform, text, status, external_post_id, published_at')
      .eq('campaign_id', campaignId)
      .eq('status', 'posted')

    if (!posts || posts.length === 0) {
      return NextResponse.json({ posts: [], totals: { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0 } })
    }

    const postIds = posts.map(p => p.id)
    const { data: analytics } = await supabaseAdmin
      .from('content_post_analytics')
      .select('*')
      .in('post_id', postIds)
      .order('fetched_at', { ascending: false })

    // Get latest analytics per post
    const latestByPost: Record<string, Record<string, unknown>> = {}
    for (const a of analytics || []) {
      if (!latestByPost[a.post_id]) latestByPost[a.post_id] = a
    }

    const totals = { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0 }
    const enrichedPosts = posts.map(p => {
      const a = latestByPost[p.id]
      if (a) {
        totals.impressions += Number(a.impressions) || 0
        totals.reach += Number(a.reach) || 0
        totals.likes += Number(a.likes) || 0
        totals.comments += Number(a.comments) || 0
        totals.shares += Number(a.shares) || 0
        totals.clicks += Number(a.clicks) || 0
      }
      return { ...p, analytics: a || null }
    })

    return NextResponse.json({ posts: enrichedPosts, totals })
  }

  return NextResponse.json({ error: 'post_id or campaign_id required' }, { status: 400 })
}
