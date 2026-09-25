import { Resend } from 'resend'
import { appendFile, mkdir } from 'fs/promises'
import path from 'path'

/* Emails for the vendor portal and its ops notifications.

   In NON-production these are NOT sent: they are appended to
   .scratch/dev-mail.jsonl instead, so local testing can never email a real
   vendor by accident and the one-time codes/links can be read from disk.
   Set OPS_MAIL_SEND_IN_DEV=1 to send for real from a dev machine.

   Emails to vendors never contain documents or file links — only a notice,
   a portal link, or a one-time code/link. */

const FROM = process.env.RESEND_FROM_EMAIL ?? 'Event Pilot <noreply@eventpilot.tresconglobal.com>'
export const PORTAL_BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventpilot.tresconglobal.com').replace(/\/$/, '')
export const PORTAL_URL = `${PORTAL_BASE}/vendor-portal`

let resend: Resend | null = null
const getResend = () => (resend ??= new Resend(process.env.RESEND_API_KEY))

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

async function deliver(to: string | string[], subject: string, html: string, text: string): Promise<void> {
  const shouldSend = process.env.NODE_ENV === 'production' || process.env.OPS_MAIL_SEND_IN_DEV === '1'
  if (!shouldSend) {
    const dir = path.join(process.cwd(), '.scratch')
    await mkdir(dir, { recursive: true })
    await appendFile(path.join(dir, 'dev-mail.jsonl'), JSON.stringify({ at: new Date().toISOString(), to, subject, text }) + '\n')
    return
  }
  const { error } = await getResend().emails.send({ from: FROM, to, subject, html })
  if (error) throw new Error(`Email failed: ${error.message}`)
}

function wrap(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F0F4F8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E8EEF4;">
    <div style="background:#0F1923;padding:22px 32px;"><span style="color:#fff;font-size:16px;font-weight:800;">Trescon · Vendor Portal</span></div>
    <div style="padding:28px 32px;color:#080A0B;">
      <h2 style="font-size:20px;margin:0 0 14px;">${esc(heading)}</h2>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #E8EEF4;margin:24px 0 12px;" />
      <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin:0;">This is an automated message from Trescon. If you weren't expecting it, please contact the Trescon Ops team.</p>
    </div></div></body></html>`
}
const p = (s: string) => `<p style="color:#5B7080;font-size:15px;line-height:1.7;margin:0 0 14px;">${s}</p>`
const button = (href: string, label: string) =>
  `<p style="margin:20px 0;"><a href="${esc(href)}" style="background:#00A5A3;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block;">${esc(label)}</a></p>
   <p style="color:#94A3B8;font-size:12px;word-break:break-all;margin:0 0 6px;">Or paste this link into your browser:<br>${esc(href)}</p>`

export async function sendVendorInvite(a: { to: string; name: string; vendorName: string; link: string; hours: number }) {
  await deliver(a.to, 'Set up your Trescon Vendor Portal account',
    wrap('Set up your account', p(`Hi ${esc(a.name.split(' ')[0])}, Trescon has created a Vendor Portal account for you at <strong>${esc(a.vendorName)}</strong>. Choose your own password to get started. This link works once and expires in ${a.hours} hours.`) + button(a.link, 'Set my password')),
    `Set your Vendor Portal password (valid ${a.hours}h, single use): ${a.link}`)
}

export async function sendVendorReset(a: { to: string; name: string; link: string; hours: number }) {
  await deliver(a.to, 'Reset your Trescon Vendor Portal password',
    wrap('Reset your password', p(`Hi ${esc(a.name.split(' ')[0])}, use the button below to choose a new password. This link works once and expires in ${a.hours} hour${a.hours === 1 ? '' : 's'}. If you didn't ask for this, you can ignore this email — your password stays as it is.`) + button(a.link, 'Choose a new password')),
    `Reset your Vendor Portal password (valid ${a.hours}h, single use): ${a.link}`)
}

export async function sendVendorOtp(a: { to: string; name: string; code: string }) {
  await deliver(a.to, 'Your Trescon Vendor Portal sign-in code',
    wrap('Your sign-in code', p(`Hi ${esc(a.name.split(' ')[0])}, enter this code to finish signing in. It expires in 10 minutes.`) +
      `<p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:8px 0 18px;">${esc(a.code)}</p>` +
      p(`If you didn't try to sign in, someone may know your password — please tell the Trescon Ops team and reset it.`)),
    `Vendor Portal sign-in code: ${a.code} (expires in 10 minutes)`)
}

export async function sendVendorBatchAvailable(a: { to: string; name: string; eventName: string; batchNumber: number; speakerCount: number; expiresAt: Date; contacts: { name: string; email: string }[] }) {
  const when = a.expiresAt.toUTCString()
  const help = a.contacts.length ? p(`Questions? Contact: ${a.contacts.map(c => `${esc(c.name)} (${esc(c.email)})`).join(', ')}.`) : ''
  await deliver(a.to, `New batch available — ${a.eventName}`,
    wrap('A new batch is ready', p(`Hi ${esc(a.name.split(' ')[0])}, Batch ${a.batchNumber} for <strong>${esc(a.eventName)}</strong> (${a.speakerCount} speaker${a.speakerCount === 1 ? '' : 's'}) is available in the Vendor Portal. It stays available until <strong>${esc(when)}</strong>. Sign in to download it.`) + button(PORTAL_URL, 'Open the Vendor Portal') + help),
    `Batch ${a.batchNumber} (${a.speakerCount} speaker${a.speakerCount === 1 ? '' : 's'}) for ${a.eventName} is available until ${when}: ${PORTAL_URL}`)
}

/** Plain internal notice to Trescon staff (ops). */
export async function sendOpsNotice(a: { to: string[]; subject: string; heading: string; message: string; link?: { href: string; label: string } }) {
  if (!a.to.length) return
  await deliver(a.to, a.subject,
    wrap(a.heading, p(esc(a.message)) + (a.link ? button(a.link.href, a.link.label) : '')),
    `${a.heading}: ${a.message}${a.link ? ` ${a.link.href}` : ''}`)
}
