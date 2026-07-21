// Postiz Cloud client (platform.postiz.com) — a single global API key plus
// a per-event workspace key (X-Profile-Key), shared by the schedule,
// publish-now, and sync-status routes. Not self-hosted — PRD v1.3 replaced
// the earlier self-hosted-on-Railway plan with the managed Cloud Team plan
// before any of this was built, so there's no deployment/networking
// concern here, just a normal external API call.

export class PostizError extends Error {}

function requireEnv() {
  const apiUrl = process.env.POSTIZ_API_URL
  const apiKey = process.env.POSTIZ_API_KEY
  if (!apiUrl || !apiKey) throw new PostizError('POSTIZ_API_URL / POSTIZ_API_KEY not configured')
  return { apiUrl, apiKey }
}

export type SchedulePostParams = {
  profileKey: string
  content: string
  platforms: string[]      // e.g. ['LinkedIn', 'Instagram'] — lowercased before sending
  mediaUrl: string | null
  scheduledFor?: string | null  // ISO datetime; omit/null for immediate publish
}

export async function schedulePostizPost(params: SchedulePostParams): Promise<{ postizPostId: string }> {
  const { apiUrl, apiKey } = requireEnv()

  const res = await fetch(`${apiUrl}/api/v1/posts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Profile-Key': params.profileKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: params.content,
      platforms: params.platforms.map(p => p.toLowerCase()),
      ...(params.scheduledFor ? { date: params.scheduledFor } : {}),
      ...(params.mediaUrl ? { media: [{ url: params.mediaUrl }] } : {}),
    }),
  })

  if (!res.ok) throw new PostizError(`Postiz error: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json() as { id: string }
  return { postizPostId: data.id }
}

export async function getPostizPostStatus(profileKey: string, postizPostId: string): Promise<{ status: string; raw: unknown }> {
  const { apiUrl, apiKey } = requireEnv()

  const res = await fetch(`${apiUrl}/api/v1/posts/${postizPostId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Profile-Key': profileKey },
  })
  if (!res.ok) throw new PostizError(`Postiz status check failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json() as { status?: string }
  return { status: data.status ?? 'unknown', raw: data }
}
