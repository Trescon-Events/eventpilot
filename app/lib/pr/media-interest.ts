import { supabaseAdmin } from '@/app/lib/supabase'
import type { TcsSession } from '@/app/lib/access/session'
import { renderEmailTemplate, type EmailTemplateRow } from '@/app/lib/email/render-template'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { sendSpeakerThreadMail, speakerThreadSubjectFor } from '@/app/lib/email/speaker-thread'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { getStaffWithPermission } from '@/app/lib/ops/vendor-auth/support'
import { notifyStaff } from '@/app/lib/notify'
import { guestRecipients } from '@/app/lib/guest-invites/send'
import { speakerEmailOf } from '@/app/lib/guest-invites/access'
import { newToken, siteUrl } from '@/app/lib/badges/client-approval'
import { normalizeTimezone, utcToZonedLocal } from '@/app/lib/events/timezones'
import { daysBetween, describeWindows, toMinutes, fromMinutes, type MediaDay, type MediaWindow } from './windows'

/* PR & Media: media interview interest requests. See supabase/pr_media_migration.sql. */

export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const mediaLink = (token: string) => `${siteUrl()}/public/media-interest/${token}`
export const prPagePath = (eventId: string) => `/admin/events/${eventId}/pr-media`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type PrContact = { id: string; name: string; email: string; phone: string | null; role: string | null }

export async function eventTimezone(eventId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle()
  return normalizeTimezone(data?.timezone as string | null) ?? 'Asia/Dubai'
}

/** The PR person(s) assigned to this event. With nobody assigned, whoever holds pr.manage — a submission is never left without a recipient. */
export async function prContactsFor(eventId: string): Promise<{ contacts: PrContact[]; assigned: boolean }> {
  const { data } = await supabaseAdmin.from('event_pr_contacts').select('staff:staff_members!staff_id(id, name, email, phone, role)').eq('event_id', eventId).order('assigned_at', { ascending: true })
  const assigned = (data ?? []).map(r => (Array.isArray(r.staff) ? r.staff[0] : r.staff) as PrContact | null).filter((s): s is PrContact => !!s?.email)
  if (assigned.length) return { contacts: assigned, assigned: true }
  const fallback = await getStaffWithPermission(eventId, 'pr.manage')
  return { contacts: fallback.map(s => ({ id: s.id, name: s.name, email: s.email, phone: null, role: null })), assigned: false }
}

/** Days and hours the form offers, as the PR person saved them (empty until they do). */
export async function loadMediaDays(eventId: string): Promise<MediaDay[]> {
  const { data } = await supabaseAdmin.from('event_media_days').select('day, open_time, close_time, slot_minutes').eq('event_id', eventId).order('day', { ascending: true })
  return (data ?? []).map(d => ({ day: d.day as string, open: d.open_time as string, close: d.close_time as string, slot: d.slot_minutes === 30 ? 30 as const : 60 as const }))
}

export async function loadSettings(eventId: string): Promise<{ intro: string | null; days_confirmed_at: string | null }> {
  const { data } = await supabaseAdmin.from('event_pr_settings').select('intro, days_confirmed_at').eq('event_id', eventId).maybeSingle()
  return { intro: (data?.intro as string | null) ?? null, days_confirmed_at: (data?.days_confirmed_at as string | null) ?? null }
}

/** A starting point for the PR person: from the agenda when it has sessions (first start to last end per local day, rounded out to the hour),
 *  otherwise the event's real days (or planned dates) at 09:00-17:00. */
export async function suggestMediaDays(eventId: string): Promise<{ days: MediaDay[]; source: 'agenda' | 'event_days' | 'none' }> {
  const tz = await eventTimezone(eventId)
  const { data: sessions } = await supabaseAdmin.from('event_agenda_sessions').select('start_timestamp, end_timestamp').eq('event_id', eventId).not('start_timestamp', 'is', null).not('end_timestamp', 'is', null)
  const span = new Map<string, { s: number; e: number }>()
  for (const s of sessions ?? []) {
    const a = utcToZonedLocal(s.start_timestamp as string, tz), b = utcToZonedLocal(s.end_timestamp as string, tz)
    const day = a.slice(0, 10)
    const sm = toMinutes(a.slice(11, 16)), em = b.slice(0, 10) === day ? toMinutes(b.slice(11, 16)) : 24 * 60 - 1
    const cur = span.get(day)
    span.set(day, { s: Math.min(cur?.s ?? sm, sm), e: Math.max(cur?.e ?? em, em) })
  }
  if (span.size) {
    return { source: 'agenda', days: [...span.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([day, v]) => ({ day, open: fromMinutes(Math.floor(v.s / 60) * 60), close: fromMinutes(Math.min(Math.ceil(v.e / 60) * 60, 23 * 60 + 59)) })) }
  }
  const { data: ev } = await supabaseAdmin.from('events').select('actual_start_date, actual_end_date, event_date, end_date').eq('id', eventId).maybeSingle()
  const start = (ev?.actual_start_date ?? ev?.event_date) as string | null
  const end = (ev?.actual_end_date ?? ev?.end_date ?? start) as string | null
  if (!start) return { days: [], source: 'none' }
  return { source: 'event_days', days: daysBetween(start.slice(0, 10), (end ?? start).slice(0, 10)).map(day => ({ day, open: '09:00', close: '17:00' })) }
}

/** The speaker's own agenda sessions, as event-local day + times, so the form can show them as busy. */
export async function speakerBusyTimes(eventId: string, speakerId: string): Promise<{ date: string; from: string; to: string; title: string }[]> {
  const tz = await eventTimezone(eventId)
  const { data } = await supabaseAdmin.from('event_agenda_session_speakers').select('session:event_agenda_sessions!inner(title, start_timestamp, end_timestamp, event_id, status)').eq('speaker_id', speakerId)
  type S = { title: string; start_timestamp: string | null; end_timestamp: string | null; event_id: string; status: string }
  const out: { date: string; from: string; to: string; title: string }[] = []
  for (const r of data ?? []) {
    const s = (Array.isArray(r.session) ? r.session[0] : r.session) as S | undefined
    if (!s || s.event_id !== eventId || s.status === 'draft' || !s.start_timestamp || !s.end_timestamp) continue
    const a = utcToZonedLocal(s.start_timestamp, tz), b = utcToZonedLocal(s.end_timestamp, tz)
    out.push({ date: a.slice(0, 10), from: a.slice(11, 16), to: b.slice(0, 10) === a.slice(0, 10) ? b.slice(11, 16) : '23:59', title: s.title })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.from.localeCompare(y.from))
}

type TemplateRow = EmailTemplateRow & { id: string; sender_name: string; sender_email: string }
export async function loadRequestTemplate(): Promise<TemplateRow | null> {
  const { data } = await supabaseAdmin.from('email_templates').select('id, subject, body_html, header_image_url, header_alt_text, sender_name, sender_email').eq('slug', 'media_interest_request').eq('is_active', true).maybeSingle()
  return (data as TemplateRow | null) ?? null
}

export type Composed = { event_id: string; sent_by: string | null; speaker_id: string; request_id: string | null; to: string; cc: string[]; subject: string; html: string; sender_name: string; sender_email: string; token: string }
export type Failure = { error: string; status: number }

/** Renders the request for one speaker (sent as that speaker's producer). `previewOnly` doesn't create the request row, so a preview leaves no trace. */
export async function composeMediaRequest(speakerId: string, eventId: string, session: TcsSession | null, opts: { note?: string; previewOnly?: boolean } = {}): Promise<Composed | Failure> {
  const { data: s } = await supabaseAdmin.from('event_speakers').select('id, event_id, name, public_name, email, custom_fields, producer_staff_id').eq('id', speakerId).maybeSingle()
  if (!s || s.event_id !== eventId) return { error: 'Not a speaker of this event', status: 404 }
  const rec = await guestRecipients(speakerId, s.custom_fields as Record<string, unknown> | null, s.email as string | null)
  if (!rec.to) return { error: 'No email address on file for this speaker or any additional contact', status: 422 }
  const template = await loadRequestTemplate()
  if (!template) return { error: 'The media interview email template is missing — ask an admin to run the PR & Media migration.', status: 404 }
  const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', eventId).maybeSingle()
  const sender = await resolveSenderIdentity(session, template, s.producer_staff_id as string | null)

  // The row is only created once the email has really gone out (see sendMediaRequest) — a failed send must not leave a "pending" request behind,
  // or the speaker would show as "Already asked" and could not be retried.
  let token = 'preview', requestId: string | null = null
  const { data: existing } = await supabaseAdmin.from('media_interest_requests').select('id, token, status').eq('event_id', eventId).eq('speaker_id', speakerId).maybeSingle()
  if (existing) { token = existing.token as string; requestId = existing.id as string }
  else if (!opts.previewOnly) token = newToken()
  const note = (opts.note ?? '').trim()
  const { subject: templateSubject, html } = renderEmailTemplate(template, {
    speaker_name: (s.public_name as string) || (s.name as string) || '', event_name: (ev?.name as string) ?? '', link: mediaLink(token),
    extra_note: note ? `<p>${esc(note).replace(/\n/g, '<br/>')}</p>` : '', producer_name: sender.name,
  })
  // The subject is the speaker's fixed thread subject ("<Speaker> @ <Event>"), like every other speaker email; the template's own subject is not used.
  const subject = (await speakerThreadSubjectFor(speakerId, sender.email)) ?? templateSubject
  return { event_id: eventId, sent_by: session?.sid && session.sid !== 'super-admin' ? session.sid : null, speaker_id: speakerId, request_id: requestId, to: rec.to, cc: rec.cc, subject, html, sender_name: sender.name, sender_email: sender.email, token }
}

/** Sends one composed request. A first send resets the link's expiry; a resend keeps the link and extends it. */
export async function sendMediaRequest(c: Composed): Promise<{ ok: true } | { error: string }> {
  try {
    await sendSpeakerThreadMail(c.speaker_id, { senderEmail: c.sender_email, senderName: c.sender_name, to: c.to, cc: c.cc.length ? c.cc : undefined, subject: c.subject, html: c.html })
    const sentAt = new Date().toISOString(), expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
    if (c.request_id) await supabaseAdmin.from('media_interest_requests').update({ sent_at: sentAt, token_expires_at: expires }).eq('id', c.request_id)
    else {
      const { error } = await supabaseAdmin.from('media_interest_requests').insert({ event_id: c.event_id, speaker_id: c.speaker_id, token: c.token, token_expires_at: expires, sent_at: sentAt, sent_by: c.sent_by })
      if (error) console.error('[pr-media] request row not saved after send:', error.message)
    }
    return { ok: true }
  } catch (e) {
    console.error('[pr-media] send failed:', c.to, e instanceof Error ? e.message : e)
    return { error: 'The email could not be sent.' }
  }
}

/** Tells the event's PR person(s) a speaker answered (email + bell). Never throws. A "not interested" answer is a quiet bell only. */
export async function notifyPrOfResponse(a: { eventId: string; eventName: string; speakerName: string; status: 'interested' | 'declined'; windows: MediaWindow[]; note: string | null; changed: boolean }): Promise<void> {
  try {
    const { contacts } = await prContactsFor(a.eventId)
    if (!contacts.length) return
    const byDay = new Map<string, MediaWindow[]>()
    for (const w of a.windows) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w])
    const when = [...byDay.entries()].map(([d, ws]) => `${d}: ${describeWindows(ws)}`).join('; ')
    const title = a.status === 'declined' ? `${a.speakerName} is not available for media — ${a.eventName}` : `${a.speakerName} ${a.changed ? 'updated' : 'shared'} media availability — ${a.eventName}`
    const body = a.status === 'declined' ? `${a.speakerName} said they are not open to media interviews at ${a.eventName}.` : `${a.speakerName} is open to media interviews at ${a.eventName}. Available: ${when || 'no times given'}.${a.note ? ` Note: ${a.note}` : ''}`
    await notifyStaff(contacts.map(c => c.id), { type: 'media_interest_response', title, body, link: prPagePath(a.eventId), eventId: a.eventId })
    if (a.status === 'interested') await sendSystemMail({ to: contacts.map(c => c.email), subject: title, html: availabilityEmailHtml({ speakerName: a.speakerName, eventName: a.eventName, windows: a.windows, note: a.note, changed: a.changed, href: `${siteUrl()}${prPagePath(a.eventId)}` }) })
  } catch (e) {
    console.error('[pr-media] PR notification failed:', e instanceof Error ? e.message : e)
  }
}

export type PlanRow = { id: string; name: string; to: string | null; cc: string[]; from: string | null; state: 'ready' | 'asked' | 'answered' | 'no_email'; asked_at: string | null }

/** What would happen to each selected speaker if the request were sent now — shown before anyone presses Send. */
export async function planMediaRequests(eventId: string, speakerIds: string[], session: TcsSession | null): Promise<PlanRow[]> {
  const [{ data: sps }, { data: reqs }, template] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('id, name, public_name, email, custom_fields, producer_staff_id').eq('event_id', eventId).in('id', speakerIds),
    supabaseAdmin.from('media_interest_requests').select('speaker_id, status, sent_at').eq('event_id', eventId).in('speaker_id', speakerIds),
    loadRequestTemplate(),
  ])
  const reqOf = new Map((reqs ?? []).map(r => [r.speaker_id as string, r]))
  const rows: PlanRow[] = []
  for (const id of speakerIds) {
    const s = (sps ?? []).find(x => x.id === id); if (!s) continue
    const rec = await guestRecipients(id, s.custom_fields as Record<string, unknown> | null, s.email as string | null)
    const r = reqOf.get(id)
    const sender = template ? await resolveSenderIdentity(session, template, s.producer_staff_id as string | null) : null
    rows.push({
      id, name: ((s.public_name as string) || (s.name as string) || '').trim(), to: rec.to ?? null, cc: rec.cc, from: sender ? `${sender.name} <${sender.email}>` : null,
      state: !rec.to ? 'no_email' : !r ? 'ready' : r.status === 'pending' ? 'asked' : 'answered', asked_at: (r?.sent_at as string | null) ?? null,
    })
  }
  return rows
}

export type MediaRow = {
  speaker_id: string; name: string; company: string | null; role: string | null; producer: string | null; request_id: string | null
  state: 'not_asked' | 'asked' | 'interested' | 'declined'; windows: MediaWindow[]; note: string | null; pr_note: string | null
  sent_at: string | null; submitted_at: string | null; last_opened_at: string | null; reminder_count: number; expired: boolean; has_email: boolean
}

/** Every active speaker with their media-interview state. Producers see all of it; the PR page narrows it to the speakers who said yes. */
export async function loadMediaRows(eventId: string): Promise<MediaRow[]> {
  const [{ data: speakers }, { data: reqs }] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('id, name, public_name, company, role, email, custom_fields, producer:staff_members!producer_staff_id(name)').eq('event_id', eventId).eq('active', true),
    supabaseAdmin.from('media_interest_requests').select('id, speaker_id, status, windows, note, pr_note, sent_at, submitted_at, last_opened_at, reminder_count, token_expires_at').eq('event_id', eventId),
  ])
  // Same recipients rule as every other speaker email (guestRecipients): the speaker's own address, else an Additional Contact. The speaker's address usually lives in
  // custom_fields.email, not the email column.
  const ids = (speakers ?? []).map(s => s.id as string)
  const { data: contactRows } = ids.length ? await supabaseAdmin.from('speaker_additional_contacts').select('speaker_id, email').in('speaker_id', ids) : { data: [] as { speaker_id: string; email: string | null }[] }
  const withContact = new Set((contactRows ?? []).filter(c => (c.email ?? '').trim()).map(c => c.speaker_id as string))
  const byS = new Map((reqs ?? []).map(r => [r.speaker_id as string, r]))
  return (speakers ?? []).map(s => {
    const r = byS.get(s.id as string)
    const producer = (Array.isArray(s.producer) ? s.producer[0] : s.producer) as { name: string } | null
    return {
      speaker_id: s.id as string, name: ((s.public_name as string) || (s.name as string)) ?? '', company: (s.company as string | null) ?? null, role: (s.role as string | null) ?? null, producer: producer?.name ?? null,
      request_id: (r?.id as string | undefined) ?? null, state: (!r ? 'not_asked' : r.status === 'pending' ? 'asked' : r.status) as MediaRow['state'],
      windows: (r?.windows as MediaWindow[] | undefined) ?? [], note: (r?.note as string | null) ?? null, pr_note: (r?.pr_note as string | null) ?? null, sent_at: (r?.sent_at as string | null) ?? null,
      submitted_at: (r?.submitted_at as string | null) ?? null, last_opened_at: (r?.last_opened_at as string | null) ?? null, reminder_count: (r?.reminder_count as number | undefined) ?? 0,
      expired: r ? new Date(r.token_expires_at as string) < new Date() : false, has_email: !!speakerEmailOf(s.custom_fields as Record<string, unknown> | null, s.email as string | null) || withContact.has(s.id as string),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

const longDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The email PR gets when a speaker says yes: each date on its own row with that day's time slots beside it. */
/* eslint-disable no-restricted-syntax -- email HTML needs literal colours */
function availabilityEmailHtml(a: { speakerName: string; eventName: string; windows: MediaWindow[]; note: string | null; changed: boolean; href: string }): string {
  const days = [...new Set(a.windows.map(w => w.date))].sort()
  const rows = days.map(d => {
    const slots = a.windows.filter(w => w.date === d).sort((x, y) => toMinutes(x.from) - toMinutes(y.from)).map(w => `${w.from}–${w.to}`).join(', ')
    return `<tr><td style="padding:10px 14px;border-top:1px solid #E8EEF4;font-weight:700;color:#080A0B;white-space:nowrap;vertical-align:top;">${esc(longDay(d))}</td><td style="padding:10px 14px;border-top:1px solid #E8EEF4;color:#080A0B;">${esc(slots)}</td></tr>`
  }).join('')
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F0F4F8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E8EEF4;">
    <div style="background:#0F1923;padding:20px 28px;"><span style="color:#fff;font-size:16px;font-weight:800;">EventPilot · PR &amp; Media</span></div>
    <div style="padding:26px 28px;color:#080A0B;">
      <h2 style="font-size:20px;margin:0 0 10px;">${a.changed ? 'Media availability updated' : 'New media availability'}</h2>
      <p style="color:#5B7080;font-size:15px;line-height:1.6;margin:0 0 16px;"><strong style="color:#080A0B;">${esc(a.speakerName)}</strong> is open to media interviews at <strong style="color:#080A0B;">${esc(a.eventName)}</strong>. Times are event time.</p>
      <table style="border-collapse:collapse;width:100%;border:1px solid #E8EEF4;border-radius:8px;font-size:14.5px;line-height:1.5;"><tbody>
        <tr><td colspan="2" style="padding:8px 14px;background:#F7F9FA;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#5B7080;">Available</td></tr>
        ${rows || '<tr><td style="padding:10px 14px;color:#5B7080;">No times given.</td></tr>'}
      </tbody></table>
      ${a.note ? `<p style="color:#5B7080;font-size:14px;line-height:1.6;margin:16px 0 0;"><strong style="color:#080A0B;">Note from the speaker:</strong> ${esc(a.note)}</p>` : ''}
      <p style="margin:22px 0;"><a href="${esc(a.href)}" style="background:#00A5A3;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block;">Open PR &amp; Media</a></p>
      <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin:0;">This is an automated message from EventPilot.</p>
    </div></div></body></html>`
}
/* eslint-enable no-restricted-syntax */

export type PrSpeakerCard = MediaRow & {
  public_name: string; country: string | null; short_bio: string | null; full_bio_url: string | null; email: string | null; phone: string | null
  additional_contacts: { name: string; email: string }[]
}

/** The speakers who said yes, with everything PR needs to pitch them to the media: profile, bios, how to reach them and any additional contacts. */
export async function loadInterestedForPr(eventId: string): Promise<PrSpeakerCard[]> {
  const rows = (await loadMediaRows(eventId)).filter(r => r.state === 'interested')
  if (!rows.length) return []
  const ids = rows.map(r => r.speaker_id)
  const [{ data: sps }, { data: contacts }] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('id, public_name, name, country, bio, bio_full_url, email, phone, custom_fields').in('id', ids),
    supabaseAdmin.from('speaker_additional_contacts').select('speaker_id, first_name, last_name, email').in('speaker_id', ids).order('created_at', { ascending: true }),
  ])
  const byId = new Map((sps ?? []).map(s => [s.id as string, s]))
  return rows.map(r => {
    const s = byId.get(r.speaker_id)
    const cf = (s?.custom_fields ?? null) as Record<string, unknown> | null
    const phoneRaw = (s?.phone as string | null) || (typeof cf?.phone === 'string' ? cf.phone : Array.isArray(cf?.phone) && typeof cf.phone[0] === 'string' ? cf.phone[0] : null)
    return {
      ...r, public_name: ((s?.public_name as string) || (s?.name as string) || r.name).trim(), country: (s?.country as string | null) || null,
      short_bio: ((s?.bio as string | null) ?? '').trim() || null, full_bio_url: (s?.bio_full_url as string | null) || null,
      email: speakerEmailOf(cf, (s?.email as string | null) ?? null) || null, phone: (phoneRaw ?? '').trim() || null,
      additional_contacts: (contacts ?? []).filter(c => c.speaker_id === r.speaker_id && (c.email ?? '').trim()).map(c => ({ name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(), email: (c.email as string).trim() })),
    }
  })
}
