import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { enqueueJob } from './jobs'
import { presignGet } from './storage'
import { eventStaffChoices } from '@/app/lib/content/public-figures-review'
import { senderFor, siteUrl } from '@/app/lib/badges/client-approval'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { notifyStaff } from '@/app/lib/notify'
import { addToPlaylist, eventChannel, metaFingerprint, setPrivacy, setThumbnail, tokenFor, updateSnippet, videoMeta, videoStatus, youtubeStudioUrl, youtubeWatchUrl, YoutubeError } from './youtube'
import { resolvePlaylist } from './playlists'

/* Session videos Step 7 (YouTube upload + approval) and Step 8 (publish).
   7a  Upload the final to the event's channel as UNLISTED, fully dressed (title, description, tags, thumbnail, playlist).
   7b  Internal round: the producer picks colleagues (defaults saved per event); EVERY one must approve. Any "changes requested" settles it.
   7c  Client round (after internal is approved or exempted): sent to the event's client approval contacts; the FIRST to answer settles it.
       Either round can be exempted by the producer at any time — before sending, or overriding a round that is out.
   8   Publish (public now, or scheduled) once both rounds are approved or exempted and YouTube has the current version.
   An approval counts only for the YouTube copy it was given for: changing the final, title, description, tags or thumbnail (and updating YouTube)
   needs a new round. Until Google audits the API project YouTube keeps API uploads private, so reviewers watch on the EventPilot review page. */

export class PublishError extends Error { constructor(message: string, public status = 400) { super(message) } }

export type Layer = 'internal' | 'client'
const LINK_TTL_MS = 21 * 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const actor = (id: string | null | undefined) => (id && UUID.test(id) ? id : null)
const now = () => new Date().toISOString()
export const videoReviewLink = (token: string) => `${siteUrl()}/public/video-review/${token}`

type VideoRow = Record<string, unknown> & { id: string; event_id: string; agenda_session_id: string | null }
async function video(eventId: string, id: string): Promise<VideoRow> {
  const { data } = await supabaseAdmin.from('session_videos').select('*').eq('id', id).eq('event_id', eventId).maybeSingle()
  if (!data) throw new PublishError('Video not found.', 404)
  return data as VideoRow
}
const err = (e: unknown) => (e instanceof YoutubeError ? new PublishError(e.message, e.status) : e)

// ── state ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type RecipientView = { id: string; name: string; email: string; status: string; comment: string | null; actioned_at: string | null; last_opened_at: string | null }
type RoundView = { id: string; status: string; sent_at: string; sent_by_name: string | null; resolved_at: string | null; resolved_by_name: string | null; message: string | null; current: boolean; recipients: RecipientView[] }
export type LayerState = { exempt: { at: string; by: string | null } | null; round: RoundView | null; satisfied: boolean }

async function latestRound(videoId: string, layer: Layer, ytFingerprint: string | null): Promise<RoundView | null> {
  const { data: r } = await supabaseAdmin.from('session_video_approval_rounds').select('*').eq('session_video_id', videoId).eq('layer', layer).neq('status', 'withdrawn').order('sent_at', { ascending: false }).limit(1).maybeSingle()
  if (!r) return null
  const { data: rec } = await supabaseAdmin.from('session_video_approval_recipients').select('id, name, email, status, comment, actioned_at, last_opened_at').eq('round_id', r.id).order('name')
  return {
    id: r.id as string, status: r.status as string, sent_at: r.sent_at as string, sent_by_name: (r.sent_by_name as string | null) ?? null, resolved_at: (r.resolved_at as string | null) ?? null,
    resolved_by_name: (r.resolved_by_name as string | null) ?? null, message: (r.message as string | null) ?? null, current: !!ytFingerprint && r.fingerprint === ytFingerprint, recipients: (rec ?? []) as RecipientView[],
  }
}

function layerState(v: VideoRow, layer: Layer, round: RoundView | null, ytCurrent: boolean): LayerState {
  const at = v[`${layer}_exempt_at`] as string | null
  const exempt = at ? { at, by: (v[`${layer}_exempt_by_name`] as string | null) ?? null } : null
  const approved = !!round && round.current && ytCurrent && (round.status === 'approved' || round.status === 'approved_with_comments')
  return { exempt, round, satisfied: !!exempt || approved }
}

export async function publishState(eventId: string, id: string) {
  const v = await video(eventId, id)
  let channel: { title: string; playlistId: string | null; playlistTitle: string | null } | null = null, channelError: string | null = null, categoryId = '28'
  try { const c = await eventChannel(eventId); channel = { title: c.channelTitle, playlistId: c.playlistId, playlistTitle: c.playlistTitle }; categoryId = c.categoryId } catch (e) { channelError = e instanceof Error ? e.message : String(e) }
  let wantFp: string | null = null, needsReupload = false, metaError: string | null = null
  try {
    const m = await videoMeta(id, categoryId)
    wantFp = metaFingerprint(m)
    needsReupload = !!v.youtube_video_id && !!m.renderJobId && m.renderJobId !== v.youtube_render_job_id
  } catch (e) { metaError = e instanceof Error ? e.message : String(e) }
  const ytFp = (v.youtube_fingerprint as string | null) ?? null
  const uploaded = !!v.youtube_video_id && ['uploaded', 'published', 'scheduled'].includes(String(v.youtube_status))
  const upToDate = uploaded && !!wantFp && ytFp === wantFp
  const [ir, cr, playlist] = await Promise.all([latestRound(id, 'internal', ytFp), latestRound(id, 'client', ytFp), resolvePlaylist(eventId, v.agenda_session_id)])
  const internal = layerState(v, 'internal', ir, upToDate), client = layerState(v, 'client', cr, upToDate)

  const [staff, { data: contacts }, { data: settings }, { data: tj }] = await Promise.all([
    eventStaffChoices(eventId),
    supabaseAdmin.from('event_client_approval_contacts').select('id, name, email, is_primary').eq('event_id', eventId).order('is_primary', { ascending: false }).order('name'),
    supabaseAdmin.from('session_video_settings').select('default_reviewer_ids').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('video_jobs').select('id, kind, status, started_at, finished_at, created_at, log').eq('session_video_id', id).eq('kind', 'youtube_upload').order('created_at', { ascending: false }).limit(3),
  ])
  const ytId = (v.youtube_video_id as string | null) ?? null
  const status = String(v.youtube_status ?? '')
  return {
    channel, channelError, metaError, playlist,
    playlistMismatch: ['published', 'scheduled'].includes(String(v.youtube_status)) && !!playlist && playlist.id !== (v.youtube_playlist_id as string | null),
    youtube: {
      status: status || null, videoId: ytId, watchUrl: ytId ? youtubeWatchUrl(ytId) : null, studioUrl: ytId ? youtubeStudioUrl(ytId) : null,
      privacy: (v.youtube_privacy as string | null) ?? null, lockedPrivate: !!v.youtube_locked_private, error: (v.youtube_error as string | null) ?? null,
      uploadedAt: (v.youtube_uploaded_at as string | null) ?? null, publishedAt: (v.youtube_published_at as string | null) ?? null, publishAt: (v.youtube_publish_at as string | null) ?? null,
      uploaded, upToDate, needsReupload, playlistId: (v.youtube_playlist_id as string | null) ?? null, jobs: tj ?? [],
    },
    internal, client,
    canSendClient: upToDate && internal.satisfied,
    canPublish: upToDate && internal.satisfied && client.satisfied && !['published', 'scheduled'].includes(status),
    published: status === 'published', scheduled: status === 'scheduled',
    staff, defaultReviewerIds: ((settings?.default_reviewer_ids as string[] | null) ?? []),
    clientContacts: (contacts ?? []) as Array<{ id: string; name: string; email: string; is_primary: boolean }>,
  }
}

// ── 7a: YouTube copy ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Put the current version on YouTube: a full upload the first time or after a new final render; otherwise just update title/description/tags/thumbnail. */
export async function syncYoutube(eventId: string, id: string, playlistId?: string | null): Promise<{ queued: boolean }> {
  const v = await video(eventId, id)
  if (v.render_status !== 'done') throw new PublishError('Render the final video (Step 6) first.', 409)
  if (['published', 'scheduled'].includes(String(v.youtube_status))) throw new PublishError('This video is already published on YouTube — change it in YouTube Studio.', 409)
  try {
    const ch = await eventChannel(eventId)
    const m = await videoMeta(id, ch.categoryId)
    if (playlistId !== undefined) await supabaseAdmin.from('session_videos').update({ youtube_playlist_id: playlistId || null }).eq('id', id)
    const ytId = v.youtube_video_id as string | null
    if (!ytId || v.youtube_status === 'failed' || (m.renderJobId && m.renderJobId !== v.youtube_render_job_id)) {
      await supabaseAdmin.from('session_videos').update({ youtube_status: 'uploading', youtube_error: null, updated_at: now() }).eq('id', id)
      await enqueueJob(id, 'youtube_upload')
      return { queued: true }
    }
    // Same video file: update the details in place.
    const token = await tokenFor((v.youtube_connection_id as string | null) ?? ch.connectionId)
    await updateSnippet(token, ytId, m)
    if (m.thumbnailUrl) { const r = await fetch(m.thumbnailUrl, { signal: AbortSignal.timeout(60_000) }); if (r.ok) await setThumbnail(token, ytId, Buffer.from(await r.arrayBuffer())) }
    await supabaseAdmin.from('session_videos').update({ youtube_fingerprint: metaFingerprint(m), youtube_error: null, updated_at: now() }).eq('id', id)
    return { queued: false }
  } catch (e) { throw err(e) }
}

/** The playlist mapping changed after publishing: add the video to the playlist it should now be in. (It is not removed from the old one.) */
export async function addToMappedPlaylist(eventId: string, id: string): Promise<void> {
  const v = await video(eventId, id)
  const ytId = v.youtube_video_id as string | null
  const p = await resolvePlaylist(eventId, v.agenda_session_id)
  if (!ytId || !p) throw new PublishError('Nothing to add.', 409)
  try {
    const ch = await eventChannel(eventId)
    await addToPlaylist(await tokenFor((v.youtube_connection_id as string | null) ?? ch.connectionId), p.id, ytId)
    await supabaseAdmin.from('session_videos').update({ youtube_playlist_id: p.id, updated_at: now() }).eq('id', id)
  } catch (e) { throw err(e) }
}

/** Ask YouTube what it now says about the video (privacy, scheduled time) — e.g. after the audit lifts the private lock. */
export async function refreshYoutube(eventId: string, id: string): Promise<void> {
  const v = await video(eventId, id)
  const ytId = v.youtube_video_id as string | null
  if (!ytId) return
  try {
    const ch = await eventChannel(eventId)
    const st = await videoStatus(await tokenFor((v.youtube_connection_id as string | null) ?? ch.connectionId), ytId)
    if (!st) { await supabaseAdmin.from('session_videos').update({ youtube_status: 'failed', youtube_error: 'The video is no longer on YouTube (deleted in YouTube Studio?). Upload it again.', youtube_video_id: null, youtube_fingerprint: null }).eq('id', id); return }
    const patch: Record<string, unknown> = { youtube_privacy: st.privacy, updated_at: now() }
    if (st.privacy === 'public' && v.youtube_status !== 'published') { patch.youtube_status = 'published'; patch.youtube_published_at = now() }
    await supabaseAdmin.from('session_videos').update(patch).eq('id', id)
  } catch (e) { throw err(e) }
}

// ── 7b / 7c: approval rounds ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Recipient = { staff_id: string | null; name: string; email: string }

export async function sendRound(eventId: string, id: string, layer: Layer, opts: { ids: string[]; message?: string | null; saveDefault?: boolean }, sid: string | null): Promise<{ sent: number; emailed: number }> {
  const st = await publishState(eventId, id)
  if (!st.youtube.upToDate) throw new PublishError('Upload the current version to YouTube first (Step 7, part 1).', 409)
  if (layer === 'client' && !st.internal.satisfied) throw new PublishError('Internal approval comes first — wait for it, or mark it Not required.', 409)
  const ids = [...new Set(opts.ids.filter(x => UUID.test(x)))]
  if (!ids.length) throw new PublishError(layer === 'internal' ? 'Pick at least one colleague.' : 'Pick at least one client approver.')
  let people: Recipient[]
  if (layer === 'internal') people = st.staff.filter(s => ids.includes(s.id)).map(s => ({ staff_id: s.id, name: s.name, email: s.email }))
  else people = st.clientContacts.filter(c => ids.includes(c.id)).map(c => ({ staff_id: null, name: c.name, email: c.email }))
  if (!people.length) throw new PublishError('None of the chosen people have an email address.')

  const v = await video(eventId, id)
  // A new round replaces any round still out for this layer.
  await supabaseAdmin.from('session_video_approval_rounds').update({ status: 'withdrawn', resolved_at: now() }).eq('session_video_id', id).eq('layer', layer).eq('status', 'pending')
  const sender = await senderFor(sid)
  const { data: round, error } = await supabaseAdmin.from('session_video_approval_rounds').insert({
    session_video_id: id, layer, fingerprint: v.youtube_fingerprint, message: opts.message?.trim() || null,
    sent_by: actor(sender.staffId ?? sid), sent_by_name: sender.name, sent_by_email: sender.email,
  }).select('id').single()
  if (error || !round) throw new PublishError(error?.message ?? 'Could not create the round.', 500)
  const rows = people.map(p => ({ round_id: round.id, staff_id: p.staff_id, name: p.name, email: p.email, token: randomBytes(24).toString('hex'), token_expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString() }))
  await supabaseAdmin.from('session_video_approval_recipients').insert(rows)
  if (layer === 'internal' && opts.saveDefault) {
    await supabaseAdmin.from('session_video_settings').upsert({ event_id: eventId, default_reviewer_ids: people.map(p => p.staff_id!), updated_by: actor(sid), updated_at: now() }, { onConflict: 'event_id' })
  }

  const ctx = await mailContext(v)
  let emailed = 0
  for (const r of rows) {
    if (await sendReviewEmail({ eventId, to: r.email, name: r.name, layer, token: r.token, ctx, sender, message: opts.message ?? null, lockedPrivate: !!v.youtube_locked_private, watchUrl: v.youtube_video_id ? youtubeWatchUrl(v.youtube_video_id as string) : null })) {
      emailed++
      await supabaseAdmin.from('session_video_approval_recipients').update({ notified_at: now() }).eq('token', r.token)
    }
  }
  return { sent: rows.length, emailed }
}

export async function withdrawRound(eventId: string, id: string, layer: Layer): Promise<void> {
  await video(eventId, id)
  await supabaseAdmin.from('session_video_approval_rounds').update({ status: 'withdrawn', resolved_at: now() }).eq('session_video_id', id).eq('layer', layer).eq('status', 'pending')
}

/** "Not required" — the producer's override for one layer, recorded with who and when. Allowed at any time, also while a round is out. */
export async function setExempt(eventId: string, id: string, layer: Layer, on: boolean, sid: string | null): Promise<void> {
  await video(eventId, id)
  const s = await senderFor(sid)
  await supabaseAdmin.from('session_videos').update(on
    ? { [`${layer}_exempt_at`]: now(), [`${layer}_exempt_by`]: actor(s.staffId ?? sid), [`${layer}_exempt_by_name`]: s.name, updated_at: now() }
    : { [`${layer}_exempt_at`]: null, [`${layer}_exempt_by`]: null, [`${layer}_exempt_by_name`]: null, updated_at: now() }).eq('id', id)
}

// ── 8: publish ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function publishVideo(eventId: string, id: string, opts: { publishAt?: string | null }): Promise<{ status: 'published' | 'scheduled' }> {
  const st = await publishState(eventId, id)
  if (!st.youtube.upToDate) throw new PublishError('YouTube doesn’t have the current version — update it first (Step 7).', 409)
  if (!st.internal.satisfied) throw new PublishError('Internal approval is still needed (or mark it Not required).', 409)
  if (!st.client.satisfied) throw new PublishError('Client approval is still needed (or mark it Not required).', 409)
  let publishAt: string | null = null
  if (opts.publishAt) {
    const t = Date.parse(opts.publishAt)
    if (!isFinite(t) || t < Date.now() + 5 * 60_000) throw new PublishError('Pick a time at least 5 minutes from now.')
    publishAt = new Date(t).toISOString()
  }
  const v = await video(eventId, id)
  try {
    const ch = await eventChannel(eventId)
    const token = await tokenFor((v.youtube_connection_id as string | null) ?? ch.connectionId)
    const ytId = v.youtube_video_id as string
    await setPrivacy(token, ytId, { privacy: 'public', publishAt })
    const after = await videoStatus(token, ytId)
    if (!publishAt && after?.privacy !== 'public') throw new PublishError('YouTube kept the video private. That happens until Google approves EventPilot’s YouTube app (the API audit) — publish it by hand in YouTube Studio for now.', 409)
    // Only now into its playlist (an unlisted video in a public playlist would be visible before approval). A scheduled video stays private until
    // its time, and private videos in a playlist are hidden from viewers, so adding it now is safe too.
    let playlistNote: string | null = null
    const p = await resolvePlaylist(eventId, v.agenda_session_id)
    if (p && p.id !== v.youtube_playlist_id) {
      try { await addToPlaylist(token, p.id, ytId); await supabaseAdmin.from('session_videos').update({ youtube_playlist_id: p.id }).eq('id', id) }
      catch (e) { playlistNote = `Published, but not added to the playlist: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (playlistNote) await supabaseAdmin.from('session_videos').update({ youtube_error: playlistNote }).eq('id', id)
    await supabaseAdmin.from('session_videos').update(publishAt
      ? { youtube_status: 'scheduled', youtube_publish_at: publishAt, youtube_privacy: after?.privacy ?? 'private', updated_at: now() }
      : { youtube_status: 'published', youtube_published_at: now(), youtube_publish_at: null, youtube_privacy: 'public', updated_at: now() }).eq('id', id)
    return { status: publishAt ? 'scheduled' : 'published' }
  } catch (e) { throw err(e) }
}

/** Undo a schedule (back to unlisted) — only before it goes live. */
export async function unschedule(eventId: string, id: string): Promise<void> {
  const v = await video(eventId, id)
  if (v.youtube_status !== 'scheduled') return
  try {
    const ch = await eventChannel(eventId)
    await setPrivacy(await tokenFor((v.youtube_connection_id as string | null) ?? ch.connectionId), v.youtube_video_id as string, { privacy: 'unlisted' })
    await supabaseAdmin.from('session_videos').update({ youtube_status: 'uploaded', youtube_publish_at: null, youtube_privacy: 'unlisted', updated_at: now() }).eq('id', id)
  } catch (e) { throw err(e) }
}

// ── the reviewer's side (public, by token) ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function recipientByToken(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null
  const { data: rec } = await supabaseAdmin.from('session_video_approval_recipients').select('*').eq('token', token).maybeSingle()
  if (!rec) return null
  const { data: round } = await supabaseAdmin.from('session_video_approval_rounds').select('*').eq('id', rec.round_id).maybeSingle()
  if (!round) return null
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', round.session_video_id).maybeSingle()
  if (!v) return null
  return { rec, round, v: v as VideoRow }
}

export async function reviewView(token: string) {
  const f = await recipientByToken(token)
  if (!f) return { error: 'This review link is not valid. Ask the sender for a new one.', status: 404 as const }
  const { rec, round, v } = f
  if (Date.parse(rec.token_expires_at as string) < Date.now()) return { error: 'This review link has expired. Ask the sender for a new one.', status: 410 as const }
  await supabaseAdmin.from('session_video_approval_recipients').update({ last_opened_at: now() }).eq('id', rec.id)
  const ctx = await mailContext(v)
  const { data: text } = await supabaseAdmin.from('session_video_text').select('selected_title, description_approved').eq('session_video_id', v.id).maybeSingle()
  const { data: th } = v.agenda_session_id ? await supabaseAdmin.from('session_thumbnails').select('image_jpg_path').eq('agenda_session_id', v.agenda_session_id).maybeSingle() : { data: null }
  const replaced = round.status === 'withdrawn' || (!!v.youtube_fingerprint && round.fingerprint !== v.youtube_fingerprint)
  const ytId = (v.youtube_video_id as string | null) ?? null
  const embeddable = !!ytId && !v.youtube_locked_private
  let others: Array<{ name: string; status: string; comment: string | null }> = []
  if (round.layer === 'internal') {
    const { data } = await supabaseAdmin.from('session_video_approval_recipients').select('id, name, status, comment').eq('round_id', round.id).neq('id', rec.id).order('name')
    others = (data ?? []).map(o => ({ name: o.name as string, status: o.status as string, comment: (o.comment as string | null) ?? null }))
  }
  return {
    layer: round.layer as Layer, event_name: ctx.eventName, session_title: ctx.sessionTitle, recipient_name: rec.name as string,
    title: (text?.selected_title as string | null) ?? ctx.sessionTitle, description: (text?.description_approved as string | null) ?? '', thumbnail_url: (th?.image_jpg_path as string | null) ?? null,
    youtube_id: embeddable ? ytId : null, watch_url: embeddable && ytId ? youtubeWatchUrl(ytId) : null,
    video_url: !embeddable && v.render_path ? await presignGet(v.render_path as string, 6 * 3600) : null,
    round_status: round.status as string, replaced, resolved_by_name: (round.resolved_by_name as string | null) ?? null,
    my_status: rec.status as string, my_comment: (rec.comment as string | null) ?? null, others, sent_by_name: (round.sent_by_name as string | null) ?? null,
    rule: round.layer === 'internal' ? 'Everyone asked needs to approve.' : 'Only one of you needs to answer; the first answer settles it.',
  }
}

export async function respond(token: string, decision: 'approved' | 'approved_with_comments' | 'changes_requested', comment: string | null): Promise<{ ok: true } | { error: string; status: number }> {
  const f = await recipientByToken(token)
  if (!f) return { error: 'This review link is not valid.', status: 404 }
  const { rec, round, v } = f
  if (Date.parse(rec.token_expires_at as string) < Date.now()) return { error: 'This review link has expired.', status: 410 }
  if (round.status === 'withdrawn' || (!!v.youtube_fingerprint && round.fingerprint !== v.youtube_fingerprint)) return { error: 'This version was replaced — you will get a new link for the updated video.', status: 409 }
  if (round.status !== 'pending') return { error: round.layer === 'client' ? `${round.resolved_by_name ?? 'A colleague'} has already answered for your team.` : 'This review is already closed.', status: 409 }
  const c = (comment ?? '').trim().slice(0, 4000) || null
  if ((decision === 'changes_requested' || decision === 'approved_with_comments') && !c) return { error: 'Please write what should change.', status: 400 }
  const { data: done } = await supabaseAdmin.from('session_video_approval_recipients').update({ status: decision, comment: c, actioned_at: now() }).eq('id', rec.id).eq('status', 'pending').select('id')
  if (!done?.length) return { error: 'You have already answered.', status: 409 }

  // Settle the round. Client: the first answer decides. Internal: any "changes requested" decides; otherwise when everyone has approved.
  let outcome: string | null = null
  if (round.layer === 'client') outcome = decision
  else {
    const { data: all } = await supabaseAdmin.from('session_video_approval_recipients').select('status, comment').eq('round_id', round.id)
    const list = all ?? []
    if (list.some(r => r.status === 'changes_requested')) outcome = 'changes_requested'
    else if (list.every(r => r.status !== 'pending')) outcome = list.some(r => r.status === 'approved_with_comments') ? 'approved_with_comments' : 'approved'
  }
  if (outcome) {
    const { data: settled } = await supabaseAdmin.from('session_video_approval_rounds').update({ status: outcome, resolved_at: now(), resolved_by_name: round.layer === 'client' ? rec.name : null }).eq('id', round.id).eq('status', 'pending').select('id')
    if (settled?.length) await notifyProducer(v, round, outcome, rec.name as string, c)
  }
  return { ok: true }
}

// ── email ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function mailContext(v: VideoRow) {
  const [{ data: ev }, { data: ses }] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name').eq('id', v.event_id).maybeSingle(),
    v.agenda_session_id ? supabaseAdmin.from('event_agenda_sessions').select('title').eq('id', v.agenda_session_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return { eventName: ((ev?.public_name as string | null) || (ev?.name as string | null)) ?? 'the event', sessionTitle: (ses?.title as string | null) ?? 'Session video', pagePath: `/admin/events/${v.event_id}/session-videos/${v.agenda_session_id ?? ''}` }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* eslint-disable no-restricted-syntax -- email HTML needs literal colours */
async function sendReviewEmail(a: { eventId: string; to: string; name: string; layer: Layer; token: string; ctx: Awaited<ReturnType<typeof mailContext>>; sender: { name: string; email: string | null }; message: string | null; lockedPrivate: boolean; watchUrl: string | null }): Promise<boolean> {
  const first = esc(a.name.split(' ')[0] || a.name)
  const rule = a.layer === 'internal' ? 'Everyone on this review needs to approve before it goes to the client.' : 'Only one of you needs to answer.'
  const body = `<p>Dear ${first},</p>
<p>The session video <strong>“${esc(a.ctx.sessionTitle)}”</strong> from <strong>${esc(a.ctx.eventName)}</strong> is ready for your ${a.layer === 'internal' ? 'review' : 'approval'} before it goes public on YouTube.</p>
<p>Please watch it and check the title, description and thumbnail, then approve it or tell us what should change. ${rule}</p>
${a.message ? `<p style="padding:10px 14px;background:#F0F4F8;border-radius:8px;">${esc(a.message).replace(/\n/g, '<br/>')}</p>` : ''}
<p><a href="${videoReviewLink(a.token)}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Watch &amp; respond &rarr;</a></p>
${a.watchUrl && !a.lockedPrivate ? `<p style="font-size:13px;color:#555;">It is also on YouTube (unlisted — only people with the link can see it): <a href="${a.watchUrl}">${a.watchUrl}</a></p>` : ''}
<p>Thank you,<br/>${esc(a.sender.name)}</p>`
  const { html } = renderEmailTemplate({ subject: '', body_html: body, header_image_url: null, header_alt_text: null } as Parameters<typeof renderEmailTemplate>[0], {})
  const subject = `${a.layer === 'internal' ? 'Review' : 'Approval needed'}: session video — ${a.ctx.sessionTitle}`
  try {
    if (a.sender.email) await sendGraphMail({ senderEmail: a.sender.email, senderName: a.sender.name, to: a.to, subject, html })
    else await sendSystemMail({ to: a.to, subject, html })
    return true
  } catch (e) {
    console.error('[video-review] email failed:', a.to, e instanceof Error ? e.message : e)
    return false
  }
}

async function notifyProducer(v: VideoRow, round: Record<string, unknown>, outcome: string, by: string, comment: string | null): Promise<void> {
  try {
    const ctx = await mailContext(v)
    const what = outcome === 'changes_requested' ? 'asked for changes to' : outcome === 'approved_with_comments' ? 'approved (with comments)' : 'approved'
    const who = round.layer === 'client' ? `${by} (client)` : round.layer === 'internal' && outcome !== 'changes_requested' ? 'Everyone on the internal review' : by
    const title = `${who} ${what} the session video`
    const body = `“${ctx.sessionTitle}” — ${ctx.eventName}.${comment ? ` Comment: “${comment}”` : ''}`
    if (round.sent_by) await notifyStaff([round.sent_by as string], { type: 'session_video_approval', title, body, link: ctx.pagePath, eventId: v.event_id })
    if (round.sent_by_email) {
      await sendSystemMail({ to: round.sent_by_email as string, subject: `${title}: ${ctx.sessionTitle}`, html: `<p>${esc(title)}.</p><p>${esc(body)}</p><p><a href="${siteUrl()}${ctx.pagePath}">Open the session video</a></p>` }).catch(() => undefined)
    }
  } catch (e) { console.error('[video-review] notify failed:', e instanceof Error ? e.message : e) }
}
/* eslint-enable no-restricted-syntax */
