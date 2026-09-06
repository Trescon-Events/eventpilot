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
export type PostizGroup = { id: string; name: string }

// GET /groups (2026-09-06, Integrations page) — every Postiz "customer" on
// this account, e.g. the "World AI Show" group created live and confirmed
// against the real API. Note the real path is bare `/groups`, NOT
// `/integrations/groups` — the docs site's own URL slug
// (public-api/integrations/groups.md) is misleading; confirmed live via a
// 404 on the nested path and 200 on this one.
export async function listPostizGroups(): Promise<PostizGroup[]> {
  const { apiUrl, apiKey } = requireEnv()
  const res = await fetch(`${apiUrl}/groups`, { headers: authHeaders(apiKey) })
  if (!res.ok) throw new PostizError(`Postiz groups fetch failed: ${res.status} ${await res.text().catch(() => '')}`)
  return await res.json() as PostizGroup[]
}

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
// Fixed 2026-08-27 (found live — the very first real "Post Now" attempt
// against X failed with no visible error beyond "could not publish").
// Root cause, confirmed against Postiz's own public docs
// (docs.postiz.com/public-api/posts/create): `settings` is REQUIRED per
// post, and most platforms need real fields beyond the `__type`
// discriminator this always sent — X specifically requires
// `who_can_reply_post`, which was silently missing, so every X post was
// guaranteed to be rejected by Postiz's own validation before this fix.
// Only covers the platforms this account actually has connected
// (x/linkedin/linkedin-page/instagram/instagram-standalone/youtube/
// facebook, per the real integrations list) — an unhandled identifier
// still falls back to the bare `{ __type }` shape, same as before.
function settingsForIdentifier(identifier: string, content: string): Record<string, unknown> {
  switch (identifier) {
    case 'x':
      // 'everyone' matches X's own default reply-permission setting —
      // the least restrictive option, appropriate for a public event
      // announcement that should be freely repliable.
      return { __type: 'x', who_can_reply_post: 'everyone' }
    case 'instagram':
    case 'instagram-standalone':
      return { __type: identifier, post_type: 'post' }
    case 'youtube':
      // title is required even for an image post pushed through this
      // pipeline (none of this app's announcements are actual video
      // uploads) — derived from the first line of the post copy, since
      // there's no dedicated "title" field anywhere upstream to reuse.
      // YouTube's own title cap is 100 chars.
      return { __type: 'youtube', title: (content.split('\n')[0] || 'Announcement').slice(0, 100), type: 'public' }
    default:
      return { __type: identifier }
  }
}

export type PostizChannel = { id: string; identifier: string } // enough of PostizIntegration to build a post

export type SchedulePostParams = {
  groupId?: string
  content: string
  // Per-channel content override, keyed by Postiz `identifier` (e.g. 'x')
  // (2026-08-27) — X's 280-char limit needs a genuinely different, shorter
  // copy from the shared LinkedIn-length one, not a truncation of it. Any
  // identifier not present here just uses `content` as before.
  contentByIdentifier?: Record<string, string>
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
      posts: params.channels.map(channel => {
        const channelContent = params.contentByIdentifier?.[channel.identifier] ?? params.content
        return {
          integration: { id: channel.id },
          value: [{
            content: channelContent,
            ...(media ? { image: [{ id: media.id, path: media.path }] } : {}),
          }],
          settings: settingsForIdentifier(channel.identifier, channelContent),
          ...(params.groupId ? { group: params.groupId } : {}),
        }
      }),
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
  // Real shape per Postiz's own docs (confirmed live 2026-08-27, see below)
  // — an object, not a plain id string. Optional because it's genuinely
  // absent on some post shapes per the docs.
  integration?: { id: string; providerIdentifier: string; name: string; picture?: string }
  content?: string
  publishDate?: string
  // The live URL of the published post on the actual platform (Postiz's own
  // public API field name — https://docs.postiz.com/public-api/posts/list).
  // Only meaningful once state is 'PUBLISHED'; the sync-status cron reads
  // this to give producers a direct link to verify what actually went out,
  // instead of just trusting a status label.
  releaseURL?: string
}

// GET /posts?startDate=&endDate=&customer= — a RANGE/LIST endpoint, not a
// per-post lookup (Postiz has no documented "get one post by id" endpoint)
// — the 30-requests/hour rate limit makes this the only viable way to
// check status for however many posts are due at once; the sync-status
// cron calls this once per event per run rather than once per due
// announcement (see that route's own comment for the batching logic).
//
// Fixed 2026-08-27 (found live, verifying against the real API before
// building the "other scheduled posts" clash-check feature): the query
// params were `from`/`to` (real API wants `startDate`/`endDate` — confirmed
// via a live 400 "startDate must be a valid ISO 8601 date string" response
// with the old names), `group` (docs only document `customer` for this
// endpoint — `group` is this file's OWN `/posts` POST-endpoint param name,
// not this GET one), and the response was read as a bare array (real shape
// is `{ posts: [...] }`, confirmed live — every previous call would have
// silently returned `undefined` for every post's fields). Never actually
// hit in production before this: the sync-status cron only calls this for
// events with a postiz_profile_key set, and no real event has one yet.
export async function listPostizPostsInRange(startDate: string, endDate: string, customerId?: string): Promise<PostizPostSummary[]> {
  const { apiUrl, apiKey } = requireEnv()
  const url = new URL(`${apiUrl}/posts`)
  url.searchParams.set('startDate', startDate)
  url.searchParams.set('endDate', endDate)
  if (customerId) url.searchParams.set('customer', customerId)
  const res = await fetch(url.toString(), { headers: authHeaders(apiKey) })
  if (!res.ok) throw new PostizError(`Postiz posts list failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json() as { posts?: PostizPostSummary[] }
  return data.posts ?? []
}
