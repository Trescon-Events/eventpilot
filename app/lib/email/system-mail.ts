import { Resend } from 'resend'

/* The one way to send a SYSTEM notification — an automatic email EventPilot sends about something that happened
   ("X submitted outstanding items", post went live, schedule changed…). Always from the no-reply address, for every
   event, so it never reads as coming from a staff member. (2026-10-07, per Madhu — producers were receiving these as
   "Madhukar Dudda" because the sender came from an email template's stored sender.)

   Internal only. Anything an OUTSIDER receives (speakers, clients, external approvers, guests) must read as a real Trescon
   staff member — those go out as the speaker's producer, in the speaker's thread (see speaker-thread.ts / sender-identity.ts). */

const DEFAULT_FROM = 'EventPilot <noreply@eventpilot.tresconglobal.com>'

/** The sender of every INTERNAL system notification: display name "EventPilot", the no-reply address. RESEND_FROM may be a bare address or "Name <address>"; a bare one gets the EventPilot name. */
export function systemFrom(): string {
  const raw = (process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || '').trim()
  if (!raw) return DEFAULT_FROM
  return raw.includes('<') ? raw : `EventPilot <${raw}>`
}

export async function sendSystemMail(opts: { to: string | string[]; subject: string; html: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured — system notification not sent')
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: systemFrom(), to: opts.to, subject: opts.subject, html: opts.html })
  if (error) throw new Error(`System notification failed: ${error.message}`)
}
