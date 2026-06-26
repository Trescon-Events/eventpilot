import { NextRequest, NextResponse } from 'next/server'
import { publishPost } from '@/app/lib/content-publish'

export const maxDuration = 30

/* POST /api/content/publish
   Body: { post_id, event_id }
   Publishes an approved post to its platform using the event's stored social account token.
*/
export async function POST(req: NextRequest) {
  const { post_id, event_id } = await req.json().catch(() => ({}))
  if (!post_id || !event_id) return NextResponse.json({ error: 'post_id and event_id required' }, { status: 400 })

  const result = await publishPost(post_id, event_id)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, dummy: result.dummy, external_post_id: result.externalPostId })
}
