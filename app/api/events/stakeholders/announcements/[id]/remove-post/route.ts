import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { deletePostizPost, PostizError } from '@/app/lib/postiz'

type ChannelResult = { success: boolean; postId: string; state?: string; url?: string }

/* POST /api/events/stakeholders/announcements/[id]/remove-post

   "Clear This Post" — originally built as "Remove Post" (2026-09-21,
   Madhu — "just in case if user decides to remove a post after it's
   posted for whatever reason"), renamed the same day after a live test
   revealed what it actually does.

   CORRECTED FINDING: this does NOT take the live post down from
   LinkedIn/wherever it was published. Confirmed against Postiz's own
   docs (docs.postiz.com/public-api/posts/delete, via a mintlify mirror
   since found) — "You cannot delete posts that have already been
   published to social media platforms. The API only manages scheduled
   and draft posts." Live-tested the same day: this route's DELETE call
   succeeds and the post vanishes from Postiz's own list (which is why
   the reset below is safe/correct to do), but the actual LinkedIn share
   stayed fully live and reachable at its real URL afterward. There is no
   documented public-API path to retract already-published content —
   don't add a "it's really deleted now" claim anywhere in this flow
   without re-verifying that's changed.

   What this genuinely does: clears Postiz's + EventPilot's own record of
   the post, then resets the announcement back to a re-publishable state
   so Schedule/Post Now work again immediately — no separate "make it
   postable again" step, no approvals to redo. Only ever called on a
   `published` announcement — a still-`scheduled` one that hasn't
   confirmed yet isn't this button's job.

   Deletion is treated as synchronous (see deletePostizPost's own doc
   comment for why) — no polling, no "this can take a few minutes"
   messaging, unlike the publish flow.

   Notifies the person who cleared it, same shape as sync-status's
   notifySchedulerOfPublish (Resend, not Graph mail — a system
   notification, not a producer-composed message), with a direct link
   back to this exact announcement so re-posting is one click away. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('*').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
  if (announcement.status !== 'published') {
    return NextResponse.json({ error: `Can only remove a published post — this announcement is '${announcement.status}'.` }, { status: 409 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const results = (announcement.publish_results ?? {}) as Record<string, ChannelResult>
  const postIds = Object.values(results).map(r => r.postId).filter(Boolean)
  if (postIds.length === 0) return NextResponse.json({ error: 'No Postiz post id on file for this announcement.' }, { status: 422 })

  // Try each channel's postId — the first success removes the whole
  // group (see deletePostizPost's own comment), so this loop is a
  // fallback for the rare case a post predates the `group` field, not
  // the expected path. Only fail the whole request if every attempt
  // fails; an already-deleted group 404ing on a later attempt is
  // expected, not an error worth surfacing.
  let deleted = false
  const errors: string[] = []
  for (const postId of postIds) {
    try {
      await deletePostizPost(postId)
      deleted = true
      break
    } catch (e) {
      errors.push(e instanceof PostizError ? e.message : String(e))
    }
  }
  if (!deleted) {
    return NextResponse.json({ error: `Could not remove the post from Postiz: ${errors[0] ?? 'unknown error'}` }, { status: 502 })
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .update({
      status: 'approved', scheduled_for: null, published_at: null, publish_results: null, postiz_channel_ids: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (updateErr || !updated) return NextResponse.json({ error: updateErr?.message ?? 'Removed from Postiz, but could not reset the announcement record.' }, { status: 500 })

  await notifyOfRemoval(session?.sid, announcement.event_id, updated).catch(e => console.error('Remove-post notification failed:', e))

  return NextResponse.json(updated)
}

async function notifyOfRemoval(sid: string | undefined, eventId: string, announcement: { id: string; speaker_id: string | null; partner_id: string | null }) {
  if (!process.env.RESEND_API_KEY || !sid) return
  const [{ data: staff }, { data: event }] = await Promise.all([
    supabaseAdmin.from('staff_members').select('email, name').eq('id', sid).single(),
    supabaseAdmin.from('events').select('name').eq('id', eventId).single(),
  ])
  if (!staff?.email) return

  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const stakeholderId = announcement.speaker_id ?? announcement.partner_id
  if (!stakeholderId) return
  const kindParam = announcement.partner_id && !announcement.speaker_id ? '&kind=partner' : ''
  const pageUrl = `${siteUrl}/admin/events/${eventId}/stakeholders/${stakeholderId}?tab=announcements&announcement=${announcement.id}${kindParam}`

  await resend.emails.send({
    from,
    to: staff.email,
    subject: `Cleared: your announcement for ${event?.name ?? 'this event'} is ready to post again`,
    /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches this codebase's other cron/system notification emails) */
    html: `<p style="font-family:sans-serif;font-size:14px;color:#2D3E50">
             The post you cleared for ${event?.name ?? 'this event'} has been removed from Postiz and this announcement is ready to publish again — no approval steps to redo.
           </p>
           <p style="font-family:sans-serif;font-size:13px;color:#8A94A3">Note: this does not remove the original post from the platform it was published to — if you need it actually taken down, delete it there directly.</p>
           <p><a href="${pageUrl}" style="color:#00695C">Open it in EventPilot →</a> to post a fresh one.</p>`,
    /* eslint-enable no-restricted-syntax */
  })
}
