// Shared logic between the schedule and publish-now routes (2026-08-16) —
// both do exactly the same thing (resolve selected channels, call Postiz,
// write the result) with one difference (whether a future scheduled_for is
// set), so that part lives here once. Each route keeps its own request
// parsing / error-status choices; this only does the actual publish.
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { schedulePostizPost, listPostizIntegrations, listPostizPostsInRange, type PostizPostSummary } from '@/app/lib/postiz'

type ChannelResult = { success: boolean; postId: string; state?: string; url?: string }

export class PublishValidationError extends Error {
  status: number
  constructor(message: string, status = 422) {
    super(message)
    this.status = status
  }
}

// An announcement can be scheduled/published once approved — OR
// immediately from 'draft' if the requesting staff member has
// sae.announcements.publish (2026-08-16, per Madhu: staff should be able
// to skip the approval chain for routine posts, not just the mandatory
// external-approver path). Admins always pass.
export async function checkCanPublish(req: NextRequest, eventId: string, currentStatus: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (currentStatus === 'approved' || currentStatus === 'approved_with_comments') return { ok: true }
  const session = getSession(req)
  const canSkip = session?.adm || await hasEventPermission(session?.sid, eventId, 'sae.announcements.publish')
  if (canSkip) return { ok: true }
  return { ok: false, message: `Cannot publish an announcement with status '${currentStatus}' — must be approved first, or you need permission to skip approval` }
}

// Resolves the announcement's event + (optional) Postiz profile key,
// resolves the requested channel ids against the event's actually-connected
// integrations (so a stale/removed channel id fails clearly rather than
// silently posting to nothing or erroring deep inside Postiz), calls
// Postiz, and persists the result. `scheduledFor: null` = publish now.
//
// postiz_profile_key is optional (2026-08-16 fix, made against Trescon's
// real live Postiz workspace) — it's a single flat workspace with no
// "customer"/group scoping in the real API response, so requiring a
// profile key blocked every event's publish flow outright. Falls back to
// the account's full unscoped channel list; still honors a profile key if
// an event has one set, for if/when real customer scoping gets added.
export async function publishAnnouncementToPostiz(announcementId: string, channelIds: string[], scheduledFor: string | null) {
  if (channelIds.length === 0) throw new PublishValidationError('At least one channel must be selected')

  const { data: announcement, error: annErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('*, event:event_id(postiz_profile_key)')
    .eq('id', announcementId)
    .single()
  if (annErr || !announcement) throw new PublishValidationError('Announcement not found', 404)

  const event = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event
  const profileKey = event?.postiz_profile_key || undefined

  const integrations = await listPostizIntegrations(profileKey)
  const byId = new Map(integrations.map(i => [i.id, i]))
  const channels = channelIds.map(id => {
    const found = byId.get(id)
    if (!found) throw new PublishValidationError(`A selected channel is no longer connected to this event's Postiz workspace (id: ${id})`)
    return { id: found.id, identifier: found.identifier }
  })

  const results = await schedulePostizPost({
    groupId: profileKey,
    content: announcement.post_copy ?? '',
    // Falls back to the shared copy if post_copy_x somehow wasn't
    // generated (older rows predating this column, or a Gemini-side
    // omission) — never send X an empty post.
    contentByIdentifier: { x: announcement.post_copy_x || announcement.post_copy || '' },
    channels,
    mediaUrl: announcement.creative_url,
    scheduledFor,
  })

  // Postiz accepting the request confirms it was queued, not that it's
  // actually live on every platform yet — status stays 'scheduled' (with
  // scheduled_for = now for the publish-now case) so the same sync-status
  // cron that confirms scheduled posts also confirms this one, rather than
  // optimistically marking it published before Postiz has actually
  // delivered it.
  const effectiveScheduledFor = scheduledFor ?? new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('stakeholder_announcements')
    .update({
      status: 'scheduled',
      scheduled_for: effectiveScheduledFor,
      postiz_channel_ids: channelIds,
      publish_results: results,
      updated_at: new Date().toISOString(),
    })
    .eq('id', announcementId)
    .select('id, status, scheduled_for, publish_results')
    .single()
  if (error) throw new PublishValidationError(error.message, 500)
  return data
}

// Pure resolver shared between the 15-min sync-status cron and the
// on-demand check below — given the currently-stored per-channel results
// and a batch of Postiz posts (from listPostizPostsInRange), returns the
// updated results plus whether any channel is still in flight or errored.
export function resolveChannelResults(
  results: Record<string, ChannelResult>,
  posts: PostizPostSummary[]
): { updatedResults: Record<string, ChannelResult>; anyQueue: boolean; anyError: boolean } {
  const postById = new Map(posts.map(p => [p.id, p]))
  const updatedResults: Record<string, ChannelResult> = { ...results }
  let anyError = false
  let anyQueue = false
  for (const channelId of Object.keys(results)) {
    const postId = results[channelId].postId
    const post = postById.get(postId)
    if (!post) { anyQueue = true; continue } // not seen yet in this range — treat as still pending
    updatedResults[channelId] = { ...results[channelId], state: post.state, url: post.releaseURL }
    if (post.state === 'ERROR') anyError = true
    else if (post.state === 'QUEUE' || post.state === 'DRAFT') anyQueue = true
  }
  return { updatedResults, anyQueue, anyError }
}

// On-demand version of the sync-status cron's per-row check, scoped to ONE
// announcement — used by the live "Post Now" progress modal to poll for a
// real confirmation/link within seconds rather than waiting up to 15
// minutes for the next cron run. Persists the same way the cron does, so
// whichever resolves it first (this or the cron) leaves consistent state.
export async function checkAnnouncementPublishStatus(announcementId: string) {
  const { data: row, error } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('id, status, scheduled_for, publish_results, event:event_id(postiz_profile_key)')
    .eq('id', announcementId)
    .single()
  if (error || !row) throw new PublishValidationError('Announcement not found', 404)
  if (row.status !== 'scheduled' || !row.publish_results) {
    return { id: row.id, status: row.status, publish_results: row.publish_results }
  }

  const event = Array.isArray(row.event) ? row.event[0] : row.event
  const profileKey = event?.postiz_profile_key || undefined
  const results = row.publish_results as Record<string, ChannelResult>
  if (Object.keys(results).length === 0) return { id: row.id, status: row.status, publish_results: row.publish_results }

  // 5-minute lookback buffer past scheduled_for guards against clock skew
  // between this server and Postiz — an immediate publish sets
  // scheduled_for to "now" at the moment schedulePostizPost was called.
  const startDate = new Date(new Date(row.scheduled_for ?? Date.now()).getTime() - 5 * 60 * 1000).toISOString()
  const posts = await listPostizPostsInRange(startDate, new Date().toISOString(), profileKey)
  const { updatedResults, anyQueue, anyError } = resolveChannelResults(results, posts)

  const patch = anyQueue
    ? { publish_results: updatedResults, updated_at: new Date().toISOString() }
    : anyError
      ? { status: 'failed', publish_results: updatedResults, updated_at: new Date().toISOString() }
      : { status: 'published', published_at: new Date().toISOString(), publish_results: updatedResults, updated_at: new Date().toISOString() }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .update(patch)
    .eq('id', announcementId)
    .select('id, status, published_at, publish_results')
    .single()
  if (updateErr || !updated) throw new PublishValidationError(updateErr?.message ?? 'Could not update status', 500)
  return updated
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn', 'linkedin-page': 'LinkedIn Page', x: 'X', instagram: 'Instagram', youtube: 'YouTube',
}

// Renders publish_results into the {{platform_links}} <ul> both notify
// templates use — resolves channel display names via listPostizIntegrations
// (publish_results itself only stores the Postiz integration id, not a
// name), same lookup publishAnnouncementToPostiz already does. Channels
// with no confirmed url yet (still QUEUE, or a failed channel) are simply
// omitted — this only ever runs once an announcement is 'published', so
// in practice every remaining channel should have one, but a stray
// straggler shouldn't produce a broken/empty link in the email.
export async function buildPlatformLinksHtml(publishResults: Record<string, ChannelResult> | null, profileKey?: string): Promise<string> {
  if (!publishResults) return ''
  const entries = Object.entries(publishResults).filter((e): e is [string, ChannelResult & { url: string }] => !!e[1].url)
  if (entries.length === 0) return ''
  const integrations = await listPostizIntegrations(profileKey)
  const byId = new Map(integrations.map(i => [i.id, i]))
  const items = entries.map(([channelId, r]) => {
    const ch = byId.get(channelId)
    const label = (ch && PLATFORM_LABELS[ch.identifier]) || ch?.name || 'Post'
    return `<li><a href="${r.url}">${label}</a></li>`
  })
  return `<ul>${items.join('')}</ul>`
}
