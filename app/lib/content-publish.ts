/**
 * Shared content publishing logic
 * Used by: /api/content/publish (manual) and /api/cron/content-publish (scheduled)
 */

import { supabaseAdmin } from '@/app/lib/supabase'

type Post = { id: string; platform: string; text: string; image_url: string | null; status: string }
type Account = { platform: string; page_id: string; access_token: string }

export async function publishPost(postId: string, eventId: string): Promise<{ success: boolean; externalPostId: string | null; error: string | null; dummy: boolean }> {
  // Load post
  const { data: post, error: postErr } = await supabaseAdmin
    .from('content_posts')
    .select('id, platform, text, image_url, status, scheduled_date, scheduled_time')
    .eq('id', postId)
    .single()

  if (postErr || !post) return { success: false, externalPostId: null, error: 'Post not found', dummy: false }
  if (post.status !== 'approved') return { success: false, externalPostId: null, error: 'Only approved posts can be published', dummy: false }

  // Load social account
  const { data: account } = await supabaseAdmin
    .from('event_social_accounts')
    .select('platform, page_id, access_token')
    .eq('event_id', eventId)
    .eq('platform', post.platform)
    .single()

  const isDummy = !account?.access_token || account.access_token.startsWith('DUMMY')
  let externalPostId: string | null = null

  if (isDummy) {
    await new Promise(r => setTimeout(r, 500))
    externalPostId = `dummy_${Date.now()}`
  } else {
    try {
      if (post.platform === 'Facebook' || post.platform === 'Instagram') {
        externalPostId = await publishToMeta(post, account)
      } else if (post.platform === 'LinkedIn') {
        externalPostId = await publishToLinkedIn(post, account)
      } else if (post.platform === 'Twitter') {
        externalPostId = await publishToTwitter(post, account)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Publish failed'
      await supabaseAdmin.from('content_posts').update({ publish_error: msg }).eq('id', postId)
      return { success: false, externalPostId: null, error: msg, dummy: false }
    }
  }

  // Mark as posted
  await supabaseAdmin
    .from('content_posts')
    .update({
      status: 'posted',
      published_at: new Date().toISOString(),
      external_post_id: externalPostId,
      publish_error: null,
    })
    .eq('id', postId)

  return { success: true, externalPostId, error: null, dummy: isDummy }
}

// ── Meta (Facebook + Instagram) ─────────────────────────────────────────────
async function publishToMeta(post: Post, account: Account): Promise<string> {
  const { page_id, access_token } = account

  if (post.image_url) {
    const res = await fetch(`https://graph.facebook.com/v19.0/${page_id}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: post.image_url, message: post.text, access_token }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message ?? 'Meta photo post failed')
    return data.post_id ?? data.id
  }

  const res = await fetch(`https://graph.facebook.com/v19.0/${page_id}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: post.text, access_token }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? 'Meta post failed')
  return data.id
}

// ── LinkedIn ────────────────────────────────────────────────────────────────
async function publishToLinkedIn(post: Post, account: Account): Promise<string> {
  const { page_id, access_token } = account

  const body: Record<string, unknown> = {
    author: `urn:li:organization:${page_id}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: post.text },
        shareMediaCategory: post.image_url ? 'IMAGE' : 'NONE',
        ...(post.image_url ? {
          media: [{ status: 'READY', originalUrl: post.image_url, title: { text: '' } }]
        } : {}),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? 'LinkedIn post failed')
  return data.id
}

// ── Twitter/X ───────────────────────────────────────────────────────────────
async function publishToTwitter(post: Post, account: Account): Promise<string> {
  const { access_token } = account

  // Twitter API v2 — create tweet
  const tweetBody: Record<string, unknown> = { text: post.text }

  // If image, upload media first via v1.1 endpoint
  if (post.image_url) {
    try {
      // Download image to get binary
      const imgRes = await fetch(post.image_url)
      const imgBuffer = await imgRes.arrayBuffer()
      const imgBase64 = Buffer.from(imgBuffer).toString('base64')

      // Upload media
      const mediaRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `media_data=${encodeURIComponent(imgBase64)}`,
      })
      const mediaData = await mediaRes.json()
      if (mediaData.media_id_string) {
        tweetBody.media = { media_ids: [mediaData.media_id_string] }
      }
    } catch {
      // Image upload failed — post text only
      console.error('Twitter media upload failed, posting text only')
    }
  }

  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify(tweetBody),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail ?? data.title ?? 'Twitter post failed')
  return data.data?.id ?? data.id
}
