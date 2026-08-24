// Postiz Cloud client (platform.postiz.com) — rewritten 2026-08-16 against
// the REAL public API (verified directly at docs.postiz.com, since the
// original implementation here turned out not to match it at all once
// checked — see the SAE publishing plan for the full list of
// discrepancies: wrong auth header format, a nonexistent X-Profile-Key
// scoping header, wrong base path, and a post-creation body shape that
// doesn't exist in the real API). Not self-hosted — PRD v1.3 replaced the
// earlier self-hosted-on-Railway plan with the managed Cloud Team plan
// before any of this was built, so there's no deployment/networking
// concern here, just a normal external API call.
//
// STILL UNVERIFIED against a real, live Postiz account — that's blocked
// on Madhu setting one up (Postiz Cloud signup + OAuth-connecting social
// channels + POSTIZ_API_URL/POSTIZ_API_KEY on Railway, currently
// .env.local-only). Built exactly to what docs.postiz.com documents;
// treat the exact `settings` sub-shape per platform, and the shape of
// GET /posts list items specifically, as best-effort pending one real
// spot-check once that account exists (see PostizError below — every
// call fails cleanly and legibly until then, by design).

export class PostizError extends Error {}

function requireEnv() {
  const apiUrl = process.env.POSTIZ_API_URL || 'https://api.postiz.com/public/v1'
  const apiKey = process.env.POSTIZ_API_KEY
  if (!apiKey) throw new PostizError('POSTIZ_API_KEY not configured')
  return { apiUrl, apiKey }
}

// No "Bearer" prefix — docs.postiz.com/public-api: "Authorization: your-api-key".
function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: apiKey }
}

export type PostizIntegration = {
  id: string
  name: string
  identifier: string // platform type — 'linkedin' | 'linkedin-page' | 'x' | 'instagram' | ... (whatever Postiz reports)
  picture: string | null
  disabled: boolean
  profile: string | null
}

// GET /integrations?group={groupId} — "integration" is Postiz's API term
// for what the UI calls a "channel". `groupId` is Postiz's "customer"
// concept — the per-event scoping mechanism, stored in
// events.postiz_profile_key (see that column's own comment for the open
// question about how this maps once Madhu's real multi-event Postiz
// workspace exists).
export async function listPostizIntegrations(groupId?: string): Promise<PostizIntegration[]> {
  const { apiUrl, apiKey } = requireEnv()
  const url = new URL(`${apiUrl}/integrations`)
  if (groupId) url.searchParams.set('group', groupId)
  const res = await fetch(url.toString(), { headers: authHeaders(apiKey) })
  if (!res.ok) throw new PostizError(`Postiz integrations fetch failed: ${res.status} ${await res.text().catch(() => '')}`)
  return await res.json() as PostizIntegration[]
}

// POST /upload-from-url — re-hosts an external image (our creative_url,
// a Supabase-storage PNG) into Postiz's own media store. Required before
// a post can reference it — Postiz's create-post API takes an
// already-uploaded media id/path, not an arbitrary external URL inline.
export async function uploadMediaFromUrl(url: string): Promise<{ id: string; path: string }> {
  const { apiUrl, apiKey } = requireEnv()
  const res = await fetch(`${apiUrl}/upload-from-url`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new PostizError(`Postiz media upload failed: ${res.status} ${await res.text().catch(() => '')}`)
  return await res.json() as { id: string; path: string }
}

// Minimal settings.__type per docs.postiz.com/public-api/posts/create —
// deliberately doesn't populate platform-specific extras (LinkedIn
// carousels, X reply-audience restriction, etc.) since no UI exposes
// those yet; add them here if/when a specific post needs one.
function settingsForIdentifier(identifier: string): Record<string, unknown> {
  return { __type: identifier }
}

export type PostizChannel = { id: string; identifier: string } // enough of PostizIntegration to build a post

export type SchedulePostParams = {
  groupId?: string
  content: string
  channels: PostizChannel[]     // targeted integrations — one posts[] entry per channel
  mediaUrl: string | null
  scheduledFor?: string | null  // ISO datetime; omit/null for immediate ('now') publish
}

// Keyed by Postiz integration id — matches stakeholder_announcements.
// publish_results' existing shape ({ [channelId]: { success, post_id } }),
// unlike the old single postizPostId this replaces (a real post can target
// several channels at once, each getting its own postId back).
export type SchedulePostResult = Record<string, { success: boolean; postId: string }>

export async function schedulePostizPost(params: SchedulePostParams): Promise<SchedulePostResult> {
  const { apiUrl, apiKey } = requireEnv()
  if (params.channels.length === 0) throw new PostizError('No channels selected')

  let media: { id: string; path: string } | null = null
  if (params.mediaUrl) media = await uploadMediaFromUrl(params.mediaUrl)

  const res = await fetch(`${apiUrl}/posts`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: params.scheduledFor ? 'schedule' : 'now',
      date: params.scheduledFor ?? new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts: params.channels.map(channel => ({
        integration: { id: channel.id },
        value: [{
          content: params.content,
          ...(media ? { image: [{ id: media.id, path: media.path }] } : {}),
        }],
        settings: settingsForIdentifier(channel.identifier),
        ...(params.groupId ? { group: params.groupId } : {}),
      })),
    }),
  })

  if (!res.ok) throw new PostizError(`Postiz schedule failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json() as Array<{ postId: string; integration: string }>
  const result: SchedulePostResult = {}
  for (const r of data) result[r.integration] = { success: true, postId: r.postId }
  return result
}

export type PostizPostSummary = {
  id: string
  state: 'QUEUE' | 'PUBLISHED' | 'ERROR' | 'DRAFT' | string
  integration?: string
  // The live URL of the published post on the actual platform (Postiz's own
  // public API field name — https://docs.postiz.com/public-api/posts/list).
  // Only meaningful once state is 'PUBLISHED'; the sync-status cron reads
  // this to give producers a direct link to verify what actually went out,
  // instead of just trusting a status label.
  releaseURL?: string
}

// GET /posts?from=&to=&group= — a RANGE/LIST endpoint, not a per-post
// lookup (Postiz has no documented "get one post by id" endpoint) — the
// 30-requests/hour rate limit makes this the only viable way to check
// status for however many posts are due at once; the sync-status cron
// calls this once per event per run rather than once per due
// announcement (see that route's own comment for the batching logic).
export async function listPostizPostsInRange(from: string, to: string, groupId?: string): Promise<PostizPostSummary[]> {
  const { apiUrl, apiKey } = requireEnv()
  const url = new URL(`${apiUrl}/posts`)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  if (groupId) url.searchParams.set('group', groupId)
  const res = await fetch(url.toString(), { headers: authHeaders(apiKey) })
  if (!res.ok) throw new PostizError(`Postiz posts list failed: ${res.status} ${await res.text().catch(() => '')}`)
  return await res.json() as PostizPostSummary[]
}
