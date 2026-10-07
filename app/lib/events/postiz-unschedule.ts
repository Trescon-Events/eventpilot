// Cancel / reschedule a still-future scheduled post (2026-10-07, per Madhu — "what if the producer decides to
// reschedule it? or cancel it?"). Postiz's public API can create and delete posts but not edit them, so:
//   cancel     = delete the scheduled post group in Postiz, put the announcement back to ready-to-publish
//                (copy, creative and approvals untouched — nothing to re-approve);
//   reschedule = cancel, then schedule again at the new time on the same channels. Deleting FIRST means a failure
//                can never leave two live schedules (a double post); the worst case is "old one gone, new one failed",
//                which is reported plainly and leaves the announcement ready to schedule again.
// Only possible while the time is still comfortably in the future — once Postiz is delivering (or has delivered)
// a post it can't be recalled through the API (see remove-post/route.ts for what "Clear This Post" really does).
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { deletePostizPost, listPostizIntegrations, PostizError } from '@/app/lib/postiz'
import { publishAnnouncementToPostiz, PublishValidationError } from '@/app/lib/events/postiz-publish'

type ChannelResult = { success: boolean; postId: string; state?: string; url?: string }

// A post this close to its time may already be on its way — don't pretend we can stop it.
export const CANCEL_LEAD_MS = 2 * 60 * 1000
// A new schedule must be at least this far ahead (Postiz needs a moment to queue it).
export const RESCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000

type Row = {
  id: string; event_id: string; status: string; scheduled_for: string | null; scheduled_by: string | null
  postiz_channel_ids: string[] | null; publish_results: Record<string, ChannelResult> | null
  speaker_id: string | null; partner_id: string | null
}

async function loadRow(id: string): Promise<Row> {
  const { data } = await supabaseAdmin.from('stakeholder_announcements')
    .select('id, event_id, status, scheduled_for, scheduled_by, postiz_channel_ids, publish_results, speaker_id, partner_id').eq('id', id).single()
  if (!data) throw new PublishValidationError('Announcement not found', 404)
  return data as Row
}

function assertChangeable(row: Row) {
  if (row.status !== 'scheduled' || !row.scheduled_for || !row.publish_results) throw new PublishValidationError(`This announcement isn't scheduled (it's '${row.status}').`, 409)
  if (new Date(row.scheduled_for).getTime() - Date.now() < CANCEL_LEAD_MS) throw new PublishValidationError('This post is due to go out now, so it can no longer be changed here — Postiz is delivering it.', 409)
  const live = Object.values(row.publish_results).find(r => r.state && r.state !== 'QUEUE' && r.state !== 'DRAFT')
  if (live) throw new PublishValidationError('At least one channel has already been delivered, so the schedule can no longer be changed.', 409)
}

async function deleteScheduledGroup(row: Row) {
  const postIds = Object.values(row.publish_results ?? {}).map(r => r.postId).filter(Boolean)
  if (postIds.length === 0) throw new PublishValidationError('No Postiz post id on file for this announcement.', 422)
  // The first success removes the whole group (see deletePostizPost); later ids 404 harmlessly.
  const errors: string[] = []
  for (const postId of postIds) {
    try { await deletePostizPost(postId); return } catch (e) { errors.push(e instanceof PostizError ? e.message : String(e)) }
  }
  throw new PostizError(`Could not cancel the scheduled post in Postiz: ${errors[0] ?? 'unknown error'}`)
}

const unscheduledPatch = () => ({
  // Back to ready-to-publish — same reset as "Clear This Post". (Scheduling required internal approval or its bypass, and either satisfies the publish check as 'approved'.)
  status: 'approved',
  scheduled_for: null, scheduled_by: null, published_at: null, publish_results: null, postiz_channel_ids: null,
  updated_at: new Date().toISOString(),
})

export async function cancelScheduledPost(id: string, actorSid: string | undefined) {
  const row = await loadRow(id)
  assertChangeable(row)
  await deleteScheduledGroup(row)
  const { data, error } = await supabaseAdmin.from('stakeholder_announcements').update(unscheduledPatch()).eq('id', id).select().single()
  if (error || !data) throw new PublishValidationError(error?.message ?? 'Cancelled in Postiz, but could not reset the announcement record.', 500)
  await notifyScheduleChange('cancelled', row, actorSid, null).catch(e => console.error('Cancel-schedule notification failed:', e))
  return data
}

export async function rescheduleAnnouncement(id: string, newIso: string, actorSid: string | undefined) {
  const when = new Date(newIso)
  if (Number.isNaN(when.getTime())) throw new PublishValidationError('Pick a valid date and time.', 400)
  if (when.getTime() - Date.now() < RESCHEDULE_MIN_LEAD_MS) throw new PublishValidationError('Pick a time at least 5 minutes from now.', 400)
  const row = await loadRow(id)
  assertChangeable(row)
  const channelIds = row.postiz_channel_ids ?? []
  if (channelIds.length === 0) throw new PublishValidationError('No channels on file for this schedule — cancel it and schedule again.', 422)

  await deleteScheduledGroup(row)
  try {
    const data = await publishAnnouncementToPostiz(id, channelIds, when.toISOString())
    // publishAnnouncementToPostiz doesn't touch scheduled_by; whoever reschedules is who gets the "gone live" email.
    if (actorSid && actorSid !== 'super-admin') await supabaseAdmin.from('stakeholder_announcements').update({ scheduled_by: actorSid }).eq('id', id)
    await notifyScheduleChange('rescheduled', row, actorSid, when.toISOString()).catch(e => console.error('Reschedule notification failed:', e))
    return data
  } catch (e) {
    // The old schedule is gone and the new one didn't take — leave the announcement ready to schedule again, and say so.
    await supabaseAdmin.from('stakeholder_announcements').update(unscheduledPatch()).eq('id', id)
    const why = e instanceof PostizError || e instanceof PublishValidationError ? e.message : 'unknown error'
    throw new PublishValidationError(`The old schedule was removed but the new time could not be set (${why}). The post is ready to schedule again — nothing will go out until you do.`, 502)
  }
}

/* "Since it won't happen immediately, at least the producer will know when it's happened" (Madhu): an email to the
   person who made the change and, if different, whoever had scheduled it (the person who'd otherwise be waiting for the
   go-live email). Same Resend pattern as remove-post / sync-status. */
async function notifyScheduleChange(kind: 'cancelled' | 'rescheduled', row: Row, actorSid: string | undefined, newIso: string | null) {
  if (!process.env.RESEND_API_KEY) return
  const ids = [...new Set([actorSid, row.scheduled_by].filter((x): x is string => !!x && x !== 'super-admin'))]
  if (ids.length === 0) return
  const [{ data: staff }, { data: event }] = await Promise.all([
    supabaseAdmin.from('staff_members').select('id, email, name').in('id', ids),
    supabaseAdmin.from('events').select('name, public_name, postiz_profile_key').eq('id', row.event_id).single(),
  ])
  const actor = staff?.find(s => s.id === actorSid)
  const channels = await listPostizIntegrations(event?.postiz_profile_key || undefined).then(all => {
    const byId = new Map(all.map(i => [i.id, i.name || i.identifier]))
    return (row.postiz_channel_ids ?? []).map(c => byId.get(c) ?? 'a channel')
  }).catch(() => [] as string[])

  const eventName = event?.public_name || event?.name || 'this event'
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
  const stakeholderId = row.speaker_id ?? row.partner_id
  const kindParam = row.partner_id && !row.speaker_id ? '&kind=partner' : ''
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const pageUrl = stakeholderId ? `${siteUrl}/admin/events/${row.event_id}/stakeholders/${stakeholderId}?tab=announcements&announcement=${row.id}${kindParam}` : siteUrl
  const was = row.scheduled_for ? fmt(row.scheduled_for) : 'its scheduled time'
  const headline = kind === 'cancelled'
    ? `The scheduled post for ${eventName} that was due ${was} has been cancelled. Nothing will be published — it is back to ready-to-publish, with its approvals intact.`
    : `The scheduled post for ${eventName} has been moved from ${was} to ${fmt(newIso!)}. It will go out at the new time.`
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>'
  for (const s of staff ?? []) {
    if (!s.email) continue
    // eslint-disable-next-line no-restricted-syntax -- email HTML; clients can't render CSS custom properties
    const byLine = actor && s.id !== actor.id ? `<p style="font-family:sans-serif;font-size:13px;color:#8A94A3">Changed by ${actor.name}.</p>` : ''
    await resend.emails.send({
      from, to: s.email,
      subject: kind === 'cancelled' ? `Schedule cancelled: post for ${eventName}` : `Rescheduled: post for ${eventName} now goes out ${fmt(newIso!)}`,
      /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches this codebase's other system notification emails) */
      html: `<p style="font-family:sans-serif;font-size:14px;color:#2D3E50">${headline}</p>
             ${channels.length ? `<p style="font-family:sans-serif;font-size:13px;color:#2D3E50">Channels: ${channels.join(', ')}</p>` : ''}
             ${byLine}
             <p><a href="${pageUrl}" style="color:#00695C">Open it in EventPilot →</a></p>`,
      /* eslint-enable no-restricted-syntax */
    })
  }
}
