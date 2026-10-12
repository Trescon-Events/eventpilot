/* eslint-disable no-restricted-syntax -- the reminder is an email: inline styles with literal colours are required there */
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { isEventFeatureEnabled } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { staffForSection } from '@/app/lib/ops/section-access'

/* Operations > Speaker Documents (2026-10-12): every CONFIRMED speaker of the scope's events with the STATUS of their
   Passport / National ID — never the files. 'missing' = not received, 'in_progress' = received but the producer hasn't
   marked it reviewed, 'reviewed' = done. Same meanings as the producer Status Board (speakers/status-board/route.ts). */

export type DocStatus = 'missing' | 'in_progress' | 'reviewed'
export type DocType = 'passport' | 'national_id'
export type SpeakerDocRow = {
  id: string; event_id: string; event_name: string; name: string; role: string | null; company: string | null
  producer_id: string | null; producer_name: string | null
  is_uae_resident: boolean | null; national_id_applicable: boolean
  passport: DocStatus; national_id: DocStatus; last_reminded_at: string | null
}

export const REMIND_COOLDOWN_HOURS = 24

/** What is still outstanding for a speaker (a document that is not yet 'reviewed'; National ID only when it applies). */
export const outstandingDocs = (r: Pick<SpeakerDocRow, 'passport' | 'national_id' | 'national_id_applicable'>): DocType[] => [
  ...(r.passport !== 'reviewed' ? ['passport' as const] : []),
  ...(r.national_id_applicable && r.national_id !== 'reviewed' ? ['national_id' as const] : []),
]

export async function loadSpeakerDocRows(eventIds: string[]): Promise<SpeakerDocRow[]> {
  if (!eventIds.length) return []
  const [{ data: speakers }, { data: events }] = await Promise.all([
    supabaseAdmin.from('event_speakers')
      .select('id, event_id, name, public_name, role, company, producer_staff_id, is_uae_resident')
      .in('event_id', eventIds).eq('active', true).eq('confirmation_status', 'Confirmed').neq('announcement_status', 'archived')
      .order('name', { ascending: true }),
    supabaseAdmin.from('events').select('id, name').in('id', eventIds),
  ])
  const list = speakers ?? []
  const ids = list.map(s => s.id as string)
  const producerIds = [...new Set(list.map(s => s.producer_staff_id as string | null).filter((x): x is string => !!x))]
  const [docs, producers, reminders, uaeFlags] = await Promise.all([
    ids.length ? supabaseAdmin.from('speaker_sensitive_documents').select('speaker_id, document_type, reviewed_at').in('speaker_id', ids).is('deleted_at', null).then(r => r.data ?? []) : [],
    producerIds.length ? supabaseAdmin.from('staff_members').select('id, name').in('id', producerIds).then(r => r.data ?? []) : [],
    ids.length ? supabaseAdmin.from('ops_document_reminders').select('speaker_id, sent_at').in('speaker_id', ids).order('sent_at', { ascending: false }).then(r => r.data ?? []) : [],
    Promise.all(eventIds.map(async id => [id, await isEventFeatureEnabled(id, 'uae-resident-field')] as const)),
  ])
  const docStatus = new Map(docs.map(d => [`${d.speaker_id}:${d.document_type}`, (d.reviewed_at ? 'reviewed' : 'in_progress') as DocStatus]))
  const producerName = new Map(producers.map(p => [p.id as string, p.name as string]))
  const lastReminded = new Map<string, string>()
  for (const r of reminders) if (!lastReminded.has(r.speaker_id as string)) lastReminded.set(r.speaker_id as string, r.sent_at as string)
  const uae = new Map(uaeFlags)
  const eventName = new Map((events ?? []).map(e => [e.id as string, e.name as string]))
  return list.map(s => ({
    id: s.id, event_id: s.event_id, event_name: eventName.get(s.event_id) ?? '', name: (s.public_name || s.name) as string, role: s.role, company: s.company,
    producer_id: s.producer_staff_id, producer_name: s.producer_staff_id ? producerName.get(s.producer_staff_id) ?? null : null,
    is_uae_resident: s.is_uae_resident,
    // Mirrors the Status Board: National ID is only required of UAE residents (unknown still counts as required).
    national_id_applicable: (uae.get(s.event_id) ?? true) && s.is_uae_resident !== false,
    passport: docStatus.get(`${s.id}:passport`) ?? 'missing', national_id: docStatus.get(`${s.id}:national_id`) ?? 'missing',
    last_reminded_at: lastReminded.get(s.id) ?? null,
  }))
}

/** Who the reminder goes out as: the Ops person ASSIGNED to Speaker Documents for the event (the clicker, if they are one of them). Null → noreply. */
export async function resolveReminderSender(eventId: string, clickerStaffId: string | undefined): Promise<{ name: string; email: string } | null> {
  const { staff, assigned } = await staffForSection(eventId, 'speakers')
  if (!assigned || !staff.length) return null
  const s = staff.find(x => x.id === clickerStaffId) ?? staff[0]
  return { name: s.name, email: s.email }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const LABEL: Record<DocType, string> = { passport: 'Passport', national_id: 'National ID' }
const STATE: Record<DocStatus, string> = { missing: 'not received', in_progress: 'received, awaiting your review', reviewed: 'reviewed' }
export const APP_BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventpilot.tresconglobal.com').replace(/\/$/, '')

export type ReminderItem = { event_id: string; event_name: string; speakers: { name: string; docs: { type: DocType; status: DocStatus }[] }[] }

export function buildReminder(a: { producerName: string; senderName: string; producerId: string; items: ReminderItem[] }): { subject: string; html: string } {
  const total = a.items.reduce((n, i) => n + i.speakers.length, 0)
  const sections = a.items.map(i => {
    const link = `${APP_BASE}/admin/events/${i.event_id}/stakeholders/status-board?missing=documents&producer=${a.producerId}`
    const rows = i.speakers.map(s => `<li style="margin:0 0 4px;"><strong>${esc(s.name)}</strong> — ${s.docs.map(d => `${LABEL[d.type]} ${STATE[d.status]}`).join('; ')}</li>`).join('')
    return `<p style="margin:16px 0 6px;font-weight:700;">${esc(i.event_name)}</p><ul style="margin:0 0 8px;padding-left:20px;">${rows}</ul><p style="margin:0 0 6px;"><a href="${link}">Open these in the Status Board</a></p>`
  }).join('')
  const html = `<div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.6;color:#080A0B;">
    <p>Hi ${esc(a.producerName.split(' ')[0])},</p>
    <p>Ops is tracking Passport / National ID documents for confirmed speakers. ${total === 1 ? 'One of your speakers still has' : `${total} of your speakers still have`} something outstanding:</p>
    ${sections}
    <p>Once a document is uploaded and marked as reviewed it drops off this list. Thank you!</p>
    <p>${esc(a.senderName)}</p></div>`
  return { subject: total === 1 ? 'Reminder: 1 speaker document outstanding' : `Reminder: ${total} speaker documents outstanding`, html }
}

/** Sends from the assigned Ops person's Outlook; falls back to the shared noreply sender if there is none, or Graph refuses. Returns the mailbox used. */
export async function sendReminder(a: { to: string; sender: { name: string; email: string } | null; subject: string; html: string }): Promise<string> {
  if (a.sender) {
    try {
      await sendGraphMail({ senderEmail: a.sender.email, senderName: a.sender.name, to: a.to, subject: a.subject, html: a.html })
      return a.sender.email
    } catch (e) { console.error('[ops-speaker-reminder] Graph send failed, falling back to noreply:', e instanceof Error ? e.message : e) }
  }
  const from = process.env.RESEND_FROM_EMAIL ?? 'Event Pilot <noreply@eventpilot.tresconglobal.com>'
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from, to: a.to, subject: a.subject, html: a.html })
  if (error) throw new Error(`Email failed: ${error.message}`)
  return from
}
