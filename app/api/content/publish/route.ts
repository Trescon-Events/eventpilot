import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export const maxDuration = 30

/* POST /api/content/publish
   Body: { post_id, event_id }
   Publishes an approved post to its platform using the event's stored social account token.
   In DUMMY mode (no real token stored), simulates success after 1.5s.
*/
export async function POST(req: NextRequest) {
  const { post_id, event_id } = await req.json().catch(() => ({}))
  if (!post_id || !event_id) return NextResponse.json({ error: 'post_id and event_id required' }, { status: 400 })

  // Load post
  const { data: post, error: postErr } = await supabaseAdmin
    .from('content_posts')
    .select('id, platform, text, image_url, status, scheduled_date, scheduled_time')
    .eq('id', post_id)
    .single()

  if (postErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.status !== 'approved') return NextResponse.json({ error: 'Only approved posts can be published' }, { status: 400 })

  // Load social account for this platform + event
  const { data: account } = await supabaseAdmin
    .from('event_social_accounts')
    .select('platform, page_id, access_token')
    .eq('event_id', event_id)
    .eq('platform', post.platform)
    .single()

  const isDummy = !account?.access_token || account.access_token.startsWith('DUMMY')

  let externalPostId: string | null = null

  if (isDummy) {
    // Simulate publish — 1.5s delay
    await new Promise(r => setTimeout(r, 1500))
    externalPostId = `dummy_${Date.now()}`
  } else {
    // Real publish
    try {
      if (post.platform === 'Facebook' || post.platform === 'Instagram') {
        externalPostId = await publishToMeta(post, account)
      } else if (post.platform === 'LinkedIn') {
        externalPostId = await publishToLinkedIn(post, account)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Publish failed'
      await supabaseAdmin.from('content_posts').update({ publish_error: msg }).eq('id', post_id)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // Mark as posted
  await supabaseAdmin
    .from('content_posts')
    .update({
      status:           'posted',
      published_at:     new Date().toISOString(),
      external_post_id: externalPostId,
      publish_error:    null,
    })
    .eq('id', post_id)

  return NextResponse.json({ ok: true, dummy: isDummy, external_post_id: externalPostId })
}

// ── Meta (Facebook + Instagram) ───────────────────────────────────────────────
async function publishToMeta(post: { text: string; image_url?: string | null }, account: { page_id: string; access_token: string }) {
  const { page_id, access_token } = account

  // If post has image, upload it first
  if (post.image_url) {
    const photoRes = await fetch(`https://graph.facebook.com/v19.0/${page_id}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: post.image_url, message: post.text, access_token }),
    })
    const photoData = await photoRes.json()
    if (!photoRes.ok) throw new Error(photoData.error?.message ?? 'Meta photo post failed')
    return photoData.post_id ?? photoData.id
  }

  // Text-only post
  const res = await fetch(`https://graph.facebook.com/v19.0/${page_id}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: post.text, access_token }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? 'Meta post failed')
  return data.id
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────
async function publishToLinkedIn(post: { text: string; image_url?: string | null }, account: { page_id: string; access_token: string }) {
  const { page_id, access_token } = account

  const body: Record<string, unknown> = {
    author:     `urn:li:organization:${page_id}`,
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
