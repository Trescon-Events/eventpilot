import { supabaseAdmin } from '@/app/lib/supabase'
import type { TcsSession } from '@/app/lib/access/session'
import { renderEmailTemplate, type EmailTemplateRow } from '@/app/lib/email/render-template'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { sendOpsNotice } from '@/app/lib/ops/vendor-auth/mail'
import { getStaffWithPermission } from '@/app/lib/ops/vendor-auth/support'
import { notifyStaff } from '@/app/lib/notify'
import { guestRecipients } from '@/app/lib/guest-invites/send'
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
  const { data } = await supabaseAdmin.from('event_media_days').select('day, open_time, close_time').eq('event_id', eventId).order('day', { ascending: true })
  return (data ?? []).map(d => ({ day: d.day as string, open: d.open_time as string, close: d.close_time as string }))
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

export type Composed = { speaker_id: string; request_id: string | null; to: string; cc: string[]; subject: string; html: string; sender_name: string; sender_email: string; token: string }
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

  let token = 'preview', requestId: string | null = null
  const { data: existing } = await supabaseAdmin.from('media_interest_requests').select('id, token, status').eq('event_id', eventId).eq('speaker_id', speakerId).maybeSingle()
  if (existing) { token = existing.token as string; requestId = existing.id as string }
  else if (!opts.previewOnly) {
    const { data: row, error } = await supabaseAdmin.from('media_interest_requests').insert({ event_id: eventId, speaker_id: speakerId, token: newToken(), token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(), sent_by: session?.sid && session.sid !== 'super-admin' ? session.sid : null }).select('id, token').single()
    if (error || !row) return { error: error?.message ?? 'Could not create the request', status: 500 }
    token = row.token as string; requestId = row.id as string
  }
  const note = (opts.note ?? '').trim()
  const { subject, html } = renderEmailTemplate(template, {
    speaker_name: (s.public_name as string) || (s.name as string) || '', event_name: (ev?.name as string) ?? '', link: mediaLink(token),
    extra_note: note ? `<p>${esc(note).replace(/\n/g, '<br/>')}</p>` : '', producer_name: sender.name,
  })
  return { speaker_id: speakerId, request_id: requestId, to: rec.to, cc: rec.cc, subject, html, sender_name: sender.name, sender_email: sender.email, token }
}

/** Sends one composed request. A first send resets the link's expiry; a resend keeps the link and extends it. */
export async function sendMediaRequest(c: Composed): Promise<{ ok: true } | { error: string }> {
  try {
    await sendGraphMail({ senderEmail: c.sender_email, senderName: c.sender_name, to: c.to, cc: c.cc.length ? c.cc : undefined, subject: c.subject, html: c.html })
    if (c.request_id) await supabaseAdmin.from('media_interest_requests').update({ sent_at: new Date().toISOString(), token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() }).eq('id', c.request_id)
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
    if (a.status === 'interested') await sendOpsNotice({ to: contacts.map(c => c.email), subject: title, heading: a.changed ? 'Media availability updated' : 'New media availability', message: body, link: { href: `${siteUrl()}${prPagePath(a.eventId)}`, label: 'Open PR & Media' } })
  } catch (e) {
    console.error('[pr-media] PR notification failed:', e instanceof Error ? e.message : e)
  }
}
