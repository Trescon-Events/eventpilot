/* The email a client reviewer gets when a drop is shared. PURE (no database) so the producer's preview window and the server build the very same email.
   Three parts: a LOCKED greeting (personal to each reviewer), the EDITABLE middle (what the producer can reword), and a LOCKED link button + sign-off. */

export type ReviewEmailKind = 'new' | 'reminder' | 'update'
// Email HTML needs literal colours (no CSS variables in mail clients).
/* eslint-disable no-restricted-syntax */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The default wording between greeting and button: why they are getting it, what they can do, and the producer's optional note. */
export function defaultMiddle(a: { eventName: string; batchName: string; count: number; kind: ReviewEmailKind; message: string | null }): string {
  const intro = a.kind === 'reminder' ? `<p>A gentle reminder: the proposed speakers for <strong>${esc(a.eventName)}</strong> are still waiting for your decision.</p>`
    : a.kind === 'update' ? `<p>We have added to the proposed speakers for <strong>${esc(a.eventName)}</strong> (“${esc(a.batchName)}”). ${a.count} speaker${a.count === 1 ? '' : 's'} are now ready for your review.</p>`
    : `<p>Please find the proposed speakers for <strong>${esc(a.eventName)}</strong> (“${esc(a.batchName)}”, ${a.count} speaker${a.count === 1 ? '' : 's'}) ready for your review.</p>`
  return `${intro}
<p>Open the link below to see each speaker’s profile, bio, videos and LinkedIn. For every speaker you can approve or reject, and add a comment if you wish. A decision from any one of you settles that speaker; the page shows you what a colleague has already decided.</p>
${a.message ? `<p>${esc(a.message).replace(/\n/g, '<br/>')}</p>` : ''}`
}

const KEEP = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'div', 'span'])
/** What a producer typed, made safe to put in a client email: only simple formatting survives, links must be http(s)/mailto, every other attribute (styles, handlers) is dropped. */
export function sanitizeMiddle(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|head|title|meta|link)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(?:html|body)\b[^>]*>/gi, '')
    .replace(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi, (_m, close: string, tag: string, attrs: string) => {
      const t = tag.toLowerCase()
      if (!KEEP.has(t)) return ''
      if (close) return `</${t}>`
      if (t === 'a') {
        const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs)
        const url = (href?.[2] ?? href?.[3] ?? '').trim()
        return /^(https?:\/\/|mailto:)/i.test(url) ? `<a href="${url.replace(/"/g, '&quot;')}">` : '<a>'
      }
      return `<${t}>`
    })
  return cleaned.trim().slice(0, 8000)
}

/** The whole email for one reviewer. `middle` is the producer-edited wording (already sanitised) — when absent the default is used. */
export function reviewEmailHtml(a: { name: string; link: string; senderName: string; middle: string }): string {
  const first = esc(a.name.split(' ')[0] || a.name)
  return `<p id="locked-greeting">Dear ${first},</p><div id="editable">${a.middle}</div>
<p id="locked-button"><a href="${a.link}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Review the speakers &rarr;</a></p>
<p id="locked-signoff">Thank you,<br/>${esc(a.senderName)}</p>`
}
/* eslint-enable no-restricted-syntax */
