import { supabaseAdmin } from '@/app/lib/supabase'
import { resolveEffectiveRules } from '@/app/lib/content/resolve-validation-rules'
import { validateText, type ValidationFinding } from '@/app/lib/content/validate'
import { renderEmailTemplate } from '@/app/lib/email/render-template'

export type GuestKind = 'guest_invite' | 'guest_invite_reminder'

export const GUEST_VARIABLES: { key: string; label: string; kinds: GuestKind[] }[] = [
  { key: 'speaker_name', label: 'Speaker name (public name)', kinds: ['guest_invite', 'guest_invite_reminder'] },
  { key: 'event_name', label: 'Event name (public name)', kinds: ['guest_invite', 'guest_invite_reminder'] },
  { key: 'event_dates', label: 'Event dates as shown publicly', kinds: ['guest_invite', 'guest_invite_reminder'] },
  { key: 'event_venue', label: 'Venue as shown publicly', kinds: ['guest_invite', 'guest_invite_reminder'] },
  { key: 'pass_name', label: 'Pass name (e.g. Conference Pass)', kinds: ['guest_invite', 'guest_invite_reminder'] },
  { key: 'guest_limit', label: 'Guests allowed, in words (e.g. five)', kinds: ['guest_invite', 'guest_invite_reminder'] },
  { key: 'registration_deadline', label: 'Registration deadline', kinds: ['guest_invite', 'guest_invite_reminder'] },
  { key: 'guest_link_button', label: 'The registration-link button', kinds: ['guest_invite', 'guest_invite_reminder'] },
  { key: 'usage_summary', label: 'Where the speaker stands (reminder only)', kinds: ['guest_invite_reminder'] },
  { key: 'producer_name', label: 'Sender (the speaker’s producer)', kinds: ['guest_invite', 'guest_invite_reminder'] },
]

/** Placeholders every template must keep, per kind. */
export const REQUIRED_VARIABLES: Record<GuestKind, string[]> = {
  guest_invite: ['speaker_name', 'guest_link_button', 'guest_limit', 'registration_deadline', 'pass_name', 'producer_name'],
  guest_invite_reminder: ['speaker_name', 'guest_link_button', 'usage_summary', 'registration_deadline', 'producer_name'],
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
/** The style guide spells out single digits under ten. */
export const numberWord = (n: number) => (n >= 0 && n < 10 ? WORDS[n] : String(n))

export function formatDeadline(date: string | null): string {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00Z')
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`
}

/** One sentence on where the speaker stands, for the reminder. */
export function usageSummary(used: number, cap: number): string {
  if (used <= 0) return 'So far, no guests have registered through your link.'
  const left = Math.max(cap - used, 0)
  return `So far, ${numberWord(used)} of your ${numberWord(cap)} places ${used === 1 ? 'has' : 'have'} been taken, leaving ${numberWord(left)} available.`
}

/* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (same as the other SAE email templates) */
// The button, plus the same link as plain text underneath: email can't run a "click to copy" script, but
// plain text can be selected, copied and pasted straight into WhatsApp or a message to a guest.
export const linkButtonHtml = (url: string) =>
  `<p style="margin:20px 0 6px;"><a href="${url}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Speaker Guest Registration Link &rarr;</a></p>` +
  `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#555555;">Or copy and paste your link:<br/><span data-guest-link="1" style="word-break:break-all;color:#0D6665;">${url.replace(/&/g, '&amp;')}</span></p>`
/* eslint-enable no-restricted-syntax */

export const SKELETON: Record<GuestKind, { subject: string; body: string }> = {
  guest_invite: {
    subject: 'Speaker Guest Registration Link: {{event_name}}',
    body: `<p>Dear {{speaker_name}},</p>
<p>{{event_name}} takes place on {{event_dates}} at {{event_venue}}. As one of our speakers, you can invite your own guests to attend, and this email has your personal registration link.</p>
<p>Each guest who registers through it receives a complimentary {{pass_name}}. You can invite up to {{guest_limit}} guests, and registration closes on {{registration_deadline}}.</p>
{{guest_link_button}}
<p>Please share the link directly with the people you would like to invite. They register themselves, and each registration made through your link is connected to you.</p>
<p>If you have any questions, please reply to this email.</p>
<p>Warm regards,<br/>{{producer_name}}</p>`,
  },
  guest_invite_reminder: {
    subject: 'Speaker Guest Registration Link, reminder: {{event_name}}',
    body: `<p>Dear {{speaker_name}},</p>
<p>This is a short reminder that your personal guest registration link for {{event_name}} remains open until {{registration_deadline}}.</p>
<p>{{usage_summary}}</p>
{{guest_link_button}}
<p>Each guest who registers through the link receives a complimentary {{pass_name}}. If you would like to invite more colleagues or peers, please share the link with them before the deadline.</p>
<p>If you have any questions, please reply to this email.</p>
<p>Warm regards,<br/>{{producer_name}}</p>`,
  },
}

// The number of guests per speaker is NOT a setting: it's whatever limit the delegate team put on that speaker's code on KonfHub.
export type EventGuestSettings = { pass_name: string; deadline: string | null }

export async function loadEventGuestSettings(eventId: string): Promise<{ eventName: string; dates: string; venue: string; settings: EventGuestSettings }> {
  const { data: e } = await supabaseAdmin.from('events').select('name, public_name, public_dates_display, public_venue_display, guest_invite_pass_name, guest_invite_deadline').eq('id', eventId).single()
  return {
    eventName: (e?.public_name || e?.name || '').replace(/\s+/g, ' ').trim(),
    dates: (e?.public_dates_display ?? '').replace(/\s+/g, ' ').trim(),
    venue: (e?.public_venue_display ?? '').replace(/\s+/g, ' ').trim(),
    settings: { pass_name: e?.guest_invite_pass_name || 'Conference Pass', deadline: e?.guest_invite_deadline ?? null },
  }
}

export async function loadGuestTemplate(eventId: string, kind: GuestKind) {
  const { data } = await supabaseAdmin.from('email_templates').select('*').eq('event_id', eventId).eq('kind', kind).eq('is_active', true).maybeSingle()
  return data
}

export function guestVariables(args: { speakerName: string; eventName: string; dates: string; venue: string; settings: EventGuestSettings; cap: number; link: string; producerName: string; used?: number }): Record<string, string> {
  return {
    speaker_name: args.speakerName, event_name: args.eventName, event_dates: args.dates, event_venue: args.venue,
    pass_name: args.settings.pass_name, guest_limit: numberWord(args.cap), registration_deadline: formatDeadline(args.settings.deadline),
    guest_link_button: linkButtonHtml(args.link), usage_summary: usageSummary(args.used ?? 0, args.cap), producer_name: args.producerName,
  }
}

export function htmlToPlainText(html: string): string {
  // The pasted copy of the link is a URL, not prose — keep it out of the content-rule check.
  return html.replace(/<span data-guest-link="1"[^>]*>[\s\S]*?<\/span>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&rarr;/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim()
}

/** Checks rendered email text against the event's effective (own + umbrella) content rules. */
export async function checkEmailCompliance(eventId: string, text: string): Promise<{ errors: ValidationFinding[]; warnings: ValidationFinding[] }> {
  const rules = await resolveEffectiveRules(eventId)
  const findings = validateText(text, rules)
  return { errors: findings.filter(f => f.severity === 'error'), warnings: findings.filter(f => f.severity === 'warning') }
}

/** Renders a stored template with sample/real variables to final subject + HTML. */
export function renderGuestTemplate(template: { subject: string; body_html: string; header_image_url: string | null; header_alt_text: string | null }, vars: Record<string, string>) {
  return renderEmailTemplate(template, vars)
}

export function missingRequiredVariables(kind: GuestKind, body: string): string[] {
  return REQUIRED_VARIABLES[kind].filter(v => !new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`).test(body))
}
