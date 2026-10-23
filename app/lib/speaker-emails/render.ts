import { htmlToPlainText } from '@/app/lib/guest-invites/template'

/* Speaker Emails (2026-10-23): what the speaker actually receives. The producer writes only the middle of the email; the greeting and the sign-off are added here, per speaker,
   so they can never be mangled by hand or by Polish. */

export type SpeakerAttachment = { name: string; url: string; size: number; type: string }
export const MAX_ATTACHMENTS = 10
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024 // Graph's inline-attachment ceiling is ~3 MB per message in total
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** How the email opens: "Dear <public name>," — except honorific styles, which are addressed the way protocol expects. */
export function salutationFor(publicName: string, pronounStyle: string | null | undefined): string {
  const name = publicName.trim()
  switch (pronounStyle) {
    case 'his_excellency': case 'her_excellency': return 'Dear Excellency,'
    case 'his_highness': case 'her_highness': return 'Dear Your Highness,'
    case 'honble': return `Dear Hon’ble ${name},`
    default: return name ? `Dear ${name},` : 'Dear Speaker,'
  }
}

/** The sign-off: warm and short, named for the producer the email goes out as. */
export function signOffFor(producerName: string): { closing: string; name: string } {
  return { closing: 'Warm regards,', name: producerName.trim() }
}

/** Cleans the editor's HTML down to what an email needs: paragraphs, bold/italic, lists, links. Everything else is unwrapped. */
export function cleanBodyHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(h[1-6])[^>]*>/gi, m => (m.startsWith('</') ? '</strong></p>' : '<p><strong>'))
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/\sclass="[^"]*"/gi, '')
    .trim()
}

/* eslint-disable no-restricted-syntax -- email HTML needs literal colours (clients cannot read CSS custom properties) */
const P = 'margin:0 0 14px;font-size:16px;line-height:1.65;color:#1A2530;'

/** Styles the editor's tags inline so every mail client shows them the same way. */
function styleBody(html: string): string {
  return cleanBodyHtml(html)
    .replace(/<p>/gi, `<p style="${P}">`)
    .replace(/<ul>/gi, '<ul style="margin:0 0 14px;padding-left:22px;font-size:16px;line-height:1.65;color:#1A2530;">')
    .replace(/<ol>/gi, '<ol style="margin:0 0 14px;padding-left:22px;font-size:16px;line-height:1.65;color:#1A2530;">')
    .replace(/<li>/gi, '<li style="margin:0 0 6px;">')
    .replace(/<a /gi, '<a style="color:#00807E;" ')
}

/** The full HTML document sent to one speaker. */
export function renderSpeakerEmail(args: { bodyHtml: string; publicName: string; pronounStyle?: string | null; producerName: string }): string {
  const so = signOffFor(args.producerName)
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#F0F4F8;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;">
    <p style="${P}">${esc(salutationFor(args.publicName, args.pronounStyle))}</p>
    ${styleBody(args.bodyHtml)}
    <p style="margin:22px 0 0;font-size:16px;line-height:1.65;color:#1A2530;">${esc(so.closing)}<br><strong>${esc(so.name)}</strong></p>
  </div>
</body>
</html>`
}
/* eslint-enable no-restricted-syntax */

export const wordCount = (html: string) => htmlToPlainText(html).split(/\s+/).filter(Boolean).length

/** True when the producer has actually written something (an empty editor is `<p></p>`). */
export const hasContent = (html: string) => htmlToPlainText(html).replace(/\s/g, '').length > 0

export function attachmentProblem(list: SpeakerAttachment[]): string | null {
  if (list.length > MAX_ATTACHMENTS) return `Attach at most ${MAX_ATTACHMENTS} files.`
  const total = list.reduce((n, a) => n + a.size, 0)
  if (total > MAX_ATTACHMENT_BYTES) return `The attachments add up to ${(total / 1048576).toFixed(1)} MB — keep the total under ${MAX_ATTACHMENT_BYTES / 1048576} MB.`
  return null
}
