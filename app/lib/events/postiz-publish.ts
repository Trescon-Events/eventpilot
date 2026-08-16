// Shared logic between the schedule and publish-now routes (2026-08-16) —
// both do exactly the same thing (resolve selected channels, call Postiz,
// write the result) with one difference (whether a future scheduled_for is
// set), so that part lives here once. Each route keeps its own request
// parsing / error-status choices; this only does the actual publish.
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { schedulePostizPost, listPostizIntegrations } from '@/app/lib/postiz'

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
